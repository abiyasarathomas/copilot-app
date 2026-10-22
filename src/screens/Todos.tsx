import { useEffect, useState } from "react";
import { whenBucket } from "../format";
import { Icon } from "../icons";
import { allGaps, allTodos, isMine, store, useCaptures } from "../store";
import type { TodoRef } from "../types";
import { Empty, GapCard, TodoRow, toast } from "../ui";

type View = "topic" | "when" | "person";
type Who = "all" | "mine" | "others";

// `initial` comes from tapping a number on Today: mine, others, when or gaps.
export function Todos({ initial, capture }: { initial?: string; capture: () => void }) {
  const captures = useCaptures();
  const [tab, setTab] = useState<"todos" | "gaps">(initial === "gaps" ? "gaps" : "todos");
  const [view, setView] = useState<View>(initial === "when" ? "when" : "topic");
  const [who, setWho] = useState<Who>(initial === "mine" ? "mine" : initial === "others" ? "others" : "all");
  const [showDone, setShowDone] = useState(false);
  const [task, setTask] = useState("");

  useEffect(() => {
    if (!initial) return;
    setTab(initial === "gaps" ? "gaps" : "todos");
    if (initial === "when") setView("when");
    setWho(initial === "mine" ? "mine" : initial === "others" ? "others" : "all");
  }, [initial]);

  const todos = allTodos(captures).filter(t => (showDone || !t.done) && (who === "all" || (who === "mine") === isMine(t.owner)));
  const gaps = allGaps(captures).filter(g => !g.done);

  const keyOf = (t: TodoRef) => view === "when" ? whenBucket(t.due) : view === "person" ? (isMine(t.owner) ? "Me" : t.owner!) : (t.group || "General");
  const rank: Record<string, number> = { Overdue: 0, Today: 1, "This week": 2, Later: 3, "No date": 4, Me: -1 };
  const prio = { high: 0, medium: 1, low: 2 };
  const groups: Record<string, TodoRef[]> = {};
  todos.forEach(t => (groups[keyOf(t)] ||= []).push(t));
  const names = Object.keys(groups).sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9) || a.localeCompare(b));

  const add = (e: React.FormEvent) => {
    e.preventDefault(); if (!task.trim()) return;
    store.addTodo({ task: task.trim(), owner: "me", due: null, group: "Quick adds", priority: "medium" }, "Quick add");
    setTask(""); toast("Added to Quick adds");
  };

  return (
    <div className="page">
      <div className="page-head"><h1>To-dos</h1></div>

      <div className="segmented" role="tablist" aria-label="Show">
        <button role="tab" aria-selected={tab === "todos"} onClick={() => setTab("todos")}>To-dos</button>
        <button role="tab" aria-selected={tab === "gaps"} onClick={() => setTab("gaps")}>Missing pieces{gaps.length ? ` (${gaps.length})` : ""}</button>
      </div>

      {tab === "gaps" ? (
        gaps.length ? <ul className="gaps">{gaps.map(g => <GapCard key={g.cid + g.id} g={g} />)}</ul>
          : <Empty icon="check" title="Nothing missing">When Co-Pilot spots a task with no owner, no date or an open question, it lands here.</Empty>
      ) : (
        <>
          <form className="quick-add" onSubmit={add}>
            <label className="sr" htmlFor="quick">New to-do</label>
            <input id="quick" type="text" value={task} onChange={e => setTask(e.target.value)} placeholder="Add a to-do" />
            <button className="icon-btn filled" aria-label="Add to-do" disabled={!task.trim()}><Icon name="plus" /></button>
          </form>

          <div className="filters">
            <div className="chips" role="group" aria-label="Whose">
              {([["all", "Everyone"], ["mine", "Mine"], ["others", "Waiting on others"]] as const).map(([v, l]) =>
                <button key={v} className="chip" aria-pressed={who === v} onClick={() => setWho(v)}>{l}</button>)}
            </div>
            <label className="select">
              <span className="sr">Group by</span>
              <select value={view} onChange={e => setView(e.target.value as View)}>
                <option value="topic">By topic</option>
                <option value="when">By due date</option>
                <option value="person">By person</option>
              </select>
            </label>
          </div>

          {names.length ? names.map(n => {
            const items = groups[n].sort((a, b) => (+a.done - +b.done) || (prio[a.priority] - prio[b.priority]) || (a.due || "9").localeCompare(b.due || "9"));
            return (
              <section className="group" key={n}>
                <h3>{n} <span className="count">{items.filter(t => !t.done).length}</span></h3>
                <div className="todo-list card flush">{items.map(t => <TodoRow key={t.cid + t.id} t={t} showGroup={view !== "topic"} showOwner={view !== "person"} />)}</div>
              </section>
            );
          }) : <Empty icon="list" title={who === "all" ? "No to-dos yet" : "Nothing here"} action={<button className="btn primary" onClick={capture}><Icon name="mic" /> Start listening</button>}>
            Turn on listening in a meeting and the to-dos Co-Pilot hears show up here.
          </Empty>}

          <label className="toggle-row"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show finished</label>
        </>
      )}
    </div>
  );
}
