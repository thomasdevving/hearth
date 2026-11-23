import { prettyDate } from "../app/labels";
import { useState } from "react";
import { PrivacyProof } from "../privacy/PrivacyProof";
import type { LedgerEntry } from "@hearth/engine";
import { db } from "../store/db";
import { useData } from "../ui/hooks";
import { Screen } from "../ui/kit";

const TASK_NAME: Record<string, string> = {
  G: "Plan → cards",
  G2: "Scan a paper plan",
  H: "Context from a note",
  I: "Spoken check-in",
  A: "Check-in introduction",
  B: "Diary markers",
  C: "Explain a result",
  K: "Pick your own actions",
  R: "Recall what helped",
  T: "Draft a text",
  Q: "Ask your data",
  P: "Shareable weekly note",
  D: "Weekly reflection",
  E: "Clinician report",
};

/** The data class in plain words (docs/05 §2); the code stays in the small print. */
const CLASS_TEXT: Record<string, string> = {
  S3: "Your own words or places: device only, never the cloud",
  S2: "Single numbers about you: device first; cloud only with your consent",
  S1: "Weekly summary you approved: cloud only with your consent",
};

function where(e: LedgerEntry): string {
  if (e.ranOn === "on_device") return "on this device";
  if (e.ranOn === "cloud") return "cloud (left this device)";
  return "no model (fallback)";
}

/** The latest calls first; the rest one tap away, so the proof does not become a wall of text. */
const SHOWN = 6;

export function Ledger() {
  const [leftOnly, setLeftOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showNet, setShowNet] = useState(false);
  const [all, setAll] = useState(false);
  const d = useData(async () => ({ ledger: (await db.ledger.orderBy("at").reverse().toArray()), net: await db.network_log.orderBy("id").reverse().limit(200).toArray() }));
  if (!d) return <Screen title="Privacy ledger">Loading…</Screen>;
  const rows = d.ledger.filter((e) => !leftOnly || e.ranOn === "cloud" || e.bytesSent > 0);
  const counts = { device: d.ledger.filter((e) => e.ranOn === "on_device").length, cloud: d.ledger.filter((e) => e.ranOn === "cloud").length, none: d.ledger.filter((e) => e.ranOn === "none").length };
  return (
    <Screen title="Privacy ledger">
      <p className="muted">Every model call: which task, where it ran and exactly what was sent.</p>
      <PrivacyProof />
      <p>
        {counts.device} on this device · {counts.cloud} in the cloud · {counts.none} without a model
      </p>
      <label className="toggle">
        <span>Only show what left this device</span>
        <input type="checkbox" checked={leftOnly} onChange={(e) => setLeftOnly(e.target.checked)} />
      </label>
      {rows.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="plain-list" style={{ listStyle: "none", padding: 0 }}>
        {(all ? rows : rows.slice(0, SHOWN)).map((e) => (
          <li key={e.id} className="ledger-entry">
            <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
              <span>
                <strong>{TASK_NAME[e.task] ?? e.task}</strong> · {where(e)}
                <br />
                <span className="ledger-what">{CLASS_TEXT[e.dataClass] ?? e.dataClass}</span>
                <br />
                <small title={`${e.dataClass} · ${e.decision.run === "model" ? e.decision.mode : `fallback: ${e.decision.reason}`} · ${e.outcome}${e.latencyMs !== null ? ` · ${e.latencyMs} ms` : ""} · prompt ${e.promptVersion}`}>
                  {prettyDate(e.at.slice(0, 10))}, {e.at.slice(11, 16)}
                  {e.decision.run !== "model" ? " · simple rules, no model" : ""}
                </small>
              </span>
              {e.ranOn === "cloud" && (
                <button className="link" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                  {open === e.id ? "Hide" : `What was sent (${e.bytesSent} bytes)`}
                </button>
              )}
            </div>
            {open === e.id && <pre>{e.payloadSent ?? "(nothing)"}</pre>}
          </li>
        ))}
      </ul>
      {!all && rows.length > SHOWN && (
        <button className="secondary ledger-more" onClick={() => setAll(true)}>
          Show all {rows.length}
        </button>
      )}
      <h2>Network requests</h2>
      <button className="secondary" onClick={() => setShowNet(!showNet)} aria-expanded={showNet}>
        {showNet ? "Hide" : `Show every request this app made (${d.net.length})`}
      </button>
      {showNet && (
        <ul className="plain-list">
          {d.net.map((n) => (
            <li key={n.id}>
              <small>
                {n.at.slice(11, 19)} {n.method} {n.url} · {n.bytes} B{n.task ? ` · task ${n.task}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
