// Which language Co-Pilot hears and speaks. The screens stay in English; what you
// say, what it says back, and what it writes down follow this setting.
import { read, write } from "./format";

export type Lang = "en" | "ml";
export const LANGS: { id: Lang; label: string; speech: string }[] = [
  { id: "en", label: "English", speech: "" },
  { id: "ml", label: "മലയാളം", speech: "ml-IN" },
];
const subs = new Set<() => void>();
export const language = {
  get: (): Lang => (read<Lang>("copilot.lang", "en") === "ml" ? "ml" : "en"),
  set(v: Lang) { write("copilot.lang", v); subs.forEach(s => s()); },
  subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; },
};
/** BCP 47 tag for speech recognition and the voice. */
export const speechLang = () => LANGS.find(l => l.id === language.get())!.speech || navigator.language || "en-US";
