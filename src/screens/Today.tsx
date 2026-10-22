import { useState } from "react";
import { api } from "../api";
import { fmtTime, greeting, read, whenBucket, write } from "../format";
import { Icon } from "../icons";
import { canSpeak, speak } from "../native";
import { allGaps, allTodos, isMine, store, todayISO, useCaptures } from "../store";
import { GapCard, TodoRow, toast } from "../ui";

type Focus = { at: string; order: { key: string; why: string; text: string; kind: string }[] };
type Day = { date: string; text: string };

export function Today({ go, capture, now }: { go: (tab: "todos" | "ask", view?: string) => void; capture: (example?: boolean) => void; now: number }) {
  const captures = useCaptures();
  const todos = allTodos(captures), gaps = allGaps(captures);
  const open = todos.filter(t => !t.done), mine = open.filter(t => isMine(t.owner));
  const openGaps = gaps.filter(g => !g.done);
  const overdue = open.filter(t => whenBucket(t.due) === "Overdue");
  const due = open.filter(t => t.remindAt && +new Date(t.remindAt) <= now);
  const soon = open.filter(t => ["Overdue", "Today"].includes(whenBucket(t.due))).slice(0, 4);

  const [day, setDay] = useState<Day | null>(() => { const d = read<Day | null>("copilot.day", null); return d?.date === todayISO() ? d : null; });
  const [dayBusy, setDayBusy] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(() => read("copilot.focus", null));
  const [prioBusy, setPrioBusy] = useState(false);

  const writeDay = async () => {
    setDayBusy(true);
    try {
      const text = await api.day({
        now: new Date().toString(),
        recent: captures.slice(0, 8).map(c => ({ title: c.title, source: c.source, summary: c.summary, decisions: c.decisions })),
        todos: open.map(({ task, owner, due, group, priority }) => ({ task, owner, due, group, priority })),
        gaps: openGaps.map(({ issue, ask, from }) => ({ issue, ask, from })),
      });
      const d = { date: todayISO(), text }; setDay(d); write("copilot.day", d);
    } catch (e) { toast((e as Error).message); }
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
      setFocus(f); write("copilot.focus", f);
    } catch (e) { toast((e as Error).message); }
    finally { setPrioBusy(false); }
  };

  const head = (
    <div className="page-head">
      <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      <h1>{greeting()}</h1>
    </div>
  );

  if (!captures.length) {
    return (
      <div className="page">
        {head}
        <section className="card onboard">
          <h2>Let's set up your first brief</h2>
          <ol className="steps">
            <li><b>Capture</b> a meeting, a hallway chat, notes or a screenshot.</li>
            <li><b>Review</b> the to-dos and missing pieces Co-Pilot finds.</li>
            <li><b>Start each day</b> here with a short plan.</li>
          </ol>
          <div className="row">
            <button className="btn primary" onClick={() => capture()}><Icon name="plus" /> Capture something</button>
            <button className="btn ghost" onClick={() => capture(true)}>Try an example</button>
          </div>
        </section>
      </div>
    );
  }

  const live = new Set([...open.map(t => "t|" + t.cid + "|" + t.id), ...openGaps.map(g => "g|" + g.cid + "|" + g.id)]);
  const stats = [
    { n: mine.length, label: "On me", to: "mine" },
    { n: open.length - mine.length, label: "Waiting on others", to: "others" },
    { n: overdue.length, label: "Overdue", to: "when", hot: overdue.length > 0 },
    { n: openGaps.length, label: "Missing pieces", to: "gaps", hot: openGaps.length > 0 },
  ];

  return (
    <div className="page">
      {head}

      {!!due.length && (
        <section className="banner" aria-label="Reminders">
          <Icon name="bell" />
          <div className="banner-body">
            {due.map(t => (
              <div key={t.id} className="banner-row">
                <span>{t.task}</span>
                <span className="row">
                  <button className="btn small ghost" onClick={() => store.setTodo(t.cid, t.id, { remindAt: new Date(Date.now() + 36e5).toISOString() })}>Snooze 1h</button>
                  <button className="btn small" onClick={() => store.setTodo(t.cid, t.id, { done: true, remindAt: null })}>Done</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="stats">
        {stats.map(s => (
          <button key={s.label} className={"stat" + (s.hot ? " hot" : "")} onClick={() => go("todos", s.to)}>
            <span className="stat-n">{s.n}</span><span className="stat-l">{s.label}</span>
          </button>
        ))}
      </div>

      <section className="card brief">
        <div className="card-head">
          <h2>Today's brief</h2>
          <div className="row">
            {day && canSpeak && <button className="icon-btn" onClick={() => speak(day.text)} aria-label="Read the brief aloud"><Icon name="sound" /></button>}
            {day && <button className="btn small ghost" disabled={dayBusy} onClick={writeDay}>{dayBusy ? "Updating…" : "Refresh"}</button>}
          </div>
        </div>
        {day ? <p className="brief-text">{day.text}</p> : (
          <>
            <p className="muted">A short plan from your open to-dos and missing pieces.</p>
            <button className="btn primary" disabled={dayBusy} onClick={writeDay}><Icon name="spark" /> {dayBusy ? "Writing…" : "Write today's brief"}</button>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Focus next</h2>
          <button className="btn small ghost" disabled={prioBusy || !live.size} onClick={prioritize}>{prioBusy ? "Ranking…" : focus ? "Re-rank" : "Rank for me"}</button>
        </div>
        {focus?.order.length ? (
          <>
            <ol className="focus">{focus.order.map(o => (
              <li key={o.key} className={live.has(o.key) ? "" : "gone"}>
                <span>{o.text}</span>
                <span className="why">{o.kind === "missing piece" ? "Missing piece. " : ""}{o.why}</span>
              </li>
            ))}</ol>
            <p className="tiny">Ranked {fmtTime(focus.at)}</p>
          </>
        ) : <p className="muted">Co-Pilot can put your tasks and missing pieces in the order to tackle them.</p>}
      </section>

      {!!soon.length && (
        <section className="card">
          <div className="card-head"><h2>Due today or overdue</h2><button className="link" onClick={() => go("todos", "when")}>All to-dos <Icon name="arrow" size={14} /></button></div>
          <div className="todo-list">{soon.map(t => <TodoRow key={t.cid + t.id} t={t} />)}</div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Missing pieces</h2>{openGaps.length > 3 && <button className="link" onClick={() => go("todos", "gaps")}>See all {openGaps.length} <Icon name="arrow" size={14} /></button>}</div>
        {openGaps.length ? <ul className="gaps">{openGaps.slice(0, 3).map(g => <GapCard key={g.cid + g.id} g={g} />)}</ul>
          : <p className="muted">Nothing to chase. Tasks with no owner, no date or an open question will show up here.</p>}
      </section>

    </div>
  );
}
