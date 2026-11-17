import { useState } from "react";
import type { VerifiedPlan } from "@baseline/engine";
import { Screen } from "../ui/kit";
import { router } from "../inference";
import { cfg } from "../app/runtime";
import { db } from "../store/db";
import { G_CASES, scoreCase, summarise, type GCaseResult } from "../eval/taskG";
import { promptFor } from "../inference/prompts";
import { H_CASES, H_TODAY, ledgerStats, scoreH } from "../eval/stats";
import { useData } from "../ui/hooks";
import type { VerifiedContext } from "@baseline/engine";

/** Hidden screen (#/eval_g): runs the task G evaluation set through the real model. */
export function EvalG() {
  const [results, setResults] = useState<GCaseResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setResults([]);
    const out: GCaseResult[] = [];
    for (const c of G_CASES) {
      let raw: unknown = null;
      const t0 = performance.now();
      const res = await router().run<VerifiedPlan>("G", { text: c.text }, { sourceText: c.text, verify: { sourceText: c.text, cfg }, onRaw: (r) => (raw = r) });
      const ms = Math.round(performance.now() - t0);
      const entry = res.ledgerId ? await db.ledger.get(res.ledgerId) : undefined;
      out.push(scoreCase(c, res.ok ? res.value : null, raw, res.ok ? "ok" : res.reason === "invalid_output" ? "invalid_output" : res.reason === "error" ? "error" : "fallback", res.ok ? res.ranOn : (entry?.ranOn ?? "none"), res.ok ? ms : null));
      setResults([...out]);
    }
    setBusy(false);
  };
  const [h, setH] = useState<{ text: string; got: string; label: boolean; dates: boolean | null }[]>([]);
  const [hBusy, setHBusy] = useState(false);
  const ledger = useData(async () => ledgerStats(await db.ledger.toArray()));
  const runH = async () => {
    setHBusy(true);
    const out: typeof h = [];
    for (const c of H_CASES) {
      const res = await router().run<VerifiedContext | null>("H", { text: c.text }, { sourceText: c.text, verify: { sourceText: c.text, today: H_TODAY, cfg } });
      const v = res.ok ? res.value : null;
      out.push({ text: c.text, got: res.ok ? (v ? `${v.type} ${v.start}..${v.endResolved ? v.end : "?"}` : "none") : `fallback (${res.reason})`, ...scoreH(c, v) });
      setH([...out]);
    }
    setHBusy(false);
  };
  const s = summarise(results);
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)} %`);
  return (
    <Screen title="Model evaluation" back="settings">
      <h2>Task G · plans to cards</h2>
      <p className="muted">
        Runs {G_CASES.length} written plans (eval/task_g.json) through task G with prompt {promptFor("G").id}@{promptFor("G").version}, then scores the cards that pass the guardrails. Everything stays on this device; each run is in the ledger.
      </p>
      <button className="primary" disabled={busy} onClick={run}>
        {busy ? `Running ${results.length + 1} of ${G_CASES.length}…` : "Run the evaluation"}
      </button>
      {results.length > 0 && (
        <>
          <h2>Summary</h2>
          <ul className="plain-list">
            <li>Model runs: {s.modelRuns} of {s.cases} (others fell back or failed)</li>
            <li>Rule precision: {pct(s.precision)} (target ≥ 80 %)</li>
            <li>Rule recall: {pct(s.recall)}</li>
            <li>Model rules rejected by the quote check: {pct(s.quoteRejectedShare)}</li>
            <li>Check-in questions: {s.itemsFound}; actions: {s.actionsFound}</li>
          </ul>
          <button
            className="secondary"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ prompt: promptFor("G"), summary: s, results }, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "task_g_results.json";
              a.click();
            }}
          >
            Download results
          </button>
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Status</th>
                  <th>Correct</th>
                  <th>Wrong</th>
                  <th>Missed</th>
                  <th>Quote fails</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                    <td>{r.id}</td>
                    <td>{r.status === "ok" ? r.ranOn : r.status}</td>
                    <td>{r.tp}</td>
                    <td>{r.predicted.length - r.tp}</td>
                    <td>{r.expected.length - r.tp}</td>
                    <td>{r.quoteRejected}</td>
                    <td>{r.latencyMs ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {open && (
            <pre className="json">{JSON.stringify(results.find((r) => r.id === open), null, 2)}</pre>
          )}
        </>
      )}
      <h2>Task H · context from a check-in</h2>
      <p className="muted">{H_CASES.length} sentences (eval/task_h.json), {H_CASES.filter((c) => c.context === "none").length} of them with no context; today is {H_TODAY}.</p>
      <button className="secondary" disabled={hBusy} onClick={runH}>
        {hBusy ? `Running ${h.length + 1} of ${H_CASES.length}…` : "Run task H"}
      </button>
      {h.length > 0 && (
        <>
          <p>
            Label accuracy: {h.filter((x) => x.label).length} of {h.length}. Dates right when the label is right: {h.filter((x) => x.dates === true).length} of {h.filter((x) => x.dates !== null).length}.
          </p>
          <ul className="plain-list">
            {h.filter((x) => !x.label || x.dates === false).map((x) => (
              <li key={x.text}>
                <small>
                  “{x.text}” → {x.got}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>Ledger · where tasks ran and how fast</h2>
      <p className="muted">From every model call in this browser so far (run a replay with the cloud allowed for metric 11).</p>
      {ledger && ledger.length > 0 ? (
        <div className="table-wrap" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Calls</th>
                <th>On-device share</th>
                <th>On-device p50 / p95 ms</th>
                <th>Cloud p50 / p95 ms</th>
                <th>Fallbacks</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((t) => (
                <tr key={t.task}>
                  <td>{t.task}</td>
                  <td>{t.calls}</td>
                  <td>{pct(t.onDeviceShare)}</td>
                  <td>
                    {t.onDevice.p50 ?? "–"} / {t.onDevice.p95 ?? "–"}
                  </td>
                  <td>
                    {t.cloud.p50 ?? "–"} / {t.cloud.p95 ?? "–"}
                  </td>
                  <td>{t.fallbacks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No model calls yet.</p>
      )}
    </Screen>
  );
}
