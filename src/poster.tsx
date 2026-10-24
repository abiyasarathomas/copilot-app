// Each person gets a stable colour from this palette, so Sam is always the same colour.
export const COLORS = ["cobalt", "lime", "coral", "fog", "orchid", "jade", "saffron"] as const;
export type PosterColor = (typeof COLORS)[number];

export function colorFor(name: string): PosterColor {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
