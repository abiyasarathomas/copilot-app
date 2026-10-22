import { useState } from "react";
import { fmtTime } from "../format";
import { Icon } from "../icons";
import { store, useCaptures } from "../store";
import { Empty, toast } from "../ui";

export function Notes({ capture }: { capture: () => void }) {
  const captures = useCaptures();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="page">
      <div className="page-head"><h1>History</h1><p className="muted">Every conversation, screen session and note Co-Pilot has picked up, newest first. Saved on this device.</p></div>
      <button className="btn ghost self-start" onClick={capture}><Icon name="file" size={18} /> Add notes or a file</button>
      {captures.length ? (
        <ul className="notes">
          {captures.map(c => {
            const open = openId === c.id;
            return (
              <li key={c.id} className="card note">
                <button className="note-head" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}>
                  <span className="note-title">{c.title}</span>
                  <span className="tag">{c.source}</span>
                  <span className="tiny">{fmtTime(c.createdAt)} · {c.todos.length} to-dos · {c.gaps.length} missing</span>
                </button>
                {open && (
                  <div className="note-body">
                    {c.summary && <p>{c.summary}</p>}
                    {!!c.decisions.length && <><h4>Decisions</h4><ul>{c.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
                    {!!c.people.length && <><h4>People</h4><p>{c.people.join(", ")}</p></>}
                    {!!c.todos.length && <><h4>To-dos</h4><ul>{c.todos.map(t => <li key={t.id} className={t.done ? "done" : ""}>{t.task}</li>)}</ul></>}
                    <button className="btn small ghost danger" onClick={() => { store.remove(c.id); setOpenId(null); toast("Note removed", () => store.restore(c)); }}>
                      <Icon name="trash" size={14} /> Remove note
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <Empty icon="notes" title="Nothing yet">
        Each conversation Co-Pilot hears is kept here with its summary and decisions.
      </Empty>}
    </div>
  );
}
