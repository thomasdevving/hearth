// On-device speech input (docs/05 §3, P1). Audio is class S3: only Chrome's on-device
// recognition (`processLocally`) is used. If it is not available the microphone is hidden;
// the server-based Web Speech recognition is never used.
import { useEffect, useRef, useState } from "react";

type SRCtor = {
  new (): SpeechRec;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

const OPTS = { langs: ["en-US"], processLocally: true };
function ctor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechState = "unsupported" | "downloadable" | "available";

export async function onDeviceSpeech(): Promise<SpeechState> {
  const SR = ctor();
  if (!SR || typeof SR.available !== "function") return "unsupported";
  try {
    const a = await SR.available(OPTS);
    return a === "available" ? "available" : a === "downloadable" || a === "downloading" ? "downloadable" : "unsupported";
  } catch {
    return "unsupported";
  }
}

/**
 * A microphone button that appends what was said to a text field. The availability check runs
 * only when tapped: in some Chromium builds `SpeechRecognition.available()` crashes the tab
 * (docs/PLATFORM_NOTES.md §7), so it must never run on page load. Hidden when the browser has
 * no on-device recognition.
 */
export function MicButton({ onText, label = "Speak" }: { onText: (t: string) => void; label?: string }) {
  const [state, setState] = useState<SpeechState | "unknown">(() => (ctor()?.available ? "unknown" : "unsupported"));
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (state === "unsupported") return note ? <small>{note}</small> : null;
  const start = () => {
    const SR = ctor();
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.processLocally = true;
    if (r.processLocally !== true) return; // never fall back to server recognition
    r.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) onText(t.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };
  return (
    <button
      type="button"
      className={listening ? "primary" : "secondary"}
      aria-pressed={listening}
      onClick={async () => {
        if (listening) return rec.current?.stop();
        let st = state === "unknown" ? await onDeviceSpeech() : state;
        if (st === "downloadable") {
          await ctor()?.install?.(OPTS);
          st = await onDeviceSpeech();
        }
        setState(st);
        if (st === "available") start();
        else setNote("Speech input needs on-device recognition, which this browser does not have. Please type instead.");
      }}
    >
      {listening ? "● Stop" : `🎙 ${label}`}
    </button>
  );
}
