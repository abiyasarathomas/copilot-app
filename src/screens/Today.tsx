import { useState } from "react";
import { api } from "../api";
import { fmtTime, greeting, read, whenBucket, write } from "../format";
import { Icon } from "../icons";
import { canSpeak, speak } from "../native";
import { briefPerson } from "../assistant";
import { allGaps, allTodos, counterpart, flags, isMine, store, todayISO, useCaptures } from "../store";
import { Poster } from "../poster";
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
      <p className="eyebrow">Briefing · {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
      <h1>{greeting()}</h1>
    </div>
  );

  if (!captures.length) {
    return (
      <div className="page">
        {head}
        <section className="card onboard">
          <div className="howto big" aria-label="How it works">
            <span><b className="p-cobalt"><Icon name="mic" size={30} /></b>Listen</span>
            <Icon name="arrow" size={20} />
            <span><b className="p-lime"><Icon name="users" size={30} /></b>Who owes who</span>
            <Icon name="arrow" size={20} />
            <span><b className="p-saffron"><Icon name="sound" size={30} /></b>60s brief</span>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => go("live")}><Icon name="mic" /> Start listening</button>
            <button className="btn ghost" onClick={() => capture()}><Icon name="file" size={18} /> Add notes</button>
          </div>
        </section>
      </div>
    );
  }

  const live = new Set([...open.map(t => "t|" + t.cid + "|" + t.id), ...openGaps.map(g => "g|" + g.cid + "|" + g.id)]);
  const stats = [
    { n: mine.length, label: "I owe", to: "owe", icon: "out" as const },
    { n: open.length - mine.length, label: "Owed to me", to: "owed", icon: "in" as const },
    { n: overdue.length, label: "Overdue", to: "owe", icon: "calendar" as const },
    { n: openGaps.length + open.filter(t => flags(t).length).length, label: "Missing", to: "missing", icon: "question" as const },
  ];
  const kept = todos.length ? todos.filter(t => t.done).length / todos.length : 0;

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

      <div className="poster-grid">
        {stats.map((st, i) => (
          <Poster key={st.label} color={(["cobalt", "lime", "coral", "saffron"] as const)[i]} seed={i + 2} onClick={() => go("todos", st.to)} label={`${st.n} ${st.label}`}
            kicker={<span className="kick"><Icon name={st.icon} size={16} /> {st.label}</span>} figure={st.n} />
        ))}
      </div>

      <section className="card pulse">
        <Ring value={kept} size={92} stroke={11} label={`${Math.round(kept * 100)}% of promises kept`}>
          <b>{Math.round(kept * 100)}%</b><small>kept</small>
        </Ring>
        <div className="pulse-people">
          <p className="card-label"><Icon name="sound" size={13} /> Before you meet</p>
          {people.length ? (
            <div className="faces-row">
              {people.map(([n, c]) => (
                <button key={n} className="face-btn" onClick={() => briefPerson(n)} aria-label={`Hear what you and ${n} owe each other (${c})`}>
                  <Avatar name={n} size={48} /><span className="face-n">{c}</span><span className="face-name">{n.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          ) : <p className="muted small">No one yet</p>}
        </div>
      </section>

      <Poster color="fog" seed={9} kicker="Morning brief" aside="60 seconds" label="Morning brief"
        title={day ? undefined : <span className="big-ic"><Icon name="sound" size={44} /></span>}>
        {day ? <p className="brief-text">{day.text}</p> : null}
        <div className="row">
          {day && canSpeak && <button className="btn primary" onClick={() => speak(day.text)}><Icon name="sound" size={18} /> Read it to me</button>}
          {day ? <button className="icon-btn" disabled={dayBusy} onClick={writeDay} aria-label="Refresh brief" title="Refresh"><Icon name="spark" /></button>
            : <button className="btn primary" disabled={dayBusy} onClick={writeDay}><Icon name="spark" /> {dayBusy ? "Writing…" : "Brief me"}</button>}
        </div>
      </Poster>

      <section className="card">
        <div className="card-head">
          <h2 className="h-ic"><Icon name="flag" size={18} /> Focus</h2>
          <button className="btn small ghost" disabled={prioBusy || !live.size} onClick={prioritize}><Icon name="spark" size={14} /> {prioBusy ? "Ranking…" : focus ? "Re-rank" : "Rank"}</button>
        </div>
        {focus?.order.length ? (
          <>
            <ol className="focus">{focus.order.map(o => (
              <li key={o.key} className={live.has(o.key) ? "" : "gone"} title={o.why}>
                <span>{o.kind === "missing piece" && <Icon name="question" size={15} />} {o.text}</span>
              </li>
            ))}</ol>
            <p className="tiny"><Icon name="spark" size={11} /> {fmtTime(focus.at)}</p>
          </>
        ) : <div className="ghost-list" aria-hidden="true"><i /><i /><i /></div>}
      </section>

      {!!soon.length && (
        <section className="card">
          <div className="card-head"><h2 className="h-ic"><Icon name="calendar" size={18} /> Due now <span className="count-dot">{soon.length}</span></h2><button className="icon-btn" onClick={() => go("todos", "owe")} aria-label="All promises"><Icon name="arrow" /></button></div>
          <div className="todo-list">{soon.map(t => <TodoRow key={t.cid + t.id} t={t} />)}</div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2 className="h-ic"><Icon name="question" size={18} /> Missing <span className="count-dot">{openGaps.length}</span></h2>{openGaps.length > 3 && <button className="icon-btn" onClick={() => go("todos", "missing")} aria-label={`See all ${openGaps.length}`}><Icon name="arrow" /></button>}</div>
        {openGaps.length ? <ul className="gaps">{openGaps.slice(0, 3).map(g => <GapCard key={g.cid + g.id} g={g} />)}</ul>
          : <p className="all-clear"><Icon name="check" size={18} /> All clear</p>}
      </section>

    </div>
  );
}
