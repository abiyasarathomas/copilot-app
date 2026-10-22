import { useEffect, useState } from "react";
import { api } from "./api";
import { canSpeak, speak, syncReminders, webNotify } from "./native";
import { allGaps, allTodos, isMine, store, todayISO, useCaptures } from "./store";
import type { TodoRef } from "./types";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDue = (due: string) => new Date(due + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const localInput = (iso?: string | null) => { const d = iso ? new Date(iso) : new Date(Date.now() + 36e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function whenBucket(due: string | null) {
  if (!due) return "No date";
  const days = Math.round((+new Date(due + "T00:00:00") - +new Date(todayISO() + "T00:00:00")) / 864e5);
  return days < 0 ? "Overdue" : days === 0 ? "Today" : days <= 7 ? "This week" : "Later";
}

type Focus = { at: string; order: { key: string; why: string; text: string; kind: string }[] };
const loadFocus = (): Focus | null => { try { return JSON.parse(localStorage.getItem("copilot.focus") || "null"); } catch { return null; } };

export function Board() {
  const captures = useCaptures();
  const todos = allTodos(captures), gaps = allGaps(captures);
  const open = todos.filter(t => !t.done), mine = open.filter(t => isMine(t.owner));
  const openGaps = gaps.filter(g => !g.done);

  const [day, setDay] = useState(""); const [dayBusy, setDayBusy] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(loadFocus); const [prioBusy, setPrioBusy] = useState(false);
  const [groupBy, setGroupBy] = useState<"group" | "when" | "owner">("group");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Reminders: check every 30s while open; on phones they're also scheduled with the OS.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const due = open.filter(t => t.remindAt && +new Date(t.remindAt) <= now);
  useEffect(() => { webNotify(due); }, [due.map(t => t.id + t.remindAt).join()]);
  useEffect(() => { syncReminders(todos); }, [todos.map(t => t.id + t.remindAt + t.done).join()]);

  const writeDay = async () => {
    if (!open.length && !openGaps.length) { setDay("Nothing open right now. Capture a meeting or add a to-do first."); return; }
    setDayBusy(true); setDay("Thinking…");
    try {
      const text = await api.day({
        now: new Date().toString(),
        recent: captures.slice(0, 8).map(c => ({ title: c.title, source: c.source, summary: c.summary, decisions: c.decisions })),
        todos: open.map(({ task, owner, due, group, priority }) => ({ task, owner, due, group, priority })),
        gaps: openGaps.map(({ issue, ask, from }) => ({ issue, ask, from })),
      });
      setDay(text);
    } catch (e) { setDay((e as Error).message); }
    finally { setDayBusy(false); }
  };

  const prioritize = async () => {
    const items = [
      ...open.map(t => ({ key: "t|" + t.cid + "|" + t.id, kind: "task", text: t.task, owner: t.owner, due: t.due, priority: t.priority, from: t.from })),
      ...openGaps.map(g => ({ key: "g|" + g.cid + "|" + g.id, kind: "missing piece", text: g.issue, ask: g.ask, from: g.from })),
    ];
    if (!items.length) return;
    setPrioBusy(true);
    try {
      const r = await api.prioritize({ now: new Date().toString(), items });
      const byKey = Object.fromEntries(items.map(i => [i.key, i]));
      const f: Focus = { at: new Date().toISOString(), order: r.order.filter(o => byKey[o.key]).map(o => ({ ...o, text: byKey[o.key].text, kind: byKey[o.key].kind })) };
      setFocus(f);
      try { localStorage.setItem("copilot.focus", JSON.stringify(f)); } catch { /* ignore */ }
    } catch (e) { alert((e as Error).message); }
    finally { setPrioBusy(false); }
  };

  const live = new Set([...open.map(t => "t|" + t.cid + "|" + t.id), ...openGaps.map(g => "g|" + g.cid + "|" + g.id)]);
  const keyOf = (t: TodoRef) => groupBy === "when" ? whenBucket(t.due) : groupBy === "owner" ? (isMine(t.owner) ? "Me" : t.owner!) : (t.group || "General");
  const rank: Record<string, number> = { Overdue: 0, Today: 1, "This week": 2, Later: 3, "No date": 4, Me: -1 };
  const prio = { high: 0, medium: 1, low: 2 };
  const groups: Record<string, TodoRef[]> = {};
  todos.filter(t => showDone || !t.done).forEach(t => (groups[keyOf(t)] ||= []).push(t));
  const names = Object.keys(groups).sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9) || a.localeCompare(b));

  return (
    <>
      <section className="panel" aria-labelledby="dayH">
        <div className="row between"><h2 id="dayH">Your brief</h2>
          <div className="row">
            {day && canSpeak && <button className="ghost" onClick={() => speak(day)}>Read aloud</button>}
            <button className="ghost" disabled={dayBusy} onClick={writeDay}>Write today's brief</button>
          </div>
        </div>
        <div className="stats">
          <span><b>{mine.length}</b> on me</span><span><b>{open.length - mine.length}</b> waiting on others</span>
          <span><b>{open.filter(t => whenBucket(t.due) === "Overdue").length}</b> overdue</span><span><b>{openGaps.length}</b> gaps</span>
        </div>
        {!!due.length && <div className="due-banner"><b>Reminder{due.length > 1 ? "s" : ""}</b>
          {due.map(t => <span key={t.id}>{t.task} <button className="linkbtn" onClick={() => store.setTodo(t.cid, t.id, { remindAt: new Date(Date.now() + 36e5).toISOString() })}>Snooze 1 hour</button></span>)}
        </div>}
        <p className={"brief" + (day ? "" : " empty")}>{day || "Capture a meeting or conversation, then ask for today's brief. It pulls your open to-dos and gaps into a short plan for the day."}</p>
        {!!focus?.order.length && <div>
          <div className="row between"><span className="label">Focus order</span><span className="status">ranked {fmt(focus.at)}</span></div>
          <ol className="focus">{focus.order.map(o => (
            <li key={o.key} style={live.has(o.key) ? undefined : { textDecoration: "line-through", color: "var(--muted)" }}>
              {o.text}<span className="why">{o.kind === "missing piece" ? "Missing piece. " : ""}{o.why}</span></li>
          ))}</ol>
        </div>}
      </section>

      <section className="panel" aria-labelledby="gapH">
        <div className="row between"><h2 id="gapH">Missing pieces</h2><span className="label">Chase these</span></div>
        <ul className="gaps">{openGaps.length ? openGaps.map(g => (
          <li key={g.cid + g.id}><span className="from">{g.from}</span><span className="issue">{g.issue}</span><span className="ask">{g.ask}</span>
            <span><button className="linkbtn" onClick={() => store.setGapDone(g.cid, g.id, true)}>Mark sorted</button></span></li>
        )) : <li className="empty-state" style={{ background: "none" }}>No open gaps. When Co-Pilot spots a task with no owner, no date, or an open question, it lands here.</li>}</ul>
      </section>

      <section className="panel" aria-labelledby="todoH">
        <div className="row between">
          <div className="row"><h2 id="todoH">To-dos</h2><button className="ghost" disabled={prioBusy} onClick={prioritize}>{prioBusy ? "Ranking…" : "Prioritize for me"}</button></div>
          <div className="row" role="group" aria-label="Group by">
            {([["group", "By topic"], ["when", "By due date"], ["owner", "By person"]] as const).map(([v, l]) =>
              <button key={v} className="pill" aria-pressed={groupBy === v} onClick={() => setGroupBy(v)}>{l}</button>)}
          </div>
        </div>
        {names.length ? names.map(n => {
          const items = groups[n].sort((a, b) => (+a.done - +b.done) || (prio[a.priority] - prio[b.priority]) || (a.due || "9").localeCompare(b.due || "9"));
          return <div className="group" key={n}><h3>{n} <span className="n">{items.filter(t => !t.done).length}</span></h3>
            {items.map(t => {
              const b = whenBucket(t.due), k = t.cid + "|" + t.id;
              return <div className={"todo" + (t.done ? " done" : "")} key={k}>
                <input type="checkbox" checked={t.done} aria-label={"Done: " + t.task} onChange={e => store.setTodo(t.cid, t.id, { done: e.target.checked })} />
                <div className="t"><div className="task">{t.task}</div>
                  <div className="meta">
                    {groupBy !== "owner" && (t.owner ? <span>{t.owner}</span> : <span className="warn">no owner</span>)}
                    {t.due ? <span className={b === "Overdue" || b === "Today" ? "warn" : ""}>due {fmtDue(t.due)}</span> : <span className="warn">no date</span>}
                    {groupBy !== "group" && <span>{t.group}</span>}
                    <span>from {t.from}</span>
                    {t.remindAt && <span className="bell">reminder {fmt(t.remindAt)}</span>}
                    {!t.done && <button className="linkbtn" onClick={() => setEditing(editing === k ? null : k)}>{t.remindAt ? "Change" : "Remind me"}</button>}
                  </div>
                  {editing === k && <ReminderEditor t={t} close={() => setEditing(null)} />}
                </div>
                <span className={"pri " + t.priority}>{t.priority}</span>
              </div>;
            })}</div>;
        }) : <div className="empty-state">Your to-dos appear here, grouped by topic, due date or person.</div>}
        <label className="row hint"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show finished</label>
      </section>
    </>
  );
}

function ReminderEditor({ t, close }: { t: TodoRef; close: () => void }) {
  const [v, setV] = useState(localInput(t.remindAt));
  return <div className="remind">
    <input type="datetime-local" value={v} onChange={e => setV(e.target.value)} aria-label="Reminder time" />
    <button className="ghost" onClick={() => { if (v) store.setTodo(t.cid, t.id, { remindAt: new Date(v).toISOString() }); close(); }}>Set</button>
    {t.remindAt && <button className="linkbtn" onClick={() => { store.setTodo(t.cid, t.id, { remindAt: null }); close(); }}>Clear</button>}
  </div>;
}
