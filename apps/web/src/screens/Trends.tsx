import { useMemo, useState } from "react";
import type uPlot from "uplot";
import type { ContextLabel, DayRecord, DiaryMarkers, Domain, QuestionnaireRecord } from "@hearth/engine";
import { db } from "../store/db";
import { useData } from "../ui/hooks";
import { Screen } from "../ui/kit";
import { UChart } from "../ui/UChart";
import { CONTEXT_LABEL, featureLabel, formatValue, prettyDate, ruleFeature } from "../app/labels";
import { getEngineState } from "../app/runtime";
import { Ask } from "./Ask";

// Validated categorical palette (dataviz skill, light surface), fixed order per domain.
export const DOMAIN_COLOR: Record<Domain, string> = { activity: "#2a78d6", rhythm: "#eb6834", sleep: "#1baf7a", mobility: "#eda100", phone: "#e87ba4", body: "#6250d6" };
const DOMAIN_LABEL: Record<Domain, string> = { activity: "Activity", rhythm: "Rhythm", sleep: "Sleep", body: "Heart", mobility: "Places", phone: "Phone" };
const INK = "#0b0b0b";
const INK2 = "#52514e";
const GRID = "#e6e5e1";

const sec = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 1000;

function axes(yLabel: string): uPlot.Axis[] {
  return [
    { stroke: INK2, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, values: (_u, vals) => vals.map((v) => new Date(v * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })) },
    { stroke: INK2, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID }, label: yLabel, size: 44 },
  ];
}

/** Context periods shaded behind the series; stressors as an outline only (they mask nothing). */
function contextPlugin(contexts: ContextLabel[], qs: QuestionnaireRecord[]): uPlot.Plugin {
  return {
    hooks: {
      drawAxes: [
        (u) => {
          const ctx = u.ctx;
          const { top, height } = u.bbox;
          for (const c of contexts) {
            if (!c.confirmed) continue;
            const x0 = u.valToPos(sec(c.start) - 43200, "x", true);
            const x1 = u.valToPos(sec(c.end) + 43200, "x", true);
            ctx.save();
            if (c.kind === "explains_sensors") {
              ctx.fillStyle = "rgba(82,81,78,0.12)";
              ctx.fillRect(x0, top, x1 - x0, height);
            } else {
              ctx.strokeStyle = "rgba(82,81,78,0.5)";
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(x0, top + 1, x1 - x0, height - 2);
            }
            ctx.fillStyle = INK2;
            ctx.font = `${11 * devicePixelRatio}px system-ui, sans-serif`;
            ctx.fillText(CONTEXT_LABEL[c.type] ?? c.type, x0 + 4, top + height - 8 * devicePixelRatio);
            ctx.restore();
          }
        },
      ],
      draw: [
        (u) => {
          const ctx = u.ctx;
          const { top, height } = u.bbox;
          let lastLabel = -Infinity;
          for (const q of qs) {
            if (q.instrument !== "PHQ9") continue;
            if (sec(q.takenAt.slice(0, 10)) < (u.scales.x.min ?? 0)) continue;
            const x = u.valToPos(sec(q.takenAt.slice(0, 10)), "x", true);
            ctx.save();
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            ctx.fillStyle = INK;
            ctx.font = `${10 * devicePixelRatio}px system-ui, sans-serif`;
            if (x - lastLabel > 48 * devicePixelRatio) {
              const label = `PHQ-9 ${q.result.total}`;
              const w = ctx.measureText(label).width;
              const right = u.bbox.left + u.bbox.width;
              ctx.fillText(label, x + 4 + w > right ? x - w - 4 : x + 4, top + 14 * devicePixelRatio);
              lastLabel = x;
            }
            ctx.restore();
          }
        },
      ],
    },
  };
}

function indexChart(all: DayRecord[], contexts: ContextLabel[], qs: QuestionnaireRecord[]) {
  // Before the usual range exists the index is scored against a reference still being built;
  // the chart starts at the first day with a limit.
  const first = all.findIndex((r) => r.UCL !== null);
  const records = first > 0 ? all.slice(first) : all;
  const xs = records.map((r) => sec(r.date));
  const data: uPlot.AlignedData = [
    xs,
    records.map((r) => r.D),
    records.map((r) => (r.UCL === null ? null : r.S)),
    records.map((r) => r.UCL),
  ];
  const opts: Omit<uPlot.Options, "width"> = {
    height: 220,
    cursor: { drag: { x: false, y: false } },
    legend: { show: true, live: false },
    scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(1, (max ?? 1) * 1.1)] } },
    axes: axes("index"),
    series: [
      { label: "Date", value: (_u, v) => (v == null ? "–" : new Date(v * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })) },
      { label: "Daily index", stroke: "#8b8a85", width: 1, points: { show: true, size: 4, fill: "#8b8a85" }, value: (_u, v) => (v == null ? "–" : v.toFixed(2)) },
      { label: "Smoothed", stroke: "#ca026a", width: 2.5, value: (_u, v) => (v == null ? "–" : v.toFixed(2)) },
      { label: "Your usual range (limit)", stroke: INK, width: 1.5, dash: [6, 4], value: (_u, v) => (v == null ? "–" : v.toFixed(2)) },
    ],
    plugins: [contextPlugin(contexts, qs)],
  };
  return { opts, data };
}

function domainChart(all: DayRecord[], contexts: ContextLabel[]) {
  const first = all.findIndex((r) => r.UCL !== null);
  const records = first > 0 ? all.slice(first) : all;
  const domains: Domain[] = ["activity", "rhythm", "sleep", "body", "mobility", "phone"];
  const used = domains.filter((d) => records.some((r) => r.domainScores[d] !== undefined));
  const data: uPlot.AlignedData = [records.map((r) => sec(r.date)), ...used.map((d) => records.map((r) => r.domainScores[d] ?? null))];
  const opts: Omit<uPlot.Options, "width"> = {
    height: 180,
    legend: { show: true, live: false },
    scales: { x: { time: true }, y: { range: [0, 3] } },
    axes: axes("change"),
    series: [{ label: "Date" }, ...used.map((d) => ({ label: DOMAIN_LABEL[d], stroke: DOMAIN_COLOR[d], width: 2, value: (_u: uPlot, v: number | null) => (v == null ? "–" : v.toFixed(2)) }))],
    plugins: [contextPlugin(contexts, [])],
  };
  return { opts, data };
}

function markerChart(diary: { date: string; markers: DiaryMarkers | null }[]) {
  const keys = ["negative_affect", "anhedonic_language", "social_withdrawal", "hopelessness"] as const;
  const names = ["Negative feeling", "Less enjoyment", "Pulling back", "Hopelessness"];
  const colors = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
  const data: uPlot.AlignedData = [diary.map((x) => sec(x.date)), ...keys.map((k) => diary.map((x) => x.markers?.[k] ?? null))];
  const opts: Omit<uPlot.Options, "width"> = {
    height: 160,
    legend: { show: true, live: false },
    scales: { x: { time: true }, y: { range: [0, 3] } },
    axes: axes("0–3"),
    series: [{ label: "Date" }, ...keys.map((_, i) => ({ label: names[i], stroke: colors[i], width: 2, points: { show: true, size: 6 } }))],
  };
  return { opts, data };
}

export function Trends() {
  const d = useData(async () => {
    const [records, contexts, qs, rules, state, diary] = await Promise.all([db.day_records.orderBy("date").toArray(), db.contexts.toArray(), db.questionnaires.orderBy("takenAt").toArray(), db.plan_rules.toArray(), getEngineState(), db.diary.orderBy("date").toArray()]);
    return { records, contexts, qs, rules, state, diary: diary.filter((x) => x.markers) };
  });
  const [table, setTable] = useState(false);
  const charts = useMemo(() => (d ? { index: indexChart(d.records, d.contexts, d.qs), domains: domainChart(d.records, d.contexts), markers: markerChart(d.diary) } : null), [d]);
  if (!d || !charts) return <Screen title="Trends">Loading…</Screen>;
  const { records, qs, rules, state } = d;
  if (records.length === 0) return <Screen title="Trends"><p className="muted">No days yet. Use “+1 day” below to let time pass.</p></Screen>;
  const phq9 = qs.filter((q) => q.instrument === "PHQ9");
  return (
    <Screen title="Trends">
      <p className="muted">
        How far your days are from your own usual pattern. Above the dashed line for a few days counts as a change. Shaded: set aside; dotted: a stressful week, still counted.
      </p>
      <h2>Change index</h2>
      <UChart opts={charts.index.opts} data={charts.index.data} ariaLabel="Daily change index with the smoothed line and your usual limit" />
      <h2>By domain</h2>
      <UChart opts={charts.domains.opts} data={charts.domains.data} ariaLabel="Change per domain" />
      <h2>Questionnaires</h2>
      {qs.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="plain-list">
          {qs.map((q) => (
            <li key={q.id}>
              {prettyDate(q.takenAt.slice(0, 10))}: {q.instrument === "PHQ2" ? "PHQ-2" : "PHQ-9"} {q.result.total}
              {q.result.flagged ? " (a clear change)" : ""}
            </li>
          ))}
        </ul>
      )}
      {phq9.length > 0 && <p className="muted">Your own usual PHQ-9 score is the reference for a change, not a general cut-off alone.</p>}
      <h2>Your signals</h2>
      <ul className="signals">
        {rules.map((r) => {
          const f = ruleFeature(r);
          const vals = records.slice(-56).map((x) => x.features.values[f] ?? null);
          return (
            <li key={r.id}>
              <div>
                <strong>{featureLabel(f, state?.places)}</strong>
                <small>last 8 weeks</small>
              </div>
              <span className="value">{formatValue(f, vals[vals.length - 1])}</span>
            </li>
          );
        })}
      </ul>
      {d.diary.length > 0 && (
        <>
          <h2>From your notes</h2>
          <p className="muted">Read on this device (0 = not there, 3 = strong). Only for you; never used to decide anything.</p>
          <UChart opts={charts.markers.opts} data={charts.markers.data} ariaLabel="Language markers from your notes over time" />
        </>
      )}
      <Ask />
      <button className="secondary" onClick={() => setTable(!table)} aria-expanded={table}>
        {table ? "Hide table" : "Show as table"}
      </button>
      {table && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Index</th>
                <th>Smoothed</th>
                <th>Limit</th>
                <th>State</th>
                <th>Set aside</th>
              </tr>
            </thead>
            <tbody>
              {[...records].reverse().map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{r.D?.toFixed(2) ?? "–"}</td>
                  <td>{r.UCL === null ? "–" : r.S.toFixed(2)}</td>
                  <td>{r.UCL?.toFixed(2) ?? "–"}</td>
                  <td>{r.state}</td>
                  <td>{r.maskedDomains.join(", ") || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Screen>
  );
}
