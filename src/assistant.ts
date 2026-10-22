// The always-on assistant: listens, watches the screen, turns what it picks up into
// to-dos, decisions and missing pieces on its own, and speaks only when asked.
import type Anthropic from "@anthropic-ai/sdk";
import { useSyncExternalStore } from "react";
import { api, type BriefResult, type Image } from "./api";
import { read, write } from "./format";
import { canListen, listen, speak, startEar, stopSpeaking, watchScreen } from "./native";
import { allGaps, allTodos, counterpart, flags, newId, samePerson, sideOf, store, todayISO } from "./store";
import { runTool, type Input, type Log } from "./tools";
import type { Todo } from "./types";

export type FeedKind = "todo" | "gap" | "decision" | "you" | "copilot" | "info" | "draft";
export type FeedItem = { id: string; at: string; kind: FeedKind; text: string; via?: "heard" | "screen"; who?: string };

type State = {
  listening: boolean; listeningSince: string | null;
  watching: boolean;
  caption: string;           // words being heard right now
  awaiting: boolean;         // "Co-Pilot" was said; the next sentence is a question
  busy: "" | "thinking" | "reading" | "speaking";
  feed: FeedItem[];
  error: string;
  demo: boolean;
};

let state: State = {
  listening: false, listeningSince: null, watching: false, caption: "", awaiting: false,
  busy: "", feed: read<FeedItem[]>("copilot.feed", []), error: "", demo: false,
};
const subs = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (patch.feed) write("copilot.feed", state.feed.slice(0, 200));
  subs.forEach(s => s());
}
export const useAssistant = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);

export const settings = {
  get speakReplies() { return read("copilot.speak", true); },
  set speakReplies(v: boolean) { write("copilot.speak", v); },
  get announce() { return read("copilot.announce", false); },
  set announce(v: boolean) { write("copilot.announce", v); },
  /** Say a short consent line out loud whenever listening starts. */
  get consent() { return read("copilot.consent", true); },
  set consent(v: boolean) { write("copilot.consent", v); },
};
export const CONSENT_LINE = "Quick note: I'm Co-Pilot, taking notes of what's agreed. No audio is saved.";

const feed = (kind: FeedKind, text: string, via?: FeedItem["via"], who?: string) =>
  set({ feed: [{ id: newId("f"), at: new Date().toISOString(), kind, text, via, who }, ...state.feed].slice(0, 200) });
const logTo: Log = (text, kind = "info", who) => feed(kind, text, undefined, who);
export const clearFeed = () => set({ feed: [] });

/* ---------- speaking (the ear pauses so Co-Pilot doesn't hear itself) ---------- */
let stopEar: (() => void) | null = null;
async function say(text: string) {
  set({ busy: "speaking" });
  const resume = !!stopEar;
  stopEar?.(); stopEar = null;
  // Some browsers never report the end of speech, so don't wait forever.
  await new Promise<void>(r => { speak(text, r); setTimeout(r, 4000 + text.length * 90); });
  if (state.busy === "speaking") set({ busy: "" });
  if (resume && state.listening && !state.demo) bootEar();
}
export function hush() { stopSpeaking(); if (state.busy === "speaking") set({ busy: "" }); }

/* ---------- turning what was heard or seen into data ---------- */
let sessionId: string | null = null;
let chunk = "";
let lastFlush = Date.now();

async function extract(text: string, via: "heard" | "screen", images: Image[] = []) {
  const caps = store.get();
  set({ busy: state.busy || "reading" });
  let r: BriefResult;
  try {
    r = await api.brief({
      text, images, live: true, today: todayISO(),
      source: via === "screen" ? "Screen" : "Conversation",
      existingGroups: [...new Set(allTodos(caps).map(t => t.group))],
      existingTasks: [...allTodos(caps).filter(t => !t.done).map(t => t.task), ...allGaps(caps).filter(g => !g.done).map(g => g.issue)],
    });
  } catch (e) {
    feed("info", (e as Error).message);
    return;
  } finally { if (state.busy === "reading") set({ busy: "" }); }

  const todos = r.todos.map(t => ({ ...t, id: newId("t"), group: t.group || "General", done: false }));
  const gaps = r.gaps.map(g => ({ ...g, id: newId("g"), done: false }));
  if (!todos.length && !gaps.length && !r.decisions.length) return;
  const sid = via === "screen" ? screenSessionId : sessionId;
  if (sid && store.get().some(c => c.id === sid)) {
    store.append(sid, { todos, gaps, decisions: r.decisions, people: r.people, summary: r.summary });
  } else {
    const c = store.add({ source: via === "screen" ? "Screen" : "Conversation", title: r.title, summary: r.summary, decisions: r.decisions, people: r.people, todos, gaps, raw: "" });
    if (via === "screen") screenSessionId = c.id; else sessionId = c.id;
  }
  r.decisions.forEach(d => feed("decision", d, via));
  gaps.forEach(g => feed("gap", g.issue, via));
  todos.forEach(t => feed("todo", promiseLine(t), via));
  if (settings.announce) {
    const n = todos.length + gaps.length;
    if (n) say(`Picked up ${n} thing${n > 1 ? "s" : ""}. ${todos[0]?.task ?? gaps[0]?.issue}.`);
  }
}

/** "Sam owes you: the shortlist" / "You owe Priya: the sheet". */
export function promiseLine(t: Todo) {
  const who = counterpart(t);
  return sideOf(t) === "owed" ? `${who} owes you: ${t.task}` : who ? `You owe ${who}: ${t.task}` : t.task;
}

function flush(force = false) {
  const text = chunk.trim();
  const due = text.length > 1400 || (text.length > 160 && Date.now() - lastFlush > 75000);
  if (!text || (!force && !due)) return;
  chunk = ""; lastFlush = Date.now();
  return extract(text, "heard");
}

const WAKE = /\bco[\s-]?pilot\b[\s,.!?:]*(.*)$/i;
// A question first picks up whatever was just said, so the answer includes it.
const answer = (q: string) => Promise.resolve(flush(true)).then(() => askCopilot(q, true));
function hearSentence(t: string) {
  if (state.awaiting) { set({ awaiting: false, caption: "" }); answer(t); return; }
  const m = t.match(WAKE);
  if (m) {
    const q = m[1].trim();
    if (q.split(/\s+/).length >= 2) answer(q);
    else set({ awaiting: true });
    return;
  }
  chunk += (chunk ? " " : "") + t;
  set({ caption: "" });
  flush();
}

/* ---------- listen mode ---------- */
let flushTimer: ReturnType<typeof setInterval> | null = null;
function bootEar() {
  stopEar = startEar(hearSentence, t => set({ caption: t }), msg => { set({ error: msg }); stopListening(); });
}
export function startListening() {
  if (state.listening) return;
  if (!canListen) { set({ error: "The microphone isn't available here. Try the demo, or open the installed app." }); return; }
  sessionId = null; chunk = ""; lastFlush = Date.now();
  set({ listening: true, listeningSince: new Date().toISOString(), error: "", caption: "" });
  // Consent first: say who is taking notes before hearing anyone.
  if (settings.consent) say(CONSENT_LINE).then(() => { if (state.listening && !stopEar) bootEar(); });
  else bootEar();
  flushTimer = setInterval(() => flush(), 15000);
}
export function stopListening() {
  stopEar?.(); stopEar = null;
  if (flushTimer) clearInterval(flushTimer); flushTimer = null;
  set({ listening: false, listeningSince: null, caption: "", awaiting: false });
  flush(true);
}

/* ---------- screen mode ---------- */
let stopScreen: (() => void) | null = null;
let screenSessionId: string | null = null;
export async function startWatching() {
  try {
    screenSessionId = null;
    stopScreen = await watchScreen(img => extract("(The user's screen right now. Pick up only work they need to act on.)", "screen", [img]), () => { stopScreen = null; set({ watching: false }); });
    set({ watching: true, error: "" });
  } catch { /* picker cancelled */ }
}
export function stopWatching() { stopScreen?.(); stopScreen = null; set({ watching: false }); }

/* ---------- talking ---------- */
let history: Anthropic.Beta.BetaMessageParam[] = [];
export async function askCopilot(text: string, spoken = false) {
  text = text.trim(); if (!text) return;
  hush(); feed("you", text); set({ busy: "thinking" });
  const turns: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: text }];
  const log = logTo;
  try {
    for (let step = 0; step < 6; step++) {
      const r = await api.chat({ now: new Date().toString(), messages: turns }, log);
      turns.push({ role: "assistant", content: r.content });
      if (r.stop_reason !== "tool_use") {
        const reply = r.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim() || "Done.";
        feed("copilot", reply);
        history = turns.slice(-20);
        while (history[0] && (history[0].role !== "user" || typeof history[0].content !== "string")) history.shift();
        set({ busy: "" });
        if (spoken || settings.speakReplies) await say(reply);
        return;
      }
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = r.content.flatMap(b => {
        if (b.type !== "tool_use") return [];
        try { return [{ type: "tool_result" as const, tool_use_id: b.id, content: JSON.stringify(runTool(b.name, (b.input ?? {}) as Input, log)) }]; }
        catch (e) { return [{ type: "tool_result" as const, tool_use_id: b.id, content: (e as Error).message, is_error: true }]; }
      });
      turns.push({ role: "user", content: results });
    }
  } catch (e) { feed("info", (e as Error).message); }
  set({ busy: "" });
}

/** Push to talk: hear one question and answer it out loud. */
export async function talkOnce() {
  hush();
  if (state.listening) { set({ awaiting: true }); return; }
  if (!canListen) { set({ error: "The microphone isn't available here. Try the demo, or open the installed app." }); return; }
  try {
    set({ awaiting: true });
    const r = await listen(t => set({ caption: t }));
    const said = await r.done;
    set({ awaiting: false, caption: "" });
    if (said.trim()) await askCopilot(said, true);
  } catch (e) { set({ awaiting: false, caption: "", error: (e as Error).message }); }
}

/** Today's brief, read out loud. */
export async function briefMe() {
  const caps = store.get();
  const open = allTodos(caps).filter(t => !t.done), gaps = allGaps(caps).filter(g => !g.done);
  if (!open.length && !gaps.length) { const t = "Nothing open yet. Turn on listening during your next meeting and I'll pick things up."; feed("copilot", t); await say(t); return; }
  hush(); set({ busy: "thinking" });
  try {
    const text = await api.day({
      now: new Date().toString(),
      recent: caps.slice(0, 8).map(c => ({ title: c.title, source: c.source, summary: c.summary, decisions: c.decisions })),
      todos: open.map(t => ({ task: t.task, owner: t.owner, to: t.to ?? null, due: t.due, priority: t.priority, missing: flags(t) })),
      gaps: gaps.map(({ issue, ask, from }) => ({ issue, ask, from })),
    });
    write("copilot.day", { date: todayISO(), text });
    feed("copilot", text); set({ busy: "" });
    await say(text);
  } catch (e) { set({ busy: "" }); feed("info", (e as Error).message); }
}

/** Before meeting someone: what you owe them and what they owe you, read out. No AI needed. */
export async function briefPerson(name: string) {
  const open = allTodos(store.get()).filter(t => !t.done && samePerson(counterpart(t), name));
  const owe = open.filter(t => sideOf(t) === "owe"), owed = open.filter(t => sideOf(t) === "owed");
  const list = (ts: Todo[]) => ts.map(t => t.task + (t.due ? `, due ${new Date(t.due + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}` : ", no date yet")).join("; ");
  const text = !open.length ? `Nothing open with ${name}.`
    : [`Before you meet ${name}.`, owe.length && `You owe them ${owe.length === 1 ? "one thing" : owe.length + " things"}: ${list(owe)}.`,
      owed.length && `They owe you ${owed.length === 1 ? "one thing" : owed.length + " things"}: ${list(owed)}.`,
      open.some(t => !t.due) && "Ask for dates on anything without one."].filter(Boolean).join(" ");
  hush(); feed("copilot", text, undefined, name);
  await say(text);
}

/* ---------- demo: plays a short meeting through the same pipeline ---------- */
const DEMO = [
  "Okay let's get started, thanks everyone for joining the Tuesday sync.",
  "Priya here, the Q4 budget got approved but finance wants the revised sheet by Friday.",
  "I can send that over to finance by Friday.",
  "Great. Sam, can you put together the vendor shortlist?",
  "Sure, I'll draft the vendor shortlist, not sure when though.",
  "We agreed to move the launch review to next week.",
  "Someone needs to book a room for that.",
  "Also, do we still need legal sign-off for the pilot? Nobody knows.",
  "Co-Pilot, who owes me what?",
];
export async function playDemo() {
  if (state.demo || state.listening) return;
  sessionId = null; chunk = ""; lastFlush = Date.now();
  set({ demo: true, listening: true, listeningSince: new Date().toISOString(), error: "" });
  if (settings.consent) { feed("copilot", CONSENT_LINE); await say(CONSENT_LINE); }
  for (const line of DEMO) {
    for (let i = 1; i <= line.length; i += 3) { set({ caption: line.slice(0, i) }); await new Promise(r => setTimeout(r, 35)); }
    set({ caption: "" });
    hearSentence(line);
    await new Promise(r => setTimeout(r, 400));
  }
  set({ demo: false, listening: false, listeningSince: null });
  flush(true);
}
