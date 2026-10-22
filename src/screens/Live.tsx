import { useEffect, useState } from "react";
import { briefMe, CONSENT_LINE, hush, playDemo, startListening, startWatching, stopListening, stopWatching, talkOnce, useAssistant, type FeedItem } from "../assistant";
import { Icon, type IconName } from "../icons";
import { canCaptureScreen, canListen, canSpeak } from "../native";
import { CopyBox } from "../ui";

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

  return (
    <div className="page live">
      <div className="page-head">
        <p className="eyebrow">{status}{a.listening && !a.demo ? ` · ${mins} min` : ""}{a.busy === "reading" ? " · picking things up" : ""}</p>
        <h1>{a.listening || a.watching ? "I'm on it." : "Ready when you are."}</h1>
      </div>

      <section className="deck">
        <button className={"orb" + (a.listening ? " on" : "") + (a.awaiting ? " ask" : "") + (a.busy === "speaking" ? " talk" : "")}
          aria-pressed={a.listening} disabled={a.demo}
          onClick={() => (a.listening ? stopListening() : canListen ? startListening() : playDemo())}>
          <span className="ring" aria-hidden="true" /><span className="ring r2" aria-hidden="true" />
          <Icon name={a.listening ? "stop" : "mic"} size={34} />
          <span className="orb-label">{a.demo ? "Demo playing" : a.listening ? "Stop listening" : canListen ? "Listen" : "Play demo"}</span>
        </button>

        <p className="caption" aria-live="polite">
          {a.caption ? <>“{a.caption}”</> : a.listening ? <>Say <b>“Co-Pilot”</b> and your question any time.</>
            : canListen ? "Turn on listening in a meeting. I'll keep track of who promised what, decisions and open questions." : " "}
        </p>

        <div className="actions">
          <button className="btn ghost" onClick={talkOnce} disabled={!canListen || a.demo || a.busy === "thinking"}><Icon name="chat" size={18} /> Talk to me</button>
          <button className="btn ghost" onClick={briefMe} disabled={a.busy === "thinking"}><Icon name="sound" size={18} /> Brief me</button>
          {canCaptureScreen && (
            <button className="btn ghost" aria-pressed={a.watching} onClick={() => (a.watching ? stopWatching() : startWatching())}>
              <Icon name="screen" size={18} /> {a.watching ? "Stop watching" : "Watch my screen"}
            </button>
          )}
          {a.busy === "speaking" && canSpeak && <button className="btn" onClick={hush}><Icon name="stop" size={16} /> Quiet</button>}
        </div>
        {a.error && <p className="err" role="alert">{a.error}</p>}
      </section>

      {!canListen && (
        <section className="card notice">
          <h2>See it work</h2>
          <p className="muted">This test page can't use your microphone or screen. Play a short demo meeting: Co-Pilot hears it, keeps track of who promised what, then answers “who owes me what?” out loud.</p>
          <button className="btn primary" disabled={a.demo} onClick={playDemo}><Icon name="spark" size={18} /> {a.demo ? "Playing…" : "Play a demo meeting"}</button>
        </section>
      )}

      <section className="feed-wrap">
        <div className="card-head"><h2>Picked up</h2>{canListen && !a.listening && <button className="link" onClick={playDemo}>Play a demo</button>}</div>
        {a.feed.length ? (
          <ol className="feed">
            {a.feed.slice(0, 60).map(f => (
              <li key={f.id} className={"feed-item k-" + f.kind}>
                <span className="feed-icon"><Icon name={KIND[f.kind].icon} size={16} /></span>
                <div className="feed-body">
                  <span className="feed-meta">{KIND[f.kind].label}{f.via ? ` · ${f.via === "screen" ? "on screen" : "heard"}` : ""} · {clock(f.at)}</span>
                  {f.kind === "draft" ? <>{f.who && <span className="feed-text">To {f.who}</span>}<CopyBox text={f.text} /></> : <span className="feed-text">{f.text}</span>}
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="muted">Nothing yet. What I hear and see shows up here as it happens.</p>}
      </section>

      {(a.listening || a.watching) && <p className="consent"><Icon name="alert" size={14} /> Let people know: “{CONSENT_LINE}”</p>}
    </div>
  );
}
