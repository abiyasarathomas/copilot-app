import type Anthropic from "@anthropic-ai/sdk";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { read, write } from "../format";
import { Icon } from "../icons";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "../native";
import { runTool, type Input } from "../tools";

type Msg = { cls: "me" | "bot" | "act"; text: string };
const SUGGESTIONS = ["What should I do first today?", "What am I waiting on from others?", "Remind me to call Sam at 3pm"];

export function Ask() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakOn, setSpeakOn] = useState(() => read("copilot.speak", true));
  const [mic, setMic] = useState<{ stop: () => void } | null>(null);
  const history = useRef<Anthropic.Beta.BetaMessageParam[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  useEffect(() => { write("copilot.speak", speakOn); if (!speakOn) stopSpeaking(); }, [speakOn]);
  useEffect(() => () => stopSpeaking(), []);

  const add = (m: Msg) => setMsgs(x => [...x, m]);

  const send = async (text: string) => {
    text = text.trim(); if (!text || busy) return;
    setInput(""); stopSpeaking(); add({ cls: "me", text }); setBusy(true);
    // Claude's replies go back exactly as received; the tools run on this device.
    const turns: Anthropic.Beta.BetaMessageParam[] = [...history.current, { role: "user", content: text }];
    try {
      for (let step = 0; step < 6; step++) {
        const r = await api.chat({ now: new Date().toString(), messages: turns }, t => add({ cls: "act", text: t }));
        turns.push({ role: "assistant", content: r.content });
        if (r.stop_reason !== "tool_use") {
          const reply = r.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
          add({ cls: "bot", text: reply || "Done." });
          if (speakOn && reply) speak(reply);
          history.current = turns.slice(-20);
          while (history.current[0] && (history.current[0].role !== "user" || typeof history.current[0].content !== "string")) history.current.shift();
          return;
        }
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = r.content.flatMap(b => {
          if (b.type !== "tool_use") return [];
          try {
            return [{ type: "tool_result" as const, tool_use_id: b.id, content: JSON.stringify(runTool(b.name, (b.input ?? {}) as Input, t => add({ cls: "act", text: t }))) }];
          } catch (e) {
            return [{ type: "tool_result" as const, tool_use_id: b.id, content: (e as Error).message, is_error: true }];
          }
        });
        turns.push({ role: "user", content: results });
      }
      add({ cls: "bot", text: "That took too many steps. Try asking a simpler way." });
    } catch (e) {
      add({ cls: "bot", text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const talk = async () => {
    if (mic) { mic.stop(); return; }
    stopSpeaking();
    try {
      const r = await listen(t => setInput(t));
      setMic(r);
      const said = await r.done;
      setMic(null);
      if (said.trim()) send(said);
    } catch (e) { setMic(null); add({ cls: "bot", text: (e as Error).message }); }
  };

  return (
    <div className="page ask">
      <div className="page-head row-between">
        <h1>Ask Co-Pilot</h1>
        {canSpeak && <label className="toggle-row"><input type="checkbox" checked={speakOn} onChange={e => setSpeakOn(e.target.checked)} /> Speak replies</label>}
      </div>

      <div className="chat" aria-live="polite">
        {!msgs.length && (
          <div className="chat-intro">
            <p className="muted">Ask about your work, or tell Co-Pilot something to remember. It can add to-dos, tick them off and set reminders.</p>
            <div className="suggest">{SUGGESTIONS.map(s => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => <div key={i} className={"msg " + m.cls}>{m.cls === "act" && <Icon name="check" size={12} />}{m.text}</div>)}
        {busy && <div className="msg bot typing" aria-label="Co-Pilot is thinking"><span /><span /><span /></div>}
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={e => { e.preventDefault(); send(input); }}>
        {canListen && (
          <button className={"icon-btn mic" + (mic ? " live" : "")} type="button" aria-pressed={!!mic} aria-label={mic ? "Stop listening" : "Speak to Co-Pilot"} onClick={talk}>
            <Icon name={mic ? "stop" : "mic"} />
          </button>
        )}
        <label className="sr" htmlFor="ask-in">Message to Co-Pilot</label>
        <textarea id="ask-in" rows={1} placeholder={mic ? "Listening…" : "Message Co-Pilot"} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="icon-btn filled" type="submit" disabled={busy || !input.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
