import { useState } from "react";
import { fmtTime } from "../format";
import { Icon, type IconName } from "../icons";
import { store, useCaptures } from "../store";
import { Empty, toast } from "../ui";
import { Count, Faces } from "../visual";

const srcIcon = (s: string): IconName => /screen/i.test(s) ? "screen" : /photo|image|screenshot/i.test(s) ? "image" : /note|file|paste|quick/i.test(s) ? "file" : "mic";

export function Notes({ capture }: { capture: () => void }) {
  const captures = useCaptures();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="page">
      <div className="page-head row-between"><h1>History</h1><button className="icon-btn filled" onClick={capture} aria-label="Add notes or a file" title="Add notes"><Icon name="plus" /></button></div>
      {captures.length ? (
        <ul className="notes timeline">
          {captures.map(c => {
            const open = openId === c.id;
            return (
              <li key={c.id} className="card note">
                <button className="note-head" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}>
                  <span className="note-src" title={c.source}><Icon name={srcIcon(c.source)} size={20} /></span>
                  <span className="note-main">
                    <span className="note-title">{c.title}</span>
                    <span className="meta">
                      <span className="tiny">{fmtTime(c.createdAt)}</span>
                      {!!c.todos.length && <Count icon="check" n={c.todos.length} label="promises" />}
                      {!!c.decisions.length && <Count icon="flag" n={c.decisions.length} label="decisions" />}
                      {!!c.gaps.length && <Count icon="question" n={c.gaps.length} label="missing" tone="warm" />}
                      {!!c.people.length && <Faces names={c.people} max={4} size={22} />}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="note-body">
                    {c.summary && <p>{c.summary}</p>}
                    {!!c.decisions.length && <ul className="ic-list">{c.decisions.map((d, i) => <li key={i}><Icon name="flag" size={15} />{d}</li>)}</ul>}
                    {!!c.todos.length && <ul className="ic-list">{c.todos.map(t => <li key={t.id} className={t.done ? "done" : ""}><Icon name="check" size={15} />{t.task}</li>)}</ul>}
                    <button className="btn small ghost danger" onClick={() => { store.remove(c.id); setOpenId(null); toast("Note removed", () => store.restore(c)); }}>
                      <Icon name="trash" size={14} /> Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <Empty icon="notes" title="Nothing yet" />}
    </div>
  );
}
