// Device features. On iPhone/Android (Capacitor) these use native plugins, so
// the mic and reminders work properly, including reminders when the app is closed.
// On the web they fall back to what the browser offers.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import type { TodoRef } from "./types";

export const isNative = Capacitor.isNativePlatform();
// The in-Claude test build runs in a frame that blocks the mic and screen sharing.
const inArtifact = import.meta.env.MODE === "artifact";
const lang = navigator.language || "en-US";

/* ---------- speaking replies ---------- */
export const canSpeak = isNative || "speechSynthesis" in window;

export async function speak(text: string, onEnd?: () => void) {
  stopSpeaking();
  if (isNative) {
    await TextToSpeech.speak({ text, lang, rate: 1.0 }).catch(() => {});
    onEnd?.();
    return;
  }
  if (!("speechSynthesis" in window)) return onEnd?.();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find(v => v.lang === lang && /natural|neural|premium|enhanced|google|samantha|aria|jenny/i.test(v.name))
    || voices.find(v => v.lang === lang) || null;
  u.lang = lang;
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (isNative) TextToSpeech.stop().catch(() => {});
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/* ---------- listening (mic) ---------- */
type WebSR = { new (): { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null } };
const WebSpeech = (window as unknown as { SpeechRecognition?: WebSR; webkitSpeechRecognition?: WebSR }).SpeechRecognition
  || (window as unknown as { webkitSpeechRecognition?: WebSR }).webkitSpeechRecognition;

export const canListen = !inArtifact && (isNative || !!WebSpeech);

/** Starts listening. Calls onText with the words so far; resolves when finished. */
export async function listen(onText: (t: string) => void, opts: { continuous?: boolean } = {}): Promise<{ stop: () => void; done: Promise<string> }> {
  if (isNative) {
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new Error("Microphone permission was not given.");
    let last = "";
    await SpeechRecognition.removeAllListeners();
    await SpeechRecognition.addListener("partialResults", d => { last = d.matches?.[0] ?? last; onText(last); });
    const done = SpeechRecognition.start({ language: lang, partialResults: true, popup: false })
      .then(r => r.matches?.[0] ?? last).catch(() => last);
    return { stop: () => { SpeechRecognition.stop().catch(() => {}); }, done };
  }
  if (!WebSpeech) throw new Error("This browser can't listen. Try Chrome, Edge or Safari.");
  const rec = new WebSpeech();
  rec.lang = lang; rec.interimResults = true; rec.continuous = !!opts.continuous;
  let text = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = e => { text = Array.from(e.results).map(r => r[0].transcript).join(" "); onText(text); };
    rec.onend = () => resolve(text);
    rec.onerror = e => (e.error === "no-speech" || e.error === "aborted" ? resolve(text) : reject(new Error("Microphone blocked or unavailable.")));
  });
  rec.start();
  return { stop: () => rec.stop(), done };
}

/** Always-on listening: calls onFinal with each finished sentence and onInterim with words
 *  still being heard. Restarts itself when the browser or phone stops it. */
export function startEar(onFinal: (t: string) => void, onInterim: (t: string) => void, onError: (msg: string) => void): () => void {
  let active = true;
  if (isNative) {
    (async () => {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") { onError("Microphone permission was not given."); return; }
      while (active) {
        const r = await SpeechRecognition.start({ language: lang, partialResults: false, popup: false }).catch(() => ({ matches: [] as string[] }));
        const t = r.matches?.[0]?.trim();
        if (active && t) onFinal(t);
      }
    })();
    return () => { active = false; SpeechRecognition.stop().catch(() => {}); };
  }
  if (!WebSpeech) { onError("This browser can't listen. Try Chrome, Edge or Safari."); return () => {}; }
  let rec: InstanceType<WebSR> | null = null;
  const boot = () => {
    rec = new WebSpeech();
    rec.lang = lang; rec.interimResults = true; rec.continuous = true;
    rec.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) onFinal(t); } else interim += r[0].transcript;
      }
      onInterim(interim.trim());
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { active = false; onError("Microphone blocked. Allow it in your browser's site settings."); }
    };
    rec.onend = () => { if (active) setTimeout(() => active && boot(), 250); };
    try { rec.start(); } catch { /* already started */ }
  };
  boot();
  return () => { active = false; rec?.stop(); };
}

/* ---------- reminders ---------- */
// Native: real OS notifications, scheduled ahead so they fire even when the app is closed.
// Web: a browser notification while a Co-Pilot tab is open (installing the app helps).
const notifId = (key: string) => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) || 1; };

export async function enableReminders(): Promise<boolean> {
  if (isNative) return (await LocalNotifications.requestPermissions()).display === "granted";
  if (!("Notification" in window)) return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function syncReminders(todos: TodoRef[]) {
  if (!isNative) return;
  const want = todos.filter(t => !t.done && t.remindAt && new Date(t.remindAt).getTime() > Date.now());
  const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  if (!want.length) return;
  await LocalNotifications.schedule({
    notifications: want.map(t => ({
      id: notifId(t.cid + "|" + t.id),
      title: "Co-Pilot reminder",
      body: t.task,
      schedule: { at: new Date(t.remindAt!), allowWhileIdle: true },
    })),
  }).catch(() => {});
}

const shown = new Set<string>();
export function webNotify(due: TodoRef[]) {
  if (isNative || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const t of due) {
    const k = t.id + t.remindAt;
    if (shown.has(k)) continue;
    shown.add(k);
    new Notification("Co-Pilot reminder", { body: t.task, tag: k });
  }
}

/* ---------- screen watching (desktop browsers) ---------- */
/** Shares a screen or window and calls onFrame with a snapshot whenever it has changed
 *  noticeably, checking every `everyMs`. Returns a stop function. */
export async function watchScreen(onFrame: (img: { media_type: "image/jpeg"; data: string }) => void, onEnd: () => void, everyMs = 30000): Promise<() => void> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const video = document.createElement("video");
  video.srcObject = stream; video.muted = true; await video.play();
  let last: Uint8ClampedArray | null = null;
  const tiny = document.createElement("canvas"); tiny.width = 64; tiny.height = 36;
  const check = () => {
    if (!video.videoWidth) return;
    const t = tiny.getContext("2d", { willReadFrequently: true })!;
    t.drawImage(video, 0, 0, 64, 36);
    const px = t.getImageData(0, 0, 64, 36).data;
    let diff = 0;
    if (last) for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - last[i]) + Math.abs(px[i + 1] - last[i + 1]) + Math.abs(px[i + 2] - last[i + 2]);
    const changed = !last || diff / (64 * 36 * 3 * 255) > 0.04;
    if (!changed) return;
    last = px;
    const scale = Math.min(1, 1600 / video.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale);
    c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
    onFrame({ media_type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1] });
  };
  const first = setTimeout(check, 1000);
  const timer = setInterval(check, everyMs);
  const stop = () => { clearTimeout(first); clearInterval(timer); stream.getTracks().forEach(t => t.stop()); };
  stream.getVideoTracks()[0].addEventListener("ended", () => { stop(); onEnd(); });
  return stop;
}

/* ---------- screen capture (desktop browsers) ---------- */
export const canCaptureScreen = !inArtifact && !isNative && !!navigator.mediaDevices?.getDisplayMedia;

/** Asks the user to pick a screen or window, grabs one frame as a JPEG, then stops sharing. */
export async function captureScreen(): Promise<{ media_type: "image/jpeg"; data: string; url: string }> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true;
    await video.play();
    await new Promise(r => setTimeout(r, 300)); // let the first frame arrive
    const scale = Math.min(1, 1600 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: url.split(",")[1], url };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}
