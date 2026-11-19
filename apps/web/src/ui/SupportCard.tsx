import { useEffect, useState } from "react";
import crisisLines from "../../../../shared/safety/crisis_lines.json";
import { db, getSettings, getSingleton } from "../store/db";
import { navigate } from "../app/events";
import { openSafety } from "../app/actions";

type Line = { name: string; phone: string | null; alt_phone?: string; url: string; emergency?: string };

/**
 * Support shown in place (docs/06 §4.4): for text the on-device model labels as a *possible*
 * crisis. The crisis line and the user's safety plan are always shown; "Close" only becomes
 * active after they have been on screen for 3 seconds (R7). No network, no model call.
 */
export function SupportCard({ onClose }: { onClose?: () => void }) {
  const [line, setLine] = useState<Line | null>(null);
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [canClose, setCanClose] = useState(false);
  useEffect(() => {
    (async () => {
      const country = (await getSettings()).country;
      const countries = crisisLines.countries as Record<string, Line>;
      setLine(countries[country] ?? (crisisLines.default as Line));
      setContact(await getSingleton(db.trusted_contact));
    })();
    const t = setTimeout(() => setCanClose(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="support-card" role="region" aria-labelledby="support-title">
      <h2 id="support-title">If things feel very heavy right now, you don't have to handle it alone.</h2>
      {line && (
        <div className="support-lines">
          <strong>{line.name}</strong>
          <div className="row">
            {line.phone ? (
              <a className="call" href={`tel:${line.phone.replace(/\s/g, "")}`}>
                Call {line.phone}
              </a>
            ) : (
              <a className="call" href={line.url} target="_blank" rel="noreferrer">
                Find a helpline
              </a>
            )}
            {contact?.phone && (
              <a className="call secondary" href={`tel:${contact.phone.replace(/\s/g, "")}`}>
                Call {contact.name || "my contact"}
              </a>
            )}
          </div>
          {line.emergency && <small>If you are in immediate danger, call {line.emergency}.</small>}
        </div>
      )}
      <div className="row">
        <button className="link" onClick={() => navigate("safety", { edit: "0" })}>
          My safety plan ›
        </button>
        <button className="link" onClick={() => openSafety("button")}>
          More support ›
        </button>
        {onClose && (
          <button className="secondary" disabled={!canClose} onClick={onClose}>
            I'm OK for now
          </button>
        )}
      </div>
    </section>
  );
}
