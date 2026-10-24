// Calls to our own server, which talks to Claude. On the web the server is the
// same site; the phone apps need VITE_API_BASE set to the deployed address.
import type Anthropic from "@anthropic-ai/sdk";
import { language } from "./lang";
import type { Log } from "./tools";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export const accessCode = {
  get: () => { try { return localStorage.getItem("copilot.code") || ""; } catch { return ""; } },
  set: (v: string) => { try { localStorage.setItem("copilot.code", v); } catch { /* ignore */ } },
};

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Copilot-Code": accessCode.get() },
      // Every request says which language the user talks in.
      body: JSON.stringify({ ...(body as object), lang: language.get() }),
    });
  } catch {
    throw new Error("Can't reach the Co-Pilot server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export interface BriefResult {
  title: string; summary: string; decisions: string[]; people: string[];
  todos: { task: string; owner: string | null; to: string | null; quote: string | null; due: string | null; group: string; priority: "high" | "medium" | "low" }[];
  gaps: { issue: string; ask: string }[];
}
export type BriefInput = { text: string; source: string; today: string; existingGroups: string[]; images: Image[]; existingTasks?: string[]; live?: boolean };
export type DraftInput = { now: string; person: string; direction: "owe" | "owed"; items: { task: string; due: string | null; quote?: string | null }[] };
export type Image = { media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };

export const api = {
  brief: (b: BriefInput) => post<BriefResult>("brief", b),
  day: (b: { now: string; recent: unknown[]; todos: unknown[]; gaps: unknown[] }) => post<string>("day", b),
  draft: (b: DraftInput) => post<string>("draft", b),
  prioritize: (b: { now: string; items: { key: string; [k: string]: unknown }[] }) => post<{ order: { key: string; why: string }[] }>("prioritize", b),
  // `log` is only used by the in-Claude test build, which runs the tools itself.
  chat: (b: { now: string; messages: Anthropic.Beta.BetaMessageParam[] }, _log?: Log) =>
    post<{ content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null }>("chat", b),
};
