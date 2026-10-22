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
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null } };
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
