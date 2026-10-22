import type Anthropic from "@anthropic-ai/sdk";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "./native";
import { runTool, type Input } from "./tools";

type Msg = { cls: "me" | "bot" | "act"; text: string };
export function Talk() {
  const [msgs, setMsgs] = useState<Msg[]>([{ cls: "bot", text: "Hi. Ask what's on your plate, or tell me something to remember." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakOn, setSpeakOn] = useState(() => { try { return localStorage.getItem("copilot.speak") !== "0"; } catch { return true; } });
  const [mic, setMic] = useState<{ stop: () => void } | null>(null);
  const history = useRef<Anthropic.Beta.BetaMessageParam[]>([]);
  const chatEl = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEl.current?.scrollTo(0, chatEl.current.scrollHeight); }, [msgs]);
  useEffect(() => { try { localStorage.setItem("copilot.speak", speakOn ? "1" : "0"); } catch { /* ignore */ } if (!speakOn) stopSpeaking(); }, [speakOn]);

  const add = (m: Msg) => setMsgs(x => [...x, m]);

  const send = async (text: string) => {
    text = text.trim(); if (!text || busy) return;
    setInput(""); stopSpeaking(); add({ cls: "me", text }); setBusy(true);
    // Keep the last few exchanges. Claude's replies go back exactly as received.
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
    <section className="panel voice" aria-labelledby="talkH">
      <div className="row between">
        <h2 id="talkH">Talk to Co-Pilot</h2>
        {canSpeak && <label className="toggle"><input type="checkbox" checked={speakOn} onChange={e => setSpeakOn(e.target.checked)} /> Speak replies</label>}
      </div>
      <div className="chat" ref={chatEl} aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={"msg " + m.cls}>{m.text}</div>)}
        {busy && <div className="msg bot">Thinking…</div>}
      </div>
      <form className="talk" onSubmit={e => { e.preventDefault(); send(input); }}>
        {canListen && (
          <button className="mic" type="button" aria-pressed={!!mic} aria-label="Speak to Co-Pilot" onClick={talk}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
        )}
        <textarea aria-label="Message to Co-Pilot" placeholder="Ask or tell Co-Pilot anything" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="primary" type="submit" disabled={busy}>Send</button>
      </form>
    </section>
  );
}
