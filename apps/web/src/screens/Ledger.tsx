import { useState } from "react";
import type { LedgerEntry } from "@baseline/engine";
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
  Q: "Ask your data",
  P: "Shareable weekly note",
  D: "Weekly reflection",
  E: "Clinician report",
};

function where(e: LedgerEntry): string {
  if (e.ranOn === "on_device") return "on this device";
  if (e.ranOn === "cloud") return "cloud (left this device)";
  return "no model (fallback)";
}

export function Ledger() {
  const [leftOnly, setLeftOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showNet, setShowNet] = useState(false);
  const d = useData(async () => ({ ledger: (await db.ledger.orderBy("at").reverse().toArray()), net: await db.network_log.orderBy("id").reverse().limit(200).toArray() }));
  if (!d) return <Screen title="Privacy ledger">Loading…</Screen>;
  const rows = d.ledger.filter((e) => !leftOnly || e.ranOn === "cloud" || e.bytesSent > 0);
  const counts = { device: d.ledger.filter((e) => e.ranOn === "on_device").length, cloud: d.ledger.filter((e) => e.ranOn === "cloud").length, none: d.ledger.filter((e) => e.ranOn === "none").length };
  return (
    <Screen title="Privacy ledger">
      <p className="muted">Every time a model was asked something: which task, where it ran and exactly what was sent. Your own words only ever go to the model on this device.</p>
      <p>
        {counts.device} on this device · {counts.cloud} in the cloud · {counts.none} without a model
      </p>
      <label className="toggle">
        <span>Only show what left this device</span>
        <input type="checkbox" checked={leftOnly} onChange={(e) => setLeftOnly(e.target.checked)} />
      </label>
      {rows.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="plain-list" style={{ listStyle: "none", padding: 0 }}>
        {rows.map((e) => (
          <li key={e.id} className="ledger-entry">
            <div className="row" style={{ justifyContent: "space-between", margin: 0 }}>
              <span>
                <strong>{TASK_NAME[e.task] ?? e.task}</strong> · {where(e)}
                <br />
                <small>
                  {e.at.slice(0, 16).replace("T", " ")} · {e.dataClass} · {e.decision.run === "model" ? `${e.decision.mode.toLowerCase().replace(/_/g, " ")}${e.decision.variant === "lite" ? " (lite)" : ""}` : `fallback: ${e.decision.reason.replace("_", " ")}`} · {e.outcome}
                  {e.latencyMs !== null ? ` · ${e.latencyMs} ms` : ""} · {e.promptVersion}
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
