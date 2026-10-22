import { useRef, useState } from "react";
import { api, type Image } from "./api";
import { canCaptureScreen, canListen, captureScreen, listen } from "./native";
import { allTodos, newId, store, todayISO, useCaptures } from "./store";

const SOURCES = [
  ["Meeting", "Meeting"], ["Conversation", "In-person chat"], ["Notes", "My notes"],
  ["Email/Chat", "Email or chat"], ["Screen", "What I'm working on"], ["Call", "Call"],
] as const;

type Shot = Image & { url: string };

// Shrinks big screenshots so uploads stay quick and under the server's size limit.
async function toImage(file: Blob): Promise<Shot> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: url.split(",")[1], url };
}

const cleanTranscript = (t: string) => t
  .replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "")
  .replace(/^\d{2}:\d{2}[:.,\d]*\s*-->\s*[\d:.,]+.*$/gm, "").replace(/\n{2,}/g, "\n").trim();

export function Capture() {
  const captures = useCaptures();
  const [source, setSource] = useState<string>("Meeting");
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const base = useRef("");

  const addFiles = async (files: Iterable<File>) => {
    const imgs = [...files].filter(f => f.type.startsWith("image/"));
    const next = await Promise.all(imgs.map(toImage));
    setShots(s => [...s, ...next].slice(0, 5));
  };

  const record = async () => {
    if (rec) { rec.stop(); return; }
    setErr(""); base.current = text ? text.trimEnd() + "\n" : "";
    try {
      const r = await listen(t => setText(base.current + t), { continuous: true });
      setRec(r);
      await r.done;
    } catch (e) { setErr((e as Error).message); }
    setRec(null);
  };

  const grabScreen = async () => {
    setErr("");
    try { const s = await captureScreen(); setShots(x => [...x, s].slice(0, 5)); setSource("Screen"); }
    catch { /* user cancelled the picker */ }
  };

  const brief = async () => {
    if (!text.trim() && !shots.length) return;
    setBusy(true); setErr("");
    try {
      const existingGroups = [...new Set(allTodos(captures).map(t => t.group))];
      const r = await api.brief({ text: text.trim(), source, today: todayISO(), existingGroups, images: shots.map(({ media_type, data }) => ({ media_type, data })) });
      store.add({
        source, title: r.title || source, summary: r.summary, decisions: r.decisions, people: r.people, raw: text.slice(0, 4000),
        todos: r.todos.map(t => ({ ...t, id: newId("t"), group: t.group || "General", done: false })),
        gaps: r.gaps.map(g => ({ ...g, id: newId("g"), done: false })),
      });
      setText(""); setShots([]); setHint("Captured. Add the next one whenever you're ready.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel" aria-labelledby="capH">
      <div className="row between"><h2 id="capH">Capture</h2><span className="label">Anything from work</span></div>
      <div className="row" role="group" aria-label="What is this?">
        {SOURCES.map(([v, label]) => (
          <button key={v} className="pill" aria-pressed={source === v} onClick={() => setSource(v)}>{label}</button>
        ))}
      </div>
      <textarea
        aria-label="Notes or transcript"
        placeholder="Paste meeting notes, a transcript, an email thread, or what someone told you in the hallway. You can paste screenshots here too."
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={e => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addFiles(f); } }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      />
      <div className="attach">
        {canListen && <button className="ghost" onClick={record} aria-pressed={!!rec}>{rec ? "Stop recording" : "Record a conversation"}</button>}
        {canCaptureScreen && <button className="ghost" onClick={grabScreen}>Capture my screen</button>}
        <span className="file"><button className="ghost" type="button" tabIndex={-1}>Add screenshot</button>
          <input type="file" accept="image/*" multiple aria-label="Add screenshots" onChange={e => { addFiles(e.target.files ?? []); e.target.value = ""; }} /></span>
        <span className="file"><button className="ghost" type="button" tabIndex={-1}>Upload transcript</button>
          <input type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt" aria-label="Upload a call transcript"
            onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(cleanTranscript(await f.text())); setSource("Call"); } e.target.value = ""; }} /></span>
      </div>
      {rec && <p className="hint">Listening. Co-Pilot writes down what it hears; tap Stop recording when you're done.</p>}
      {!!shots.length && <div className="thumbs">{shots.map((s, i) => (
        <div className="thumb" key={i}><img src={s.url} alt={`Screenshot ${i + 1}`} />
          <button aria-label="Remove screenshot" onClick={() => setShots(x => x.filter((_, j) => j !== i))}>×</button></div>
      ))}</div>}
      <div className="row between">
        <p className="hint">{hint}</p>
        <button className="primary" disabled={busy || (!text.trim() && !shots.length)} onClick={brief}>{busy ? "Reading…" : "Brief me"}</button>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}
