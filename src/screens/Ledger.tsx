import { useEffect, useState } from "react";
import { api } from "../api";
import { briefPerson, useAssistant } from "../assistant";
import { fmtDue, whenBucket } from "../format";
import { colorFor } from "../poster";
import { Icon } from "../icons";
import { allGaps, allTodos, counterpart, flags, sideOf, store, useCaptures, type Side } from "../store";
import type { TodoRef } from "../types";
import { CopyBox, Empty, GapCard, Sheet, TodoRow, toast } from "../ui";
import { Avatar, Flow, Ring } from "../visual";

type Tab = Side | "missing";
const NOBODY = "Unassigned";

// The promise ledger: what you owe people, what they owe you, grouped by person.
// `initial` comes from tapping a number on the Briefing screen.
export function Ledger({ initial, listen }: { initial?: string; listen: () => void }) {
  const captures = useCaptures();
  const [tab, setTab] = useState<Tab>(asTab(initial));
  const [showDone, setShowDone] = useState(false);
  const [task, setTask] = useState("");
  const [who, setWho] = useState("");
  const [draft, setDraft] = useState<{ person: string; side: Side; items: TodoRef[] } | null>(null);
  const a = useAssistant();
  useEffect(() => { if (initial) setTab(asTab(initial)); }, [initial]);

  const todos = allTodos(captures);
  const open = todos.filter(t => !t.done);
  const gaps = allGaps(captures).filter(g => !g.done);
  const flagged = open.filter(t => flags(t).length);
  const count = { owe: open.filter(t => sideOf(t) === "owe").length, owed: open.filter(t => sideOf(t) === "owed").length, missing: gaps.length + flagged.length };

  const shown = tab === "missing" ? [] : todos.filter(t => sideOf(t) === tab && (showDone || !t.done));
  const groups: Record<string, TodoRef[]> = {};
  shown.forEach(t => (groups[counterpart(t) ?? NOBODY] ||= []).push(t));
  const late = (ts: TodoRef[]) => ts.filter(t => !t.done && whenBucket(t.due) === "Overdue").length;
  const names = Object.keys(groups).sort((x, y) => +(x === NOBODY) - +(y === NOBODY) || late(groups[y]) - late(groups[x]) || groups[y].length - groups[x].length || x.localeCompare(y));
  const order = (ts: TodoRef[]) => [...ts].sort((x, y) => (+x.done - +y.done) || (x.due || "9").localeCompare(y.due || "9"));

  const add = (e: React.FormEvent) => {
    e.preventDefault(); if (!task.trim()) return;
    const owe = tab !== "owed";
    store.addTodo({ task: task.trim(), owner: owe ? "me" : who.trim() || null, to: owe ? who.trim() || null : "me", due: null, group: "Quick adds", priority: "medium" }, "Quick add");
    setTask(""); setWho(""); toast(owe ? "Added to what you owe" : "Added to what you're owed");
  };

  return (
    <div className="page wide">
      <div className="page-head"><p className="eyebrow">Who owes whom</p><h1>Promises</h1></div>

      <div className="segmented" role="tablist" aria-label="Show">
        <button role="tab" aria-selected={tab === "owe"} onClick={() => setTab("owe")}><Icon name="out" size={16} /> I owe <span className="n">{count.owe}</span></button>
        <button role="tab" aria-selected={tab === "owed"} onClick={() => setTab("owed")}><Icon name="in" size={16} /> Owed <span className="n">{count.owed}</span></button>
        <button role="tab" aria-selected={tab === "missing"} onClick={() => setTab("missing")}><Icon name="question" size={16} /> Missing <span className="n">{count.missing}</span></button>
      </div>

      {tab === "missing" ? (
        count.missing ? <>
          {!!flagged.length && <section className="group">
            <h3 className="h-ic"><Icon name="alert" size={15} /> Incomplete <span className="count">{flagged.length}</span></h3>
            <div className="todo-list card flush">{flagged.map(t => <TodoRow key={t.cid + t.id} t={t} />)}</div>
          </section>}
          {!!gaps.length && <section className="group">
            <h3 className="h-ic"><Icon name="question" size={15} /> Open questions <span className="count">{gaps.length}</span></h3>
            <ul className="gaps">{gaps.map(g => <GapCard key={g.cid + g.id} g={g} />)}</ul>
          </section>}
        </> : <Empty icon="check" title="Nothing missing" />
      ) : (
        <>
          <form className="quick-add two" onSubmit={add}>
            <label className="sr" htmlFor="quick">{tab === "owe" ? "What you promised" : "What they promised"}</label>
            <input id="quick" type="text" value={task} onChange={e => setTask(e.target.value)} placeholder={tab === "owe" ? "I promised to…" : "They promised to…"} />
            <label className="sr" htmlFor="quick-who">{tab === "owe" ? "To whom" : "Who"}</label>
            <input id="quick-who" type="text" value={who} onChange={e => setWho(e.target.value)} placeholder={tab === "owe" ? "To whom" : "Who"} />
            <button className="icon-btn filled" aria-label="Add promise" disabled={!task.trim()}><Icon name="plus" /></button>
          </form>

          {names.length ? <div className="ledger-grid">{names.map(n => {
            const items = order(groups[n]), live = items.filter(t => !t.done), overdue = late(items);
            const all = todos.filter(t => sideOf(t) === tab && (counterpart(t) ?? NOBODY) === n);
            const next = live.find(t => t.due);
            const keptShare = all.length ? all.filter(t => t.done).length / all.length : 0;
            return (
              <section className="person-card" key={n} aria-label={n}>
                <header className={"pc-head g-" + (n === NOBODY ? "fog" : colorFor(n))}>
                  {n === NOBODY ? <span className="av ghost" style={{ width: 56, height: 56 }}><Icon name="question" size={24} /></span> : <Avatar name={n} size={56} />}
                  <div className="pc-name">
                    <span className="pc-kick"><Icon name={tab === "owe" ? "out" : "in"} size={14} /> {tab === "owe" ? "You owe" : "Owes you"}</span>
                    <h2>{n}</h2>
                  </div>
                  <Ring value={keptShare} size={58} stroke={7} label={`${live.length} open, ${Math.round(keptShare * 100)}% kept`}><b>{live.length}</b></Ring>
                </header>
                <div className="pc-bar">
                  {overdue ? <span className="pill hot"><Icon name="alert" size={13} /> {overdue} late</span>
                    : next ? <span className="pill"><Icon name="calendar" size={13} /> {fmtDue(next.due!)}</span>
                    : live.length ? <span className="pill warm"><Icon name="calendar" size={13} /> no date</span>
                    : <span className="pill ok"><Icon name="check" size={13} /> all kept</span>}
                  {n !== NOBODY && !!live.length && (
                    <span className="row pc-actions">
                      <button className="btn small primary" onClick={() => setDraft({ person: n, side: tab, items: live })}><Icon name="send" size={14} /> {tab === "owed" ? "Nudge" : "Update"}</button>
                      <button className="btn small ghost" disabled={a.busy === "speaking"} onClick={() => briefPerson(n)} aria-label={`Hear what you and ${n} owe each other`}><Icon name="sound" size={14} /> Brief</button>
                    </span>
                  )}
                </div>
                <div className="todo-list">{items.map(t => <TodoRow key={t.cid + t.id} t={t} showOwner={false} />)}</div>
              </section>
            );
          })}</div> : <Empty icon={tab === "owe" ? "out" : "in"} title={tab === "owe" ? "You owe no one" : "No one owes you"} action={<button className="btn primary" onClick={listen}><Icon name="mic" /> Start listening</button>} />}

          <label className="toggle-row"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> <Icon name="check" size={14} /> Show kept</label>
        </>
      )}

      {draft && <DraftSheet {...draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

const asTab = (v?: string): Tab => (v === "owed" || v === "missing" ? v : "owe");

function DraftSheet({ person, side, items, onClose }: { person: string; side: Side; items: TodoRef[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const write = async () => {
    setBusy(true); setErr("");
    try {
      setText(await api.draft({ now: new Date().toString(), person, direction: side, items: items.map(t => ({ task: t.task, due: t.due, quote: t.quote ?? null })) }));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { write(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={side === "owed" ? `Nudge ${person}` : `Update ${person}`} onClose={onClose}>
      <div className="draft">
        <div className="draft-head"><Flow from={side === "owed" ? person : "me"} to={side === "owed" ? "me" : person} /><span className="pill"><Icon name="check" size={13} /> {items.length}</span></div>
        {busy && !text ? <p className="muted">Writing a draft…</p> : <CopyBox text={text} onChange={setText} onRewrite={write} busy={busy} />}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}
