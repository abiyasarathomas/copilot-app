// Captures are saved on this device (browser storage on the web, app storage on
// phones). Syncing between devices needs accounts, which is a later step.
import { useSyncExternalStore } from "react";
import type { Capture, GapRef, Todo, TodoRef } from "./types";

const KEY = "copilot.captures";
let captures: Capture[] = load();
const listeners = new Set<() => void>();

function load(): Capture[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(next: Capture[]) {
  captures = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try { localStorage.setItem(KEY, JSON.stringify(captures)); } catch { /* storage full or blocked */ }
  listeners.forEach(l => l());
}

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const store = {
  get: () => captures,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  add(c: Omit<Capture, "id" | "createdAt">) {
    const cap = { ...c, id: newId("c"), createdAt: new Date().toISOString() };
    save([cap, ...captures]);
    return cap;
  },
  remove(id: string) { save(captures.filter(c => c.id !== id)); },
  append(cid: string, add: Pick<Capture, "todos" | "gaps" | "decisions" | "people"> & { summary?: string; title?: string }) {
    save(captures.map(c => c.id !== cid ? c : {
      ...c,
      title: c.title || add.title || c.source,
      summary: [c.summary, add.summary].filter(Boolean).join(" "),
      todos: [...c.todos, ...add.todos], gaps: [...c.gaps, ...add.gaps],
      decisions: [...c.decisions, ...add.decisions], people: [...new Set([...c.people, ...add.people])],
    }));
  },
  restore(c: Capture) { save([c, ...captures.filter(x => x.id !== c.id)]); },
  setTodo(cid: string, id: string, patch: Partial<Todo>) {
    save(captures.map(c => c.id !== cid ? c : { ...c, todos: c.todos.map(t => t.id === id ? { ...t, ...patch } : t) }));
  },
  setGapDone(cid: string, id: string, done: boolean) {
    save(captures.map(c => c.id !== cid ? c : { ...c, gaps: c.gaps.map(g => g.id === id ? { ...g, done } : g) }));
  },
  addTodo(todo: Omit<Todo, "id" | "done">, source: string) {
    const t: Todo = { ...todo, id: newId("t"), done: false };
    store.add({ source, title: t.task, summary: "", decisions: [], people: [], todos: [t], gaps: [], raw: "" });
    return t;
  },
};

window.addEventListener("storage", e => { if (e.key === KEY) { captures = load(); listeners.forEach(l => l()); } });

export const useCaptures = () => useSyncExternalStore(store.subscribe, store.get);

export const allTodos = (cs: Capture[]): TodoRef[] => cs.flatMap(c => c.todos.map(t => ({ ...t, cid: c.id, from: c.title })));
export const allGaps = (cs: Capture[]): GapRef[] => cs.flatMap(c => c.gaps.map(g => ({ ...g, cid: c.id, from: c.title })));
export const isMine = (owner: string | null) => !owner || /^me$/i.test(owner);

/* ---------- the promise ledger ---------- */
export type Side = "owe" | "owed";
const isMe = (v?: string | null) => !!v && /^(me|i|myself)$/i.test(v.trim());
const tidy = (v: string) => v.trim().replace(/^\w/, c => c.toUpperCase());
/** "owe": I promised it. "owed": someone promised it (to me, usually). */
export const sideOf = (t: Todo): Side => (isMine(t.owner) ? "owe" : "owed");
/** The other person in the promise, or null if nobody is named. */
export function counterpart(t: Todo): string | null {
  if (!isMine(t.owner)) return tidy(t.owner!);
  return t.to && !isMe(t.to) ? tidy(t.to) : null;
}
/** What is missing for this promise to be kept. */
export function flags(t: Todo): string[] {
  return [!t.owner && "No owner", !t.due && "No date", sideOf(t) === "owe" && !counterpart(t) && "For whom?"].filter(Boolean) as string[];
}
export const samePerson = (a: string | null, b: string) => !!a && a.toLowerCase().split(/\s+/)[0] === b.toLowerCase().split(/\s+/)[0];

export function todayISO() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
