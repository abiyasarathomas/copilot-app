import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { fmtTime, localInput } from "./format";
import { Icon } from "./icons";
import { counterpart, sideOf, store } from "./store";
import type { GapRef, TodoRef } from "./types";
import { Due, Flow } from "./visual";

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; undo?: () => void };
let toasts: Toast[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(s => s());
export function toast(text: string, undo?: () => void) {
  const t = { id: Date.now() + Math.random(), text, undo };
  toasts = [...toasts.slice(-2), t]; emit();
  setTimeout(() => { toasts = toasts.filter(x => x !== t); emit(); }, undo ? 6000 : 3500);
}
export function Toasts() {
  const list = useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map(t => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.undo && <button className="toast-undo" onClick={() => { t.undo!(); toasts = toasts.filter(x => x !== t); emit(); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- full-screen sheet (phone) / centered dialog (desktop) ---------- */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- one to-do ---------- */
// Pictures over words: who-to-whom avatars, a calendar chip, a priority stripe,
// and missing pieces as warning chips. The task and its quote are the only prose.
export function TodoRow({ t, showOwner = true }: { t: TodoRef; showGroup?: boolean; showOwner?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(localInput(t.remindAt));
  const toggle = () => {
    store.setTodo(t.cid, t.id, { done: !t.done });
    if (!t.done) toast("Marked done", () => store.setTodo(t.cid, t.id, { done: false }));
  };
  const owed = sideOf(t) === "owed";
  return (
    <div className={"todo pri-" + t.priority + (t.done ? " done" : "")}>
      <button className={"check" + (t.done ? " on" : "")} onClick={toggle} aria-pressed={t.done} aria-label={(t.done ? "Mark not done: " : "Mark done: ") + t.task}>
        {t.done && <Icon name="check" size={14} />}
      </button>
      <div className="todo-main">
        <div className="todo-task">{t.task}</div>
        {t.quote && <q className="said"><Icon name="quote" size={12} />{t.quote}</q>}
        <div className="meta">
          {showOwner && <Flow from={owed ? counterpart(t) : "me"} to={owed ? "me" : counterpart(t)} />}
          <Due due={t.due} />
          {!t.owner && <span className="pill warm" title="No owner"><Icon name="user" size={13} /> ?</span>}
          {t.remindAt && <span className="pill" title="Reminder"><Icon name="bell" size={13} /> {fmtTime(t.remindAt)}</span>}
        </div>
        {editing && (
          <div className="remind">
            <label className="sr" htmlFor={"r-" + t.id}>Reminder time</label>
            <input id={"r-" + t.id} type="datetime-local" value={v} onChange={e => setV(e.target.value)} />
            <button className="btn small" onClick={() => { if (v) { store.setTodo(t.cid, t.id, { remindAt: new Date(v).toISOString() }); toast("Reminder set"); } setEditing(false); }}>Set</button>
            {t.remindAt && <button className="btn small ghost" onClick={() => { store.setTodo(t.cid, t.id, { remindAt: null }); setEditing(false); }}>Clear</button>}
          </div>
        )}
      </div>
      <div className="todo-side">
        {!t.done && <button className="icon-btn small" onClick={() => setEditing(e => !e)} aria-label={"Reminder for " + t.task} aria-expanded={editing}><Icon name="bell" size={16} /></button>}
      </div>
    </div>
  );
}

export function GapCard({ g }: { g: GapRef }) {
  return (
    <li className="gap">
      <span className="gap-icon"><Icon name="question" size={20} /></span>
      <div className="gap-main">
        <span className="gap-issue">{g.issue}</span>
        {g.ask && <span className="gap-ask"><Icon name="arrow" size={14} /> {g.ask}</span>}
      </div>
      <button className="btn small ghost" aria-label={"Mark sorted: " + g.issue} onClick={() => { store.setGapDone(g.cid, g.id, true); toast("Marked sorted", () => store.setGapDone(g.cid, g.id, false)); }}>
        <Icon name="check" size={16} /> Sorted
      </button>
    </li>
  );
}

/* ---------- a drafted message to copy ---------- */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Older browsers and some embedded pages block the clipboard API.
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}
export function CopyBox({ text, onChange, onRewrite, busy }: { text: string; onChange?: (v: string) => void; onRewrite?: () => void; busy?: boolean }) {
  const copy = async () => toast(await copyText(text) ? "Copied. Paste it wherever you talk." : "Couldn't copy. Select the text and copy it.");
  return (
    <div className="copybox">
      {onChange ? <><label className="sr" htmlFor="draft-text">Draft</label><textarea id="draft-text" value={text} onChange={e => onChange(e.target.value)} rows={6} /></>
        : <p className="copy-text">{text}</p>}
      <div className="row">
        <button className="btn primary small" onClick={copy} disabled={!text}><Icon name="copy" size={14} /> Copy</button>
        {onRewrite && <button className="btn ghost small" onClick={onRewrite} disabled={busy}>{busy ? "Rewriting…" : "Rewrite"}</button>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={36} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
