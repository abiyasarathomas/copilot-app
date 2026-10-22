import { useEffect, useState } from "react";
import { briefMe, CONSENT_LINE, hush, playDemo, startListening, startWatching, stopListening, stopWatching, talkOnce, useAssistant, type FeedItem } from "../assistant";
import { Icon, type IconName } from "../icons";
import { canCaptureScreen, canListen, canSpeak } from "../native";
import { CopyBox } from "../ui";
import { Poster } from "../poster";
import { Avatar, Count, Wave } from "../visual";

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

  const tone = a.busy === "speaking" ? "lime" : a.awaiting ? "saffron" : a.listening || a.watching ? "cobalt" : "fog";
  const on = a.listening || a.watching || !!a.busy;
  const n = (k: FeedItem["kind"]) => a.feed.filter(f => f.kind === k).length;

  return (
    <div className="page live">
      <Poster color={tone} live={on} seed={11}
        kicker="Co-Pilot / Live" aside={<>{status}{a.listening && !a.demo ? ` · ${mins} min` : ""}</>}
        rank={a.listening ? "On air" : a.watching ? "Watching" : "Standby"}>
        <div className="stage">
          <button className={"orb" + (a.listening ? " on" : "")} aria-pressed={a.listening} disabled={a.demo}
            aria-label={a.demo ? "Demo playing" : a.listening ? "Stop listening" : canListen ? "Start listening" : "Play a demo meeting"}
            onClick={() => (a.listening ? stopListening() : canListen ? startListening() : playDemo())}>
            <Icon name={a.listening ? "stop" : a.busy === "speaking" ? "sound" : "mic"} size={40} />
          </button>
          <Wave live={on} />
        </div>
        <p className="caption" aria-live="polite">
          {a.caption ? <>“{a.caption}”</> : a.listening ? <>Say <b>“Co-Pilot”</b></> : canListen ? "Tap to listen" : "Tap to play a demo"}
        </p>
        <div className="tally" aria-label="Picked up so far">
          <Count icon="check" n={n("todo")} label="promises" />
          <Count icon="flag" n={n("decision")} label="decisions" />
          <Count icon="question" n={n("gap")} label="missing" />
          {a.busy === "reading" && <span className="pill"><span className="dot" /> writing</span>}
        </div>
      </Poster>

      <div className="dial" role="group" aria-label="Actions">
        <DialBtn icon="chat" label="Talk" onClick={talkOnce} disabled={!canListen || a.demo || a.busy === "thinking"} />
        <DialBtn icon="sound" label="Brief me" onClick={briefMe} disabled={a.busy === "thinking"} />
        {canCaptureScreen && <DialBtn icon="screen" label={a.watching ? "Stop" : "Screen"} pressed={a.watching} onClick={() => (a.watching ? stopWatching() : startWatching())} />}
        {a.busy === "speaking" && canSpeak && <DialBtn icon="stop" label="Quiet" onClick={hush} />}
        {canListen && !a.listening && <DialBtn icon="spark" label="Demo" onClick={playDemo} />}
      </div>
      {a.error && <p className="err" role="alert">{a.error}</p>}

      <section className="feed-wrap" aria-label="Picked up">
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
          <div className="howto" aria-label="How it works">
            <span><b className="p-cobalt"><Icon name="mic" size={26} /></b>Hear</span>
            <Icon name="arrow" size={18} />
            <span><b className="p-lime"><Icon name="check" size={26} /></b>Track</span>
            <Icon name="arrow" size={18} />
            <span><b className="p-saffron"><Icon name="sound" size={26} /></b>Brief</span>
          </div>
        )}
      </section>

      {(a.listening || a.watching) && <p className="consent"><Icon name="alert" size={14} /> “{CONSENT_LINE}”</p>}
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
