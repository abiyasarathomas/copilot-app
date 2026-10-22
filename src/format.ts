import { todayISO } from "./store";

export const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDue = (due: string) => new Date(due + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const localInput = (iso?: string | null) => { const d = iso ? new Date(iso) : new Date(Date.now() + 36e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export type Bucket = "Overdue" | "Today" | "This week" | "Later" | "No date";
export function whenBucket(due: string | null): Bucket {
  if (!due) return "No date";
  const days = Math.round((+new Date(due + "T00:00:00") - +new Date(todayISO() + "T00:00:00")) / 864e5);
  return days < 0 ? "Overdue" : days === 0 ? "Today" : days <= 7 ? "This week" : "Later";
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
}
