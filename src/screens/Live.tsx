import { useEffect, useState } from "react";
import { briefMe, consentLine, hush, playDemo, startListening, startWatching, stopListening, stopWatching, talkOnce, useAssistant, type FeedItem } from "../assistant";
import { Icon, type IconName } from "../icons";
import { canCaptureScreen, canListen, canSpeak } from "../native";
import { CopyBox } from "../ui";
import { Poster } from "../poster";
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

  return (
    <div className="page live">
      <Poster color={a.busy === "speaking" ? "lime" : a.awaiting ? "saffron" : a.listening || a.watching ? "cobalt" : "fog"} live={a.listening || a.watching || !!a.busy} seed={11}
        kicker="Co-Pilot / Live" aside={<>{status}{a.listening && !a.demo ? ` · ${mins} min` : ""}{a.busy === "reading" ? " · writing it down" : ""}</>}
        rank={a.listening ? "On air" : a.watching ? "Watching" : "Standby"}
        title={<h1>{a.awaiting ? "Go ahead." : a.busy === "speaking" ? "Speaking." : a.listening || a.watching ? "Listening." : "Ready when you are."}</h1>}
        caption={<p className="caption" aria-live="polite">
          {a.caption ? <>“{a.caption}”</> : a.listening ? <>Say <b>“Co-Pilot”</b> and your question any time.</>
            : canListen ? "Turn on listening in a meeting. I'll keep track of who promised what, decisions and open questions." : "I keep track of who promised what, so you don't have to."}
        </p>}>
        <button className={"orb" + (a.listening ? " on" : "")} aria-pressed={a.listening} disabled={a.demo}
          onClick={() => (a.listening ? stopListening() : canListen ? startListening() : playDemo())}>
          <Icon name={a.listening ? "stop" : "mic"} size={22} />
          <span>{a.demo ? "Demo playing" : a.listening ? "Stop listening" : canListen ? "Start listening" : "Play a demo meeting"}</span>
        </button>
      </Poster>

      <section className="deck">
        <LangSwitch note />
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

      {!canListen && <p className="muted small center">This test page can't use your microphone or screen, so the demo plays a short meeting through the same steps: Co-Pilot hears it, writes down who promised what, then answers “who owes me what?” out loud.</p>}

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

      {(a.listening || a.watching) && <p className="consent"><Icon name="alert" size={14} /> Let people know: “{consentLine()}”</p>}
    </div>
  );
}
