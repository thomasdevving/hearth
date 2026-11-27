import { useEffect, useState } from "react";
import type { WeekAggregate } from "@hearth/engine";
import { loadShare } from "../cloud/client";
import { Screen } from "../ui/kit";
import { CONTEXT_LABEL, featureLabel, weekLabel } from "../app/labels";

type Rep = { summary: string; timeline: { iso_week: string; note: string }[]; questions_to_bring: string[] };

/** The clinician view (web only): read-only weekly aggregates and the report. */
export function Report({ params }: { params: Record<string, string> }) {
  const [data, setData] = useState<{ weeks: WeekAggregate[]; report: Rep | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const id = params.id ?? "";
    // Share ids are 32 hex characters (createShare); anything else is a broken link.
    if (!/^[0-9a-f]{32}$/.test(id)) {
      setErr("This link is incomplete. Ask for the link again.");
      return;
    }
    loadShare(id)
      .then((d) => (d ? setData({ weeks: d.weeks as WeekAggregate[], report: (d.report as Rep) ?? null }) : setErr("This link has expired or does not exist.")))
      .catch((e) => {
        console.warn("share", e);
        // An expired share is refused by the rules rather than missing.
        setErr((e as { code?: string }).code === "permission-denied" ? "This link has expired or does not exist." : "This summary could not be loaded right now. Check your connection and try again.");
      });
  }, [params.id]);
  if (err) return <Screen title="Shared summary"><p>{err}</p></Screen>;
  if (!data) return <Screen title="Shared summary">Loading…</Screen>;
  return (
    <Screen title="Shared summary">
      <p className="muted">Shared by the person themselves: weekly summaries of daily patterns and questionnaire scores. They describe changes from that person’s usual pattern, not a condition.</p>
      {data.report && (
        <>
          <h2>Overview (written by the cloud model from the numbers below)</h2>
          <p>{data.report.summary}</p>
          {data.report.timeline.length > 0 && (
            <ul className="plain-list">
              {data.report.timeline.map((t) => (
                <li key={t.iso_week}>
                  <strong>{t.iso_week.charAt(0).toUpperCase() + t.iso_week.slice(1)}</strong>: {t.note}
                </li>
              ))}
            </ul>
          )}
          {data.report.questions_to_bring.length > 0 && (
            <>
              <h2>Questions to bring</h2>
              <ul className="plain-list">
                {data.report.questions_to_bring.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <h2>Weekly data</h2>
      <div className="table-wrap" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Week of</th>
              <th>Days</th>
              <th>Index</th>
              <th>Changed days</th>
              <th>Top signals</th>
              <th>Down (1–7)</th>
              <th>PHQ-2</th>
              <th>PHQ-9</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.isoWeek}>
                <td>{weekLabel(w.isoWeek).replace("the week of ", "")}</td>
                <td>{w.daysWithData}</td>
                <td>{w.indexMean ?? "–"}</td>
                <td>{w.daysElevated}</td>
                <td>{w.topContributors.map((f) => featureLabel(f)).join(", ") || "–"}</td>
                <td>{w.ema.mood_low ?? "–"}</td>
                <td>{w.phq2 ?? "–"}</td>
                <td>{w.phq9 ?? "–"}{w.phq9Flagged ? " ⚑" : ""}</td>
                <td>{w.contexts.map((c) => CONTEXT_LABEL[c] ?? c).join(", ") || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Screen>
  );
}
