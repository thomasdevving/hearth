import { useEffect, useState } from "react";
import type { HelpedNote } from "../store/db";
import { archiveNote, draftText, openMessage } from "../app/helped";
import { ModelBadge } from "./kit";
import { quotedMessage } from "@hearth/engine";

function monthYear(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A note the user saved about what helped them, brought back in their own words. */
export function HelpedCard({ note, signQuote, compact = false }: { note: HelpedNote; signQuote?: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ message: string; ranOn: "on_device" | "cloud" | "template" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!note.audio) return;
    const u = URL.createObjectURL(note.audio);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [note.audio]);
  const canDraft = !!(note.message || quotedMessage(note.text) || note.contactName);
  return (
    <article className={`helped-card${compact ? " compact" : ""}`}>
      <p className="helped-eyebrow">{signQuote ? <>What helped you last time</> : <>Saved {monthYear(note.createdAt)}</>}</p>
      <blockquote>{note.text}</blockquote>
      {signQuote && <small className="muted">Saved {monthYear(note.createdAt)}, for “{signQuote}”</small>}
      {url && <audio controls preload="none" src={url} aria-label="Your voice note" />}
      {canDraft && !draft && (
        <div className="row">
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setDraft(await draftText(note));
              setBusy(false);
            }}
          >
            {busy ? "Writing on this device…" : "Draft that text"}
          </button>
          {compact && (
            <button className="link" onClick={() => archiveNote(note.id)}>
              Archive
            </button>
          )}
        </div>
      )}
      {draft && (
        <div className="helped-draft">
          <label className="stack">
            <span className="row" style={{ margin: 0, justifyContent: "space-between" }}>
              <strong>{note.contactName ? `To ${note.contactName}` : "Your text"}</strong>
              <ModelBadge ranOn={draft.ranOn} />
            </span>
            <textarea rows={2} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary" disabled={!draft.message.trim()} onClick={async () => setSent(await openMessage(draft.message))}>
              Open in Messages
            </button>
          </div>
          <small className="muted">{sent === "copied" ? "Copied. Paste it into your messages." : "Hearth never sends anything. You choose if and when."}</small>
        </div>
      )}
    </article>
  );
}
