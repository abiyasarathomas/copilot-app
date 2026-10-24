import { useEffect, useState } from "react";
import { askCopilot, briefMe, clearFeed, consentLine, hush, playDemo, startListening, startWatching, stopDemo, stopListening, stopWatching, talkOnce, useAssistant, type FeedItem } from "../assistant";
import { Icon, type IconName } from "../icons";
import { canCaptureScreen, canListen, canSpeak } from "../native";
import { CopyBox } from "../ui";
import { Avatar, Count, Wave } from "../visual";
import { LangSwitch } from "./LangSwitch";

const KIND: Record<FeedItem["kind"], { icon: IconName; label: string }> = {
  todo: { icon: "check", label: "Promise" },
  draft: { icon: "send", label: "Draft" },
  gap: { icon: "alert", label: "Missing" },
  decision: { icon: "flag", label: "Decided" },
  you: { icon: "mic", label: "You" },
  copilot: { icon: "sound", label: "Co-Pilot" },
  info: { icon: "spark", label: "Note" },
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function Live() {
  const a = useAssistant();
  const [, tick] = useState(0);
  useEffect(() => { if (!a.listeningSince) return; const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t); }, [a.listeningSince]);
  const mins = a.listeningSince ? Math.max(0, Math.round((Date.now() - +new Date(a.listeningSince)) / 60000)) : 0;

  const status = a.busy === "speaking" ? "Speaking" : a.busy === "thinking" ? "Thinking" : a.awaiting ? "Go ahead, I'm listening"
    : a.listening ? (a.demo ? "Playing a demo meeting" : "Listening") : a.watching ? "Watching your screen" : "Ready";

  const tone = a.busy === "speaking" ? "lime" : a.awaiting ? "saffron" : a.listening || a.watching ? "cobalt" : "idle";
  const on = a.listening || a.watching || !!a.busy;
  const n = (k: FeedItem["kind"]) => a.feed.filter(f => f.kind === k).length;
  const [q, setQ] = useState("");
  const ask = (e: React.FormEvent) => { e.preventDefault(); if (!q.trim() || a.busy === "thinking") return; askCopilot(q); setQ(""); };
  const orbLabel = a.demo ? "Stop the demo" : a.listening ? "Stop listening" : canListen ? "Start listening" : "Play a demo meeting";

  return (
    <div className="page live">
      <div className="live-side">
        <section className={"hero tone-" + tone} aria-label="Co-Pilot">
          <div className="hero-top">
            <span className="status"><span className={"led" + (on ? " on" : "")} />{status}</span>
            {a.listening && !a.demo && <span className="pill">{mins} min</span>}
          </div>
          <button className={"orb" + (a.listening ? " on" : "")} aria-pressed={a.listening} aria-label={orbLabel}
            onClick={() => (a.demo ? stopDemo() : a.listening ? stopListening() : canListen ? startListening() : playDemo())}>
            <span className="orb-core"><Icon name={a.listening ? "stop" : a.busy === "speaking" ? "sound" : "mic"} size={40} /></span>
          </button>
          <Wave live={on} />
          <p className="caption" aria-live="polite">
            {a.caption ? <>“{a.caption}”</> : a.awaiting ? "Go ahead…" : a.listening ? <>Say <b>“Co-Pilot”</b> to ask</> : orbLabel}
          </p>
          <div className="tally" aria-label="Picked up so far">
            <Count icon="check" n={n("todo")} label="promises" />
            <Count icon="flag" n={n("decision")} label="decisions" />
            <Count icon="question" n={n("gap")} label="missing" />
          </div>
        </section>

        <LangSwitch note />

        <div className="dial" role="group" aria-label="Actions">
          {canListen && <DialBtn icon="chat" label="Talk" onClick={talkOnce} disabled={a.demo || a.busy === "thinking"} />}
          <DialBtn icon="sound" label="Brief me" onClick={briefMe} disabled={a.busy === "thinking"} />
          {canCaptureScreen && <DialBtn icon="screen" label={a.watching ? "Stop" : "Screen"} pressed={a.watching} onClick={() => (a.watching ? stopWatching() : startWatching())} />}
          {a.busy === "speaking" && canSpeak && <DialBtn icon="stop" label="Quiet" onClick={hush} />}
          {canListen && !a.listening && <DialBtn icon="spark" label="Demo" onClick={playDemo} />}
        </div>

        <form className="askbar" onSubmit={ask}>
          <label className="sr" htmlFor="ask">Ask Co-Pilot</label>
          <input id="ask" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask… “who owes me what?”" autoComplete="off" />
          <button className="icon-btn filled" aria-label="Send" disabled={!q.trim() || a.busy === "thinking"}><Icon name="send" size={18} /></button>
        </form>
        {a.error && <p className="err" role="alert">{a.error}</p>}
        {(a.listening || a.watching) && <p className="consent"><Icon name="alert" size={14} /> “{consentLine()}”</p>}
      </div>

      <section className="feed-wrap" aria-label="Picked up">
        <div className="card-head">
          <h2 className="h-ic"><Icon name="spark" size={18} /> Picked up</h2>
          {!!a.feed.length && <button className="btn small ghost" onClick={clearFeed}><Icon name="trash" size={14} /> Clear</button>}
        </div>
        {a.busy === "thinking" && <div className="typing" aria-label="Thinking"><span /><span /><span /></div>}
        {a.feed.length ? (
          <ol className="feed">
            {a.feed.slice(0, 60).map(f => (
              <li key={f.id} className={"feed-item k-" + f.kind}>
                <span className="feed-icon" title={KIND[f.kind].label}><Icon name={KIND[f.kind].icon} size={18} /></span>
                <div className="feed-body">
                  {f.kind === "draft" ? <>{f.who && <span className="feed-who"><Icon name="send" size={13} /> <Avatar name={f.who} size={22} /> {f.who}</span>}<CopyBox text={f.text} /></> : <span className="feed-text">{f.text}</span>}
                </div>
                <span className="feed-time">{f.via === "screen" && <Icon name="eye" size={12} />}{clock(f.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="howto tile" aria-label="How it works">
            <span><b className="g-cobalt"><Icon name="mic" size={26} /></b>Hear</span>
            <Icon name="arrow" size={18} />
            <span><b className="g-lime"><Icon name="check" size={26} /></b>Track</span>
            <Icon name="arrow" size={18} />
            <span><b className="g-saffron"><Icon name="sound" size={26} /></b>Brief</span>
          </div>
        )}
      </section>
    </div>
  );
}

function DialBtn({ icon, label, onClick, disabled, pressed }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button className="dial-btn" onClick={onClick} disabled={disabled} aria-pressed={pressed}>
      <span className="dial-ic"><Icon name={icon} size={22} /></span>{label}
    </button>
  );
}
