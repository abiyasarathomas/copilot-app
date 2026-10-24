import { useEffect, useState } from "react";
import { accessCode } from "./api";
import { Icon, type IconName } from "./icons";
import { enableReminders, isNative, syncReminders, webNotify } from "./native";
import { settings as voice, stopListening } from "./assistant";
import { Live } from "./screens/Live";
import { LangSwitch } from "./screens/LangSwitch";
import { CaptureFlow } from "./screens/CaptureFlow";
import { Notes } from "./screens/Notes";
import { Today } from "./screens/Today";
import { Ledger } from "./screens/Ledger";
import { allTodos, useCaptures } from "./store";
import { Sheet, Toasts } from "./ui";

type Tab = "live" | "today" | "todos" | "notes";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "live", label: "Co-Pilot", icon: "mic" },
  { id: "today", label: "Briefing", icon: "home" },
  { id: "todos", label: "Promises", icon: "list" },
  { id: "notes", label: "History", icon: "notes" },
];
const isTab = (h: string): h is Tab => TABS.some(t => t.id === h);
const isTest = import.meta.env.MODE === "artifact";

export function App() {
  const captures = useCaptures();
  const [tab, setTab] = useState<Tab>(() => { const h = location.hash.slice(1); return isTab(h) ? h : "live"; });
  const [todosView, setTodosView] = useState<string | undefined>();
  const [capture, setCapture] = useState<null | { example: boolean }>(null);
  const [settings, setSettings] = useState(false);
  const [now, setNow] = useState(Date.now());

  const go = (t: Tab, view?: string) => {
    setTab(t); setTodosView(view);
    // pushState so the browser and Android back button step back through tabs.
    try { if (location.hash !== "#" + t) history.pushState(null, "", "#" + t); } catch { /* sandboxed */ }
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const back = () => { const h = location.hash.slice(1); setTab(isTab(h) ? h : "live"); setTodosView(undefined); };
    window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back);
  }, []);

  // Reminders: checked every 30 seconds while open; on phones also handed to the OS.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const todos = allTodos(captures);
  const due = todos.filter(t => !t.done && t.remindAt && +new Date(t.remindAt) <= now);
  useEffect(() => { webNotify(due); }, [due.map(t => t.id + t.remindAt).join()]);
  useEffect(() => { syncReminders(todos); }, [todos.map(t => t.id + t.remindAt + t.done).join()]);

  const openCapture = (example = false) => setCapture({ example });

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand"><span className="logo" aria-hidden="true" /> Co-Pilot{isTest && <span className="tag">Test</span>}</div>
        {TABS.map((t, i) => (
          <button key={t.id} className="tab" style={{ "--o": i < 2 ? i + 1 : i + 2 } as React.CSSProperties} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} /><span>{t.label}</span>
            {t.id === "live" && due.length > 0 && <span className="badge" aria-label={`${due.length} reminders due`}>{due.length}</span>}
          </button>
        ))}
        <button className="capture-btn" onClick={() => openCapture()} aria-label="Add notes or a file"><Icon name="plus" /><span>Add notes</span></button>
        <button className="tab settings-tab" onClick={() => setSettings(true)}><Icon name="settings" /><span>Settings</span></button>
      </nav>

      <header className="topbar">
        <div className="brand"><span className="logo" aria-hidden="true" /> Co-Pilot{isTest && <span className="tag">Test</span>}</div>
        <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Settings"><Icon name="settings" /></button>
      </header>

      <main className="main">
        {tab === "live" && <Live />}
        {tab === "today" && <Today go={go} capture={openCapture} now={now} />}
        {tab === "todos" && <Ledger initial={todosView} listen={() => go("live")} />}
        {tab === "notes" && <Notes capture={() => openCapture()} />}
      </main>

      {capture && <CaptureFlow example={capture.example} onClose={() => setCapture(null)} onSaved={() => { setCapture(null); go("today"); }} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
      <Toasts />
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(accessCode.get());
  const [notif, setNotif] = useState("");
  const [speakOn, setSpeakOn] = useState(voice.speakReplies);
  const [announce, setAnnounce] = useState(voice.announce);
  const [consent, setConsent] = useState(voice.consent);
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="settings">
        <section>
          <h4>Language</h4>
          <p className="muted small">What Co-Pilot listens for, speaks, and writes your promises in.</p>
          <LangSwitch note />
        </section>
        <section>
          <h4>Voice</h4>
          <label className="toggle-row"><input type="checkbox" checked={speakOn} onChange={e => { setSpeakOn(e.target.checked); voice.speakReplies = e.target.checked; }} /> Answer out loud when I type a question</label>
          <label className="toggle-row"><input type="checkbox" checked={announce} onChange={e => { setAnnounce(e.target.checked); voice.announce = e.target.checked; }} /> Tell me out loud when you pick something up</label>
          <label className="toggle-row"><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); voice.consent = e.target.checked; }} /> Say a consent line out loud when I start listening</label>
          <p className="muted small">Spoken questions ("Co-Pilot, …" or Talk to me) are always answered out loud.</p>
        </section>
        <section>
          <h4>Reminders</h4>
          <p className="muted">{isNative ? "Get a notification when a reminder is due, even when Co-Pilot is closed." : "Get a notification when a reminder is due while Co-Pilot is open."}</p>
          <button className="btn ghost" onClick={async () => setNotif(await enableReminders() ? "Reminders are on." : "Notifications are blocked. Turn them on in your device or browser settings.")}>
            <Icon name="bell" size={16} /> Turn on notifications</button>
          {notif && <p className="small">{notif}</p>}
        </section>
        {!isTest && (
          <section>
            <h4>Server access code</h4>
            <p className="muted">Only needed if you set APP_ACCESS_CODE on your server.</p>
            <label className="sr" htmlFor="code">Access code</label>
            <input id="code" type="text" value={code} autoComplete="off" onChange={e => { setCode(e.target.value); accessCode.set(e.target.value); }} />
          </section>
        )}
        <section>
          <h4>Your data</h4>
          <p className="muted">Audio is never saved: Co-Pilot keeps only the promises, decisions and questions it writes down. Your screen is read only when you ask. Everything is saved on this device only.{!isNative && !isTest && " Install Co-Pilot from your browser menu (Install app, or Add to Home Screen) to open it like an app."}</p>
        </section>
      </div>
    </Sheet>
  );
}
