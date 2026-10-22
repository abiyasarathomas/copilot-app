import { useState } from "react";
import { api } from "../api";
import { greeting, read, whenBucket, write } from "../format";
import { Icon } from "../icons";
import { canSpeak, speak } from "../native";
import { briefPerson } from "../assistant";
import { allGaps, allTodos, counterpart, flags, isMine, store, todayISO, useCaptures } from "../store";
import { GapCard, TodoRow, toast } from "../ui";
import { Avatar, Ring } from "../visual";

type Focus = { at: string; order: { key: string; why: string; text: string; kind: string }[] };
type Day = { date: string; text: string };

export function Today({ go, capture, now }: { go: (tab: "todos" | "live", view?: string) => void; capture: (example?: boolean) => void; now: number }) {
  const captures = useCaptures();
  const todos = allTodos(captures), gaps = allGaps(captures);
  const open = todos.filter(t => !t.done), mine = open.filter(t => isMine(t.owner));
  const openGaps = gaps.filter(g => !g.done);
  const overdue = open.filter(t => whenBucket(t.due) === "Overdue");
  const due = open.filter(t => t.remindAt && +new Date(t.remindAt) <= now);
  const tally: Record<string, number> = {};
  open.forEach(t => { const p = counterpart(t); if (p) tally[p] = (tally[p] || 0) + 1; });
  const people = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
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
        todos: open.map(t => ({ task: t.task, owner: t.owner, to: t.to ?? null, due: t.due, priority: t.priority, missing: flags(t) })),
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
      <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1>{greeting()}</h1>
    </div>
  );

  if (!captures.length) {
    return (
      <div className="page">
        {head}
        <section className="tile onboard">
          <div className="howto big" aria-label="How it works">
            <span><b className="g-cobalt"><Icon name="mic" size={30} /></b>Listen</span>
            <Icon name="arrow" size={20} />
            <span><b className="g-lime"><Icon name="users" size={30} /></b>Who owes who</span>
            <Icon name="arrow" size={20} />
            <span><b className="g-saffron"><Icon name="sound" size={30} /></b>60s brief</span>
          </div>
          <div className="row center-row">
            <button className="btn primary" onClick={() => go("live")}><Icon name="mic" /> Start listening</button>
            <button className="btn ghost" onClick={() => capture()}><Icon name="file" size={18} /> Add notes</button>
            <button className="btn ghost" onClick={() => capture(true)}><Icon name="spark" size={18} /> Try an example</button>
          </div>
        </section>
      </div>
    );
  }

  const live = new Set([...open.map(t => "t|" + t.cid + "|" + t.id), ...openGaps.map(g => "g|" + g.cid + "|" + g.id)]);
  const stats = [
    { n: mine.length, label: "I owe", to: "owe", icon: "out" as const, g: "cobalt" },
    { n: open.length - mine.length, label: "Owed to me", to: "owed", icon: "in" as const, g: "lime" },
    { n: overdue.length, label: "Overdue", to: "owe", icon: "calendar" as const, g: "coral" },
    { n: openGaps.length + open.filter(t => flags(t).length).length, label: "Missing", to: "missing", icon: "question" as const, g: "saffron" },
  ];
  const kept = todos.length ? todos.filter(t => t.done).length / todos.length : 0;

  return (
    <div className="page wide">
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

      <div className="bento">
        {stats.map(st => (
          <button key={st.label} className={"tile stat g-" + st.g} onClick={() => go("todos", st.to)} aria-label={`${st.n} ${st.label}. Open`}>
            <span className="stat-top"><span className="stat-ic"><Icon name={st.icon} size={18} /></span><Icon name="arrow" size={16} /></span>
            <span className="stat-n">{st.n}</span>
            <span className="stat-l">{st.label}</span>
          </button>
        ))}

        <section className="tile ring-tile" aria-label="Promises kept">
          <Ring value={kept} size={104} stroke={12} label={`${Math.round(kept * 100)}% of promises kept`}>
            <b>{Math.round(kept * 100)}%</b><small>kept</small>
          </Ring>
          <span className="tile-label">{todos.filter(t => t.done).length} of {todos.length} kept</span>
        </section>

        <section className={"tile brief-tile" + (day ? " has-text" : "")} aria-label="Morning brief">
          <div className="tile-head">
            <span className="tile-label"><Icon name="sound" size={14} /> 60-second brief</span>
            {day && <button className="icon-btn small" disabled={dayBusy} onClick={writeDay} aria-label="Refresh brief" title="Refresh"><Icon name="spark" size={16} /></button>}
          </div>
          {day ? <p className="brief-text">{day.text}</p> : <span className="big-ic"><Icon name="sound" size={34} /></span>}
          <div className="row">
            {day && canSpeak && <button className="btn primary" onClick={() => speak(day.text)}><Icon name="sound" size={18} /> Play</button>}
            {!day && <button className="btn primary" disabled={dayBusy} onClick={writeDay}><Icon name="spark" /> {dayBusy ? "Writing…" : "Brief me"}</button>}
          </div>
        </section>

        <section className="tile people-tile" aria-label="Before you meet">
          <span className="tile-label"><Icon name="users" size={14} /> Before you meet · tap to hear</span>
          {people.length ? (
            <div className="faces-row">
              {people.map(([n, c]) => (
                <button key={n} className="face-btn" onClick={() => briefPerson(n)} aria-label={`Hear what you and ${n} owe each other (${c})`}>
                  <Avatar name={n} size={52} /><span className="face-n">{c}</span><span className="face-name">{n.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted small">No one yet</p>}
        </section>

        <section className="tile focus-tile">
          <div className="tile-head">
            <h2 className="h-ic"><Icon name="flag" size={18} /> Focus</h2>
            <button className="btn small ghost" disabled={prioBusy || !live.size} onClick={prioritize}><Icon name="spark" size={14} /> {prioBusy ? "Ranking…" : focus ? "Re-rank" : "Rank"}</button>
          </div>
          {focus?.order.length ? (
            <ol className="focus">{focus.order.slice(0, 5).map(o => (
              <li key={o.key} className={live.has(o.key) ? "" : "gone"}>
                <span className="focus-text">{o.kind === "missing piece" && <Icon name="question" size={15} />} {o.text}</span>
                <span className="why">{o.why}</span>
              </li>
            ))}</ol>
          ) : <button className="ghost-list" onClick={prioritize} disabled={prioBusy || !live.size} aria-label="Rank my tasks"><i /><i /><i /></button>}
        </section>

        <section className="tile due-tile">
          <div className="tile-head">
            <h2 className="h-ic"><Icon name="calendar" size={18} /> Due now <span className="count-dot">{soon.length}</span></h2>
            <button className="icon-btn small" onClick={() => go("todos", "owe")} aria-label="All promises"><Icon name="arrow" /></button>
          </div>
          {soon.length ? <div className="todo-list">{soon.map(t => <TodoRow key={t.cid + t.id} t={t} />)}</div>
            : <p className="all-clear"><Icon name="check" size={18} /> Nothing due</p>}
        </section>

        <section className="tile gaps-tile">
          <div className="tile-head">
            <h2 className="h-ic"><Icon name="question" size={18} /> Missing <span className="count-dot">{openGaps.length}</span></h2>
            {openGaps.length > 3 && <button className="icon-btn small" onClick={() => go("todos", "missing")} aria-label={`See all ${openGaps.length}`}><Icon name="arrow" /></button>}
          </div>
          {openGaps.length ? <ul className="gaps">{openGaps.slice(0, 3).map(g => <GapCard key={g.cid + g.id} g={g} />)}</ul>
            : <p className="all-clear"><Icon name="check" size={18} /> All clear</p>}
        </section>
      </div>
    </div>
  );
}
