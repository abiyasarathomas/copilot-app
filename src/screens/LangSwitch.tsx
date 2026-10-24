import { useSyncExternalStore } from "react";
import { language, LANGS, speechLang } from "../lang";
import { canSpeak, hasVoiceFor } from "../native";

/** English / Malayalam: what Co-Pilot listens for, speaks and writes down. */
export function LangSwitch({ note = false }: { note?: boolean }) {
  const lang = useSyncExternalStore(language.subscribe, language.get);
  return (
    <div className="lang">
      <div className="lang-switch" role="radiogroup" aria-label="Voice language">
        {LANGS.map(l => (
          <button key={l.id} role="radio" aria-checked={lang === l.id} lang={l.id} onClick={() => language.set(l.id)}>{l.label}</button>
        ))}
      </div>
      {note && lang === "ml" && canSpeak && !hasVoiceFor(speechLang()) && (
        <p className="muted small">No Malayalam voice on this device yet. Add one in your text-to-speech settings (Android: Google Text-to-speech → Malayalam).</p>
      )}
    </div>
  );
}
