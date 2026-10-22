// The poster: a flat colour block with a mono header, a big name, a giant figure,
// a kept-vs-open bar and a pixel field. Used for people, counts, the brief and Live.
import { useEffect, useState, type ReactNode } from "react";

export const COLORS = ["cobalt", "lime", "coral", "fog", "orchid", "jade", "saffron"] as const;
export type PosterColor = (typeof COLORS)[number];

/** A stable colour for a name, so Sam is always the same colour. */
export function colorFor(name: string): PosterColor {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Dithered pixels that thicken toward the right edge. `live` makes them shimmer. */
export function Pixels({ seed = 1, density = 0.5, live = false, bottom = false }: { seed?: number; density?: number; live?: boolean; bottom?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTick(x => x + 1), 260);
    return () => clearInterval(t);
  }, [live]);
  const cols = 12, rows = 8, cell = 8;
  const r = rng(seed * 7919 + tick);
  const cells: ReactNode[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const edge = (x / (cols - 1)) ** 2.2 * (0.35 + 0.65 * Math.abs(y / (rows - 1) - 0.5) * 2);
    if (r() < edge * (0.4 + density)) cells.push(<rect key={x + "-" + y} x={x * cell} y={y * cell} width={cell - 2} height={cell - 2} />);
  }
  return (
    <svg className={"pixels" + (bottom ? " bottom" : "")} viewBox={`0 0 ${cols * cell} ${rows * cell}`} aria-hidden="true" preserveAspectRatio="xMaxYMid meet">{cells}</svg>
  );
}

export function Poster({ color, kicker, aside, rank, title, tag, figure, figureLabel, bar, caption, live, seed, children, onClick, label }: {
  color: PosterColor; kicker?: ReactNode; aside?: ReactNode; rank?: string; title?: ReactNode; tag?: ReactNode;
  figure?: ReactNode; figureLabel?: string; bar?: number; caption?: ReactNode; live?: boolean; seed?: number;
  children?: ReactNode; onClick?: () => void; label?: string;
}) {
  const body = (
    <>
      <Pixels seed={seed ?? 3} live={live} density={bar === undefined ? 0.5 : 1 - bar} />
      <div className="poster-top"><span>{kicker}</span>{aside && <span>{aside}</span>}</div>
      {rank && <span className="poster-rank">{rank}</span>}
      {title && <div className="poster-title">{title}</div>}
      {tag && <span className="poster-tag">{tag}</span>}
      {figureLabel && <span className="poster-flabel">{figureLabel}</span>}
      {figure !== undefined && <div className="poster-figure">{figure}</div>}
      {bar !== undefined && <div className="poster-bar" role="img" aria-label={`${Math.round(bar * 100)}% kept`}><span style={{ width: `${Math.round(bar * 100)}%` }} /></div>}
      {caption && <div className="poster-caption">{caption}</div>}
      {children}
      {figure !== undefined && <Pixels seed={(seed ?? 3) + 40} bottom density={bar === undefined ? 0.5 : 1 - bar} />}
    </>
  );
  return onClick
    ? <button className={"poster p-" + color} onClick={onClick} aria-label={label}>{body}</button>
    : <section className={"poster p-" + color} aria-label={label}>{body}</section>;
}
