import { allGaps, allTodos, store } from "./store";
import type { Priority } from "./types";

export type Input = Record<string, unknown>;

// The tools Claude can use. They run here, on your device, against your saved to-dos.
export function runTool(name: string, i: Input, log: (t: string) => void): unknown {
  const caps = store.get();
  const find = (key: unknown) => {
    const [cid, id] = String(key).split("|");
    if (!caps.find(c => c.id === cid)?.todos.some(t => t.id === id)) throw new Error("No to-do with that key");
    return { cid, id };
  };
  const when = (v: unknown) => { const d = new Date(String(v)); if (isNaN(+d)) throw new Error("Bad time"); return d; };
  switch (name) {
    case "list_items":
      return {
        todos: allTodos(caps).filter(t => !t.done).map(t => ({ key: t.cid + "|" + t.id, task: t.task, owner: t.owner, due: t.due, group: t.group, priority: t.priority, remindAt: t.remindAt ?? null, from: t.from })),
        gaps: allGaps(caps).filter(g => !g.done).map(g => ({ issue: g.issue, ask: g.ask, from: g.from })),
        recent: caps.slice(0, 6).map(c => ({ title: c.title, source: c.source, summary: c.summary, decisions: c.decisions, when: c.createdAt })),
      };
    case "add_todo": {
      const t = store.addTodo({
        task: String(i.task), owner: i.owner ? String(i.owner) : "me", due: i.due ? String(i.due).slice(0, 10) : null,
        group: i.group ? String(i.group) : "Said to Co-Pilot",
        priority: (["high", "medium", "low"].includes(String(i.priority)) ? i.priority : "medium") as Priority,
        remindAt: i.remindAt ? when(i.remindAt).toISOString() : null,
      }, "Voice");
      log("Added: " + t.task);
      return "added";
    }
    case "complete_todo": {
      const { cid, id } = find(i.key); store.setTodo(cid, id, { done: true }); log("Marked done"); return "done";
    }
    case "set_reminder": {
      const { cid, id } = find(i.key); const d = when(i.remindAt);
      store.setTodo(cid, id, { remindAt: d.toISOString() });
      log("Reminder set for " + d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }));
      return "set";
    }
    default: throw new Error("Unknown tool");
  }
}

