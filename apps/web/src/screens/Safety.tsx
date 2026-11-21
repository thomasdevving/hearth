import { useEffect, useState } from "react";
import crisisLines from "../../../../shared/safety/crisis_lines.json";
import { db, getSettings, getSingleton, putSingleton } from "../store/db";
import { navigate } from "../app/events";

type Line = { name: string; phone: string | null; alt_phone?: string; sms?: string; url: string; emergency?: string };

/**
 * The safety flow (docs/06 §4). Bundled data only, no network and no model call. The Back
 * button is enabled only after the resources have been visible for 3 seconds (R7).
 */
export function Safety({ params }: { params: Record<string, string> }) {
  const [country, setCountry] = useState("NL");
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [plan, setPlan] = useState<{ warningSigns: string; helps: string; whoToCall: string } | null>(null);
  const [canLeave, setCanLeave] = useState(false);
  const [editing, setEditing] = useState(params.edit === "1");
  useEffect(() => {
    (async () => {
      setCountry((await getSettings()).country);
      setContact(await getSingleton(db.trusted_contact));
      setPlan(await getSingleton(db.safety_plan));
    })();
    const t = setTimeout(() => setCanLeave(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const countries = crisisLines.countries as Record<string, Line>;
  const line: Line = countries[country] ?? (crisisLines.default as Line);
  const p = plan ?? { warningSigns: "", helps: "", whoToCall: "" };
  return (
    <div className="safety" role="dialog" aria-modal="true" aria-labelledby="safety-title">
      <div className="safety-inner">
        <h1 id="safety-title">It sounds like things are very hard right now. You don't have to handle this alone.</h1>
        <div>
          <p>
            <strong>{line.name}</strong>
          </p>
          {line.phone ? (
            <a className="call" href={`tel:${line.phone.replace(/\s/g, "")}`}>
              Call {line.phone}
            </a>
          ) : (
            <a className="call" href={line.url} target="_blank" rel="noreferrer">
              Find a helpline
            </a>
          )}
          {line.sms && (
            <a className="call secondary" href={`sms:${line.sms}`}>
              Text {line.sms}
            </a>
          )}
          {line.alt_phone && (
            <p>
              Or call <a href={`tel:${line.alt_phone.replace(/[\s-]/g, "")}`}>{line.alt_phone}</a>
            </p>
          )}
          <p>
            <a href={line.url} target="_blank" rel="noreferrer">
              {line.url}
            </a>
          </p>
        </div>
        <p>
          <strong>
            {line.emergency ? (
              <>
                If you are in immediate danger, call <a href={`tel:${line.emergency}`}>{line.emergency}</a>.
              </>
            ) : (
              crisisLines.emergency_text
            )}
          </strong>
        </p>
        {contact?.phone && (
          <div>
            <p>
              <strong>{contact.name || "Your trusted contact"}</strong>
            </p>
            <div className="row">
              <a className="call secondary" style={{ flex: 1 }} href={`tel:${contact.phone.replace(/\s/g, "")}`}>
                Call
              </a>
              <a className="call secondary" style={{ flex: 1 }} href={`sms:${contact.phone.replace(/\s/g, "")}`}>
                Message
              </a>
            </div>
          </div>
        )}
        <section>
          <h2>My safety plan</h2>
          {!editing && plan && (plan.warningSigns || plan.helps || plan.whoToCall) ? (
            <>
              {plan.warningSigns && <p><strong>My warning signs:</strong> {plan.warningSigns}</p>}
              {plan.helps && <p><strong>What helps me:</strong> {plan.helps}</p>}
              {plan.whoToCall && <p><strong>Who I can call:</strong> {plan.whoToCall}</p>}
              <button className="link" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          ) : editing ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                await putSingleton(db.safety_plan, p);
                setEditing(false);
              }}
            >
              <label className="stack">
                My warning signs
                <textarea rows={2} value={p.warningSigns} onChange={(e) => setPlan({ ...p, warningSigns: e.target.value })} />
              </label>
              <label className="stack">
                What helps me
                <textarea rows={2} value={p.helps} onChange={(e) => setPlan({ ...p, helps: e.target.value })} />
              </label>
              <label className="stack">
                Who I can call
                <textarea rows={2} value={p.whoToCall} onChange={(e) => setPlan({ ...p, whoToCall: e.target.value })} />
              </label>
              <button className="secondary">Save on this device</button>
            </form>
          ) : (
            <button className="link" onClick={() => setEditing(true)}>
              Write your own safety plan
            </button>
          )}
        </section>
        <p className="muted">Hearth is not a crisis service and has not contacted anyone.</p>
        <button className="secondary" disabled={!canLeave} onClick={() => (history.length > 1 ? history.back() : navigate("home"))} aria-label="Back">
          {canLeave ? "Back" : "Back (in a moment)"}
        </button>
      </div>
    </div>
  );
}
