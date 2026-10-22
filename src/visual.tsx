// Small pictures that stand in for words: a person's coloured initials, a kept ring,
// a due-date chip, a who-owes-whom arrow and a live sound wave.
import { useEffect, useState } from "react";
import { fmtDue, whenBucket } from "./format";
import { Icon, type IconName } from "./icons";
import { colorFor } from "./poster";

const isMe = (n: string | null | undefined) => !n || /^me$/i.test(n);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

/** A round badge in the person's colour. "me" draws as an ink "You". */
export function Avatar({ name, size = 32, title }: { name: string | null | undefined; size?: number; title?: string }) {
  const me = isMe(name);
  return (
    <span className={"av" + (me ? " me" : " p-" + colorFor(name!))} style={{ width: size, height: size, fontSize: Math.round(size * (me ? 0.3 : 0.4)) }}
      title={title ?? (me ? "You" : name!)} role="img" aria-label={title ?? (me ? "You" : name!)}>
      {me ? "You" : initials(name!)}
    </span>
  );
}

/** Two avatars with an arrow: who has to do it, and who it's for. */
export function Flow({ from, to }: { from: string | null | undefined; to: string | null | undefined }) {
  return (
    <span className="flow" role="img" aria-label={`${isMe(from) ? "You" : from} to ${to ? (isMe(to) ? "you" : to) : "nobody named"}`}>
      <Avatar name={from} size={24} title="" />
      <Icon name="arrow" size={14} />
      {to ? <Avatar name={to} size={24} title="" /> : <span className="av ghost" title="For whom?" style={{ width: 24, height: 24 }}><Icon name="question" size={14} /></span>}
    </span>
  );
}

/** A donut showing a share from 0 to 1, with whatever goes in the middle. */
export function Ring({ value, size = 64, stroke = 8, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-fill"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="butt" />
      </svg>
      <span className="ring-mid">{children ?? `${Math.round(v * 100)}%`}</span>
    </span>
  );
}

/** Calendar chip; red when late, amber when due today. */
export function Due({ due }: { due: string | null }) {
  const b = whenBucket(due);
  if (!due) return <span className="pill warm" title="No date"><Icon name="calendar" size={13} /> ?</span>;
  return <span className={"pill" + (b === "Overdue" ? " hot" : b === "Today" ? " warm" : "")} title={b}><Icon name="calendar" size={13} /> {b === "Today" ? "Today" : fmtDue(due)}</span>;
}

/** An icon with a count beside it. */
export function Count({ icon, n, label, tone }: { icon: IconName; n: number; label: string; tone?: "hot" | "warm" | "ok" }) {
  return <span className={"pill" + (tone ? " " + tone : "")} title={label} aria-label={`${n} ${label}`}><Icon name={icon} size={13} /> {n}</span>;
}

/** A row of overlapping avatars, with "+3" past the limit. */
export function Faces({ names, max = 5, size = 28 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="faces" aria-label={names.join(", ")}>
      {shown.map(n => <Avatar key={n} name={n} size={size} />)}
      {names.length > max && <span className="av more" style={{ width: size, height: size }}>+{names.length - max}</span>}
    </span>
  );
}

/** Sound bars: still when idle, moving when live. */
export function Wave({ live, bars = 28 }: { live: boolean; bars?: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const i = setInterval(() => setT(x => x + 1), 120);
    return () => clearInterval(i);
  }, [live]);
  return (
    <svg className="wave" viewBox={`0 0 ${bars * 6} 40`} preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const base = 0.25 + 0.75 * Math.sin((i / (bars - 1)) * Math.PI);
        const h = live ? Math.max(3, 40 * base * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + t * 0.9) * Math.cos(i * 0.6 - t * 0.4)))) : 3;
        return <rect key={i} x={i * 6 + 1} y={(40 - h) / 2} width={3.5} height={h} rx={1.5} />;
      })}
    </svg>
  );
}
