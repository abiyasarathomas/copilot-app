import { allGaps, allTodos, counterpart, flags, samePerson, sideOf, store } from "./store";
import type { Priority } from "./types";

export type Input = Record<string, unknown>;
/** What a tool shows the user: a short note, or a drafted message to copy. */
export type Log = (text: string, kind?: "info" | "draft", who?: string) => void;

// The tools Claude can use. They run here, on your device, against your saved promises.
export function runTool(name: string, i: Input, log: Log): unknown {
  const caps = store.get();
  const find = (key: unknown) => {
    const [cid, id] = String(key).split("|");
    if (!caps.find(c => c.id === cid)?.todos.some(t => t.id === id)) throw new Error("No to-do with that key");
    return { cid, id };
  };
  const when = (v: unknown) => { const d = new Date(String(v)); if (isNaN(+d)) throw new Error("Bad time"); return d; };
  switch (name) {
    case "list_items": {
      const person = i.person ? String(i.person) : "";
      const todos = allTodos(caps).filter(t => !t.done && (!person || samePerson(counterpart(t), person) || samePerson(t.to ?? null, person)));
      return {
        ...(person ? { person } : {}),
        todos: todos.map(t => ({
          key: t.cid + "|" + t.id, task: t.task,
          direction: sideOf(t) === "owe" ? "I owe" : "owed to me", person: counterpart(t), owner: t.owner, to: t.to ?? null,
          due: t.due, priority: t.priority, missing: flags(t), said: t.quote ?? null, remindAt: t.remindAt ?? null, from: t.from,
        })),
        gaps: allGaps(caps).filter(g => !g.done && (!person || (g.issue + " " + g.ask).toLowerCase().includes(person.toLowerCase().split(/\s+/)[0])))
          .map(g => ({ issue: g.issue, ask: g.ask, from: g.from })),
        recent: person ? [] : caps.slice(0, 6).map(c => ({ title: c.title, source: c.source, summary: c.summary, decisions: c.decisions, when: c.createdAt })),
      };
    }
    case "add_todo": {
      const t = store.addTodo({
        task: String(i.task), owner: i.owner ? String(i.owner) : "me", to: i.to ? String(i.to) : null, due: i.due ? String(i.due).slice(0, 10) : null,
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
    case "show_draft":
      log(String(i.text), "draft", String(i.person || ""));
      return "shown with a copy button";
    default: throw new Error("Unknown tool");
  }
}
