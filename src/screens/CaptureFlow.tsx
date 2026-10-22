import { useRef, useState } from "react";
import { api, type BriefResult, type Image } from "../api";
import { fmtDue } from "../format";
import { Icon } from "../icons";
import { canCaptureScreen, canListen, captureScreen, listen } from "../native";
import { allTodos, newId, store, todayISO, useCaptures } from "../store";
import { Sheet, toast } from "../ui";

const SOURCES = [
  ["Meeting", "Meeting"], ["Conversation", "In-person chat"], ["Call", "Call"],
  ["Notes", "My notes"], ["Email/Chat", "Email or chat"], ["Screen", "My screen"],
] as const;

const EXAMPLE = `Weekly sync with Priya and Sam, Tuesday.
Priya: budget for Q4 is approved but finance wants the revised sheet by Friday. I said I'd send it.
Sam will draft the vendor shortlist, no date set.
We agreed to move the launch review to next week. Someone needs to book a room.
Open question: do we still need legal sign-off for the pilot?`;

type Shot = Image & { url: string };

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

export function CaptureFlow({ example, onClose, onSaved }: { example?: boolean; onClose: () => void; onSaved: () => void }) {
  const captures = useCaptures();
  const [step, setStep] = useState<"input" | "reading" | "review">("input");
  const [source, setSource] = useState<string>("Meeting");
  const [text, setText] = useState(example ? EXAMPLE : "");
  const [shots, setShots] = useState<Shot[]>([]);
  const [err, setErr] = useState("");
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const base = useRef("");

  const addFiles = async (files: Iterable<File>) => {
    const imgs = [...files].filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const next = await Promise.all(imgs.map(toImage));
    setShots(s => [...s, ...next].slice(0, 5));
  };

  const record = async () => {
    if (rec) { rec.stop(); return; }
    setErr(""); base.current = text ? text.trimEnd() + "\n" : "";
    try {
      const r = await listen(t => setText(base.current + t), { continuous: true });
      setRec(r); await r.done;
    } catch (e) { setErr((e as Error).message); }
    setRec(null);
  };

  const grabScreen = async () => {
    try { const s = await captureScreen(); setShots(x => [...x, s].slice(0, 5)); setSource("Screen"); }
    catch { /* picker cancelled */ }
  };

  const read = async () => {
    rec?.stop();
    setStep("reading"); setErr("");
    try {
      const existingGroups = [...new Set(allTodos(captures).map(t => t.group))];
      const r = await api.brief({ text: text.trim(), source, today: todayISO(), existingGroups, images: shots.map(({ media_type, data }) => ({ media_type, data })) });
      setResult(r); setSkip(new Set()); setStep("review");
    } catch (e) { setErr((e as Error).message); setStep("input"); }
  };

  const save = () => {
    if (!result) return;
    const todos = result.todos.filter((_, i) => !skip.has(i));
    store.add({
      source, title: result.title || source, summary: result.summary, decisions: result.decisions, people: result.people, raw: text.slice(0, 4000),
      todos: todos.map(t => ({ ...t, id: newId("t"), group: t.group || "General", done: false })),
      gaps: result.gaps.map(g => ({ ...g, id: newId("g"), done: false })),
    });
    toast(`Saved ${todos.length} to-do${todos.length === 1 ? "" : "s"} from ${result.title || source}`);
    onSaved();
  };

  const ready = !!text.trim() || !!shots.length;

  if (step === "reading") {
    return (
      <Sheet title="New capture" onClose={onClose}>
        <div className="reading" role="status">
          <span className="spinner" aria-hidden="true" />
          <strong>Reading your {source === "Screen" ? "screen" : "notes"}…</strong>
          <p className="muted">Finding to-dos, owners, dates and anything left open.</p>
        </div>
      </Sheet>
    );
  }

  if (step === "review" && result) {
    const kept = result.todos.length - skip.size;
    return (
      <Sheet title="Review" onClose={onClose} footer={<>
        <button className="btn ghost" onClick={() => setStep("input")}><Icon name="back" size={16} /> Edit notes</button>
        <button className="btn primary" onClick={save}>Save {kept} to-do{kept === 1 ? "" : "s"}</button>
      </>}>
        <div className="review">
          <div>
            <span className="tag">{source}</span>
            <h3 className="review-title">{result.title}</h3>
            {result.summary && <p>{result.summary}</p>}
          </div>
          {!!result.decisions.length && <div><h4>Decisions</h4><ul className="plain">{result.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></div>}
          <div>
            <h4>To-dos <span className="muted">· untick any you don't want</span></h4>
            {result.todos.length ? <ul className="pick">{result.todos.map((t, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={!skip.has(i)} onChange={() => setSkip(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                  <span>
                    <span className="todo-task">{t.task}</span>
                    <span className="meta">
                      {t.owner ? <span>{t.owner}</span> : <span className="warn">No owner</span>}
                      {t.due ? <span>Due {fmtDue(t.due)}</span> : <span className="warn">No date</span>}
                      <span>{t.group}</span>
                      <span className={"pri " + t.priority}>{t.priority}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}</ul> : <p className="muted">No to-dos found.</p>}
          </div>
          {!!result.gaps.length && <div>
            <h4>Missing pieces</h4>
            <ul className="gaps">{result.gaps.map((g, i) => <li key={i} className="gap"><span className="gap-issue">{g.issue}</span>{g.ask && <span className="gap-ask">Next step: {g.ask}</span>}</li>)}</ul>
          </div>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="New capture" onClose={onClose} footer={<>
      <span className="muted small">{ready ? "" : "Add notes, a recording or a screenshot"}</span>
      <button className="btn primary" disabled={!ready} onClick={read}><Icon name="spark" /> Brief me</button>
    </>}>
      <div className="capture">
        <fieldset>
          <legend>What is it?</legend>
          <div className="chips">
            {SOURCES.map(([v, label]) => <button key={v} type="button" className="chip" aria-pressed={source === v} onClick={() => setSource(v)}>{label}</button>)}
          </div>
        </fieldset>

        <div className="tools">
          {canListen && <button type="button" className={"tool" + (rec ? " live" : "")} onClick={record} aria-pressed={!!rec}>
            <Icon name={rec ? "stop" : "mic"} /><span>{rec ? "Stop" : "Record"}</span></button>}
          {canCaptureScreen && <button type="button" className="tool" onClick={grabScreen}><Icon name="screen" /><span>Screen</span></button>}
          <label className="tool"><Icon name="image" /><span>Screenshot</span>
            <input type="file" accept="image/*" multiple className="sr" onChange={e => { addFiles(e.target.files ?? []); e.target.value = ""; }} /></label>
          <label className="tool"><Icon name="file" /><span>Transcript</span>
            <input type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt" className="sr"
              onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(cleanTranscript(await f.text())); setSource("Call"); } e.target.value = ""; }} /></label>
        </div>
        {rec && <p className="live-note"><span className="dot" /> Listening. Co-Pilot types what it hears.</p>}

        <label className="sr" htmlFor="cap-text">Notes</label>
        <textarea id="cap-text" value={text} onChange={e => setText(e.target.value)}
          placeholder="Paste or type notes, a transcript, an email thread, or what someone told you. You can paste screenshots here too."
          onPaste={e => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addFiles(f); } }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }} />
        {example && text === EXAMPLE && <p className="tiny">This is an example note. Tap Brief me to see what Co-Pilot does with it.</p>}

        {!!shots.length && <div className="thumbs">{shots.map((s, i) => (
          <div className="thumb" key={i}><img src={s.url} alt={`Screenshot ${i + 1}`} />
            <button type="button" aria-label="Remove screenshot" onClick={() => setShots(x => x.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button></div>
        ))}</div>}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}
