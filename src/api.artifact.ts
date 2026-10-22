// Test build only: runs inside a Claude artifact and asks Claude through the
// artifact's built-in `sample` capability, so no server or API key is needed.
// Swapped in for ./api.ts by `npm run build:test` (see vite.config.ts).
import type Anthropic from "@anthropic-ai/sdk";
import { briefPrompt, CHAT_SYSTEM, dayPrompt, prioritizePrompt, TOOL_DEFS } from "../shared/prompts";
import type { BriefResult, Image } from "./api";
import { runTool } from "./tools";

export type { BriefResult, Image } from "./api";
export const accessCode = { get: () => "", set: (_: string) => {} };

type Sample = ((input: unknown, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: unknown, opts?: Record<string, unknown>) => Promise<T>;
};
let samplePromise: Promise<Sample | null> | null = null;
const getSample = () => (samplePromise ??= (async () => {
  const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  return ((await c?.use("sample").catch(() => null)) ?? null) as Sample | null;
})());

async function ask<T>(fn: (s: Sample) => Promise<T>): Promise<T> {
  const s = await getSample();
  if (!s) throw new Error("Open this test version on claude.ai to use Claude.");
  try { return await fn(s); }
  catch (e) {
    const code = (e as { code?: string }).code;
    throw new Error(code === "not_granted" ? "Co-Pilot needs permission to use Claude. Allow it from the Permissions menu and try again."
      : code === "rate_limited" ? "Too many requests just now. Try again in a minute."
      : "Claude couldn't finish that. Try again.");
  }
}

const toBlob = (img: Image) => new Blob([Uint8Array.from(atob(img.data), c => c.charCodeAt(0))], { type: img.media_type });

const BRIEF_SHAPE = `Return ONLY JSON: {"title": string, "summary": string, "decisions": [string], "people": [string], "todos": [{"task": string, "owner": string|null, "due": "YYYY-MM-DD"|null, "group": string, "priority": "high"|"medium"|"low"}], "gaps": [{"issue": string, "ask": string}]}`;

export const api = {
  brief: (b: { text: string; source: string; today: string; existingGroups: string[]; images: Image[] }) => ask(async s => {
    const r = await s.json<Partial<BriefResult>>(briefPrompt({ ...b, imageCount: b.images.length }) + "\n\n" + BRIEF_SHAPE,
      { modelTier: "default", ...(b.images.length ? { images: b.images.map(toBlob) } : {}) });
    return {
      title: String(r.title || b.source), summary: String(r.summary || ""),
      decisions: (r.decisions || []).map(String), people: (r.people || []).map(String),
      todos: (r.todos || []).map(t => ({ task: String(t.task), owner: t.owner || null, due: t.due || null, group: t.group || "General",
        priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium" as const })),
      gaps: (r.gaps || []).map(g => ({ issue: String(g.issue), ask: String(g.ask || "") })),
    };
  }),
  day: (b: { now: string; recent: unknown[]; todos: unknown[]; gaps: unknown[] }) =>
    ask(async s => (await s(dayPrompt(b), { modelTier: "default", cache: false })).text.trim()),
  prioritize: (b: { now: string; items: { key: string; [k: string]: unknown }[] }) =>
    ask(async s => {
      const r = await s.json<{ order?: { key: string; why: string }[] }>(prioritizePrompt(b) + '\nReturn ONLY JSON: {"order":[{"key": string, "why": string}]}', { modelTier: "default" });
      return { order: (r.order || []).map(o => ({ key: String(o.key), why: String(o.why || "") })) };
    }),
  chat: (b: { now: string; messages: Anthropic.Beta.BetaMessageParam[] }, log: (t: string) => void = () => {}) =>
    ask(async s => {
      // The artifact runs the whole tool loop itself, so send plain text turns only.
      const turns = b.messages.flatMap(m => {
        const text = typeof m.content === "string" ? m.content
          : (m.content ?? []).flatMap(c => (c.type === "text" ? [c.text] : [])).join("");
        return text ? [{ role: m.role, content: text }] : [];
      });
      turns[0] = { ...turns[0], content: `${CHAT_SYSTEM}\nNow: ${b.now}.\n\nUser: ${turns[0].content}` };
      const tools = TOOL_DEFS.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema,
        execute: (i: Record<string, unknown>) => runTool(t.name, i, log) }));
      const r = await s(turns, { tools, modelTier: "default", cache: false });
      return { content: [{ type: "text", text: r.text, citations: null }] as Anthropic.Beta.BetaContentBlock[], stop_reason: "end_turn" };
    }),
};
