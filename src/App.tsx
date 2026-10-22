import { useState } from "react";
import { accessCode } from "./api";
import { Board } from "./Board";
import { Capture } from "./Capture";
import { enableReminders, isNative } from "./native";
import { store, useCaptures } from "./store";
import { Talk } from "./Talk";

export function App() {
  return (
    <div className="wrap">
      <header>
        <h1>Co-<span>Pilot</span></h1>
        {import.meta.env.MODE === "artifact" && <span className="src">Test version</span>}
        <div className="today">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      </header>
      <div className="grid">
        <div className="col">
          <Capture />
          <QuickAdd />
          <Captured />
          {import.meta.env.MODE !== "artifact" && <Settings />}
        </div>
        <div className="col">
          <Talk />
          <Board />
        </div>
      </div>
    </div>
  );
}

function QuickAdd() {
  const [task, setTask] = useState("");
  return (
    <section className="panel" aria-labelledby="quickH">
      <h2 id="quickH">Quick to-do</h2>
      <form className="row" onSubmit={e => {
        e.preventDefault(); if (!task.trim()) return;
        store.addTodo({ task: task.trim(), owner: "me", due: null, group: "Quick adds", priority: "medium" }, "Quick add");
        setTask("");
      }}>
        <input type="text" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Send Priya the revised budget by Friday" aria-label="New to-do" />
        <button className="primary">Add</button>
      </form>
    </section>
  );
}

function Captured() {
  const captures = useCaptures();
  const [pending, setPending] = useState<string | null>(null);
  return (
    <section className="panel" aria-labelledby="logH">
      <div className="row between"><h2 id="logH">Captured</h2><span className="status">Saved on this device</span></div>
      <ul className="caps">{captures.length ? captures.map(c => (
        <li key={c.id}>
          <div className="row between"><span className="ttl">{c.title}</span><span className="src">{c.source}</span></div>
          {c.summary && <p className="sum">{c.summary}</p>}
          {!!c.decisions.length && <details><summary>{c.decisions.length} decision{c.decisions.length > 1 ? "s" : ""}</summary>
            <ul className="dec">{c.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></details>}
          <div className="row between">
            <span className="status">{new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {c.todos.length} to-dos · {c.gaps.length} gaps</span>
            <button className="linkbtn" onClick={() => {
              if (pending === c.id) { setPending(null); store.remove(c.id); }
              else { setPending(c.id); setTimeout(() => setPending(p => (p === c.id ? null : p)), 3000); }
            }}>{pending === c.id ? "Tap again to remove" : "Remove"}</button>
          </div>
        </li>
      )) : <li className="empty-state">Nothing captured yet. Each meeting, chat or note you brief shows up here.</li>}</ul>
    </section>
  );
}

function Settings() {
  const [code, setCode] = useState(accessCode.get());
  const [notif, setNotif] = useState("");
  return (
    <section className="panel settings" aria-labelledby="setH">
      <h2 id="setH">Settings</h2>
      <label className="hint" htmlFor="code">Access code (only if you set one on your server)</label>
      <input id="code" type="text" value={code} autoComplete="off" onChange={e => { setCode(e.target.value); accessCode.set(e.target.value); }} />
      <div className="row">
        <button className="ghost" onClick={async () => setNotif(await enableReminders() ? "Reminders are on." : "Notifications are blocked. Turn them on in your device or browser settings.")}>Turn on reminder notifications</button>
        <span className="hint">{notif}</span>
      </div>
      {!isNative && <p className="hint">Tip: install Co-Pilot from your browser menu ("Install app" or "Add to Home Screen") so it opens like an app.</p>}
    </section>
  );
}
