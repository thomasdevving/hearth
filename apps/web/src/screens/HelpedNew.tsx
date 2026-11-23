import { useEffect, useRef, useState } from "react";
import { getPeople } from "../app/people";
import { Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { saveNote, userSigns, type Sign } from "../app/helped";
import { db, getSingleton } from "../store/db";

const MAX_SECONDS = 15;

/** Save what helped, in one sentence and/or a short voice note, for one of your signs. */
export function HelpedNew({ params }: { params: Record<string, string> }) {
  const [signs, setSigns] = useState<Sign[]>([]);
  const [sign, setSign] = useState(params.sign ?? "");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [rec, setRec] = useState<{ stop: () => void; left: number } | null>(null);
  const [micError, setMicError] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const s = await userSigns();
      setSigns(s);
      if (!params.sign && s[0]) setSign(s[0].quote);
      setContact((await getPeople())[0]?.name ?? "");
    })();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [params.sign]);

  const record = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudio(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        if (timer.current) clearInterval(timer.current);
        setRec(null);
      };
      mr.start();
      let left = MAX_SECONDS;
      setRec({ stop: () => mr.state === "recording" && mr.stop(), left });
      timer.current = window.setInterval(() => {
        left -= 1;
        if (left <= 0) mr.state === "recording" && mr.stop();
        else setRec((r) => (r ? { ...r, left } : r));
      }, 1000);
    } catch {
      setMicError(true);
    }
  };

  const ok = sign && (text.trim() || audio);
  return (
    <Screen title="What helped" back="my_plan">
      <p className="muted">Next time this sign comes up, Hearth shows it to you. It stays on this device.</p>
      <label className="stack">
        <strong>For which sign?</strong>
        <select value={sign} onChange={(e) => setSign(e.target.value)} aria-label="Sign">
          {signs.map((s) => (
            <option key={s.quote} value={s.quote}>
              “{s.quote}”
            </option>
          ))}
        </select>
      </label>
      <label className="stack">
        <strong>What helped?</strong>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: Calling felt like too much. I texted Maya “walk tomorrow?” and that was easier." />
      </label>
      <div className="row">
        {!rec && (
          <button className="secondary" onClick={record}>
            {audio ? "Record again" : "Record a voice note"}
          </button>
        )}
        {rec && (
          <button className="secondary" onClick={rec.stop} aria-live="polite">
            ■ Stop ({rec.left} s)
          </button>
        )}
        {audio && !rec && <audio controls src={URL.createObjectURL(audio)} aria-label="Your voice note" />}
      </div>
      {micError && <small className="muted">The microphone is not available. You can save the text only.</small>}
      <details className="sci-more">
        <summary>A text you could send (optional)</summary>
        <label className="stack">
          <span>To</span>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Maya" />
        </label>
        <label className="stack">
          <span>Message</span>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Walk tomorrow?" />
        </label>
      </details>
      <div className="row">
        <button
          className="primary"
          disabled={!ok}
          onClick={async () => {
            await saveNote({ signQuote: sign, text: text.trim(), audio, message: message.trim() || null, contactName: contact.trim() || null });
            navigate("my_plan");
          }}
        >
          Save
        </button>
        <button className="secondary" onClick={() => navigate("my_plan")}>
          Cancel
        </button>
      </div>
    </Screen>
  );
}
