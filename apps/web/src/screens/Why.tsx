import { useMemo } from "react";
import type uPlot from "uplot";
import { addDays, usualRangeSeries, whyTimeline, type EngineState, type FeatureId } from "@hearth/engine";
import { db } from "../store/db";
import { useData } from "../ui/hooks";
import { Screen } from "../ui/kit";
import { UChart } from "../ui/UChart";
import { cfg, getEngineState } from "../app/runtime";
import { navigate } from "../app/events";
import { featureLabel, formatValue, prettyDate, ruleFeature } from "../app/labels";
import { axes, indexChart, sec } from "./Trends";

/** How many days the "Why?" charts show. */
const WINDOW_DAYS = 42;
const INK2 = "#52514e";

function fmt(feature: FeatureId, v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  if (feature.startsWith("place_visits")) return `${Math.round(v * 10) / 10} in 7 days`;
  return formatValue(feature, v);
}

/** Vertical lines with a short label: the day the trend crossed, and a single day that did not count. */
function markPlugin(marks: { date: string; label: string; color: string }[]): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u) => {
          const ctx = u.ctx;
          const { top, height, left, width } = u.bbox;
          let lastX = -Infinity;
          let row = 0;
          for (const m of marks) {
            const x = u.valToPos(sec(m.date), "x", true);
            if (x < left || x > left + width) continue;
            // Labels sit at the bottom (context labels use the top); close ones stack upwards.
            row = x - lastX < 90 * devicePixelRatio ? row + 1 : 0;
            lastX = x;
            ctx.save();
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 1.5 * devicePixelRatio;
            ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio]);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            ctx.fillStyle = m.color;
            ctx.font = `600 ${11 * devicePixelRatio}px system-ui, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            const w = ctx.measureText(m.label).width;
            const y = top + height - (6 + row * 14) * devicePixelRatio;
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            const tx = x + 4 + w > left + width ? x - w - 4 : x + 4;
            ctx.fillRect(tx - 2, y - 11 * devicePixelRatio, w + 4, 14 * devicePixelRatio);
            ctx.fillStyle = m.color;
            ctx.fillText(m.label, tx, y);
            ctx.restore();
          }
        },
      ],
    },
  };
}

/**
 * "Why?": one signal against the user's own usual range, then why one day did not count and the
 * trend did. Every number comes from the engine's stored days (explain.ts); no model (R2), plain
 * words without diagnosis (R9).
 */
export function Why({ params }: { params: Record<string, string> }) {
  const feature = params.feature as FeatureId | undefined;
  const d = useData(async () => {
    const [records, contexts, qs, rules, state] = await Promise.all([
      db.day_records.orderBy("date").toArray(),
      db.contexts.toArray(),
      db.questionnaires.orderBy("takenAt").toArray(),
      db.plan_rules.toArray(),
      getEngineState() as Promise<EngineState | null>,
    ]);
    return { records, contexts, qs, rules, places: state?.places ?? [] };
  }, [feature]);

  const view = useMemo(() => {
    if (!d || !feature || d.records.length === 0) return null;
    const lastDate = d.records[d.records.length - 1].date;
    const from = addDays(lastDate, -(WINDOW_DAYS - 1));
    const series = usualRangeSeries(d.records, feature, from, d.contexts, d.qs, cfg);
    const why = whyTimeline(d.records, cfg);
    const windowRecords = d.records.filter((r) => r.date >= from);
    const marks = [
      ...(why.singleDay && why.singleDay.date >= from ? [{ date: why.singleDay.date, label: "one day", color: INK2 }] : []),
      ...(why.episode && why.episode.start >= from ? [{ date: why.episode.start, label: "Hearth noticed", color: "#b25d00" }] : []),
    ];

    const signalData: uPlot.AlignedData = [series.map((p) => sec(p.date)), series.map((p) => p.low), series.map((p) => p.high), series.map((p) => p.median), series.map((p) => p.value)];
    const signalOpts: Omit<uPlot.Options, "width"> = {
      height: 200,
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: (() => {
        const a = axes("");
        a[1] = { ...a[1], label: undefined, size: 64, values: (_u, vals) => vals.map((v) => fmt(feature, v)) };
        return a;
      })(),
      series: [
        { label: "Date" },
        { label: "", stroke: "transparent", show: true },
        { label: "Your usual range", stroke: "transparent", fill: undefined },
        { label: "Your usual middle", stroke: "#2f7d4f", width: 1.5, dash: [6, 4] },
        { label: featureLabel(feature, d.places), stroke: "#ca026a", width: 2, points: { show: true, size: 5, fill: "#ca026a" } },
      ],
      bands: [{ series: [2, 1], fill: "rgba(47,125,79,0.14)" }],
      plugins: [markPlugin(marks)],
    };

    const index = indexChart(windowRecords, d.contexts, d.qs);
    index.opts = { ...index.opts, plugins: [...(index.opts.plugins ?? []), markPlugin(marks)] };

    const lastPoint = [...series].reverse().find((p) => p.value !== null && p.median !== null) ?? null;
    const rule = d.rules.find((r) => r.active && ruleFeature(r) === feature) ?? null;
    return { series, why, signalData, signalOpts, index, lastPoint, rule };
  }, [d, feature]);

  if (!feature) {
    return (
      <Screen title="Why?">
        <p>Pick a signal under “Why?” on Today.</p>
      </Screen>
    );
  }
  if (!d || !view) return <Screen title="Why?">Loading…</Screen>;
  const { why, lastPoint, rule } = view;
  const label = featureLabel(feature, d.places);
  const outside = lastPoint?.z !== null && lastPoint?.z !== undefined && Math.abs(lastPoint.z) > 1;

  return (
    <Screen title="Why?">
      <button className="link" onClick={() => navigate("home")}>
        ‹ Today
      </button>
      <section className="why-step" aria-labelledby="why-1">
        <h2 id="why-1">
          <span className="why-num">1</span> {label} against your usual days
        </h2>
        {rule && <p className="quote">Your sign: “{rule.quote}”</p>}
        {lastPoint ? (
          <p>
            Usually {fmt(feature, lastPoint.median)}, between {fmt(feature, lastPoint.low)} and {fmt(feature, lastPoint.high)}. On {prettyDate(lastPoint.date)}: <strong>{fmt(feature, lastPoint.value)}</strong>,{" "}
            {outside ? "outside your usual range." : "within your usual range."}
          </p>
        ) : (
          <p className="muted">Not enough of your own days yet to show a usual range for this signal.</p>
        )}
        <UChart opts={view.signalOpts} data={view.signalData} ariaLabel={`${label} over the last ${WINDOW_DAYS} days, with your usual range shaded`} />
        <p className="why-legend">
          <span className="lg lg-value" /> {label} <span className="lg lg-band" /> your usual range <span className="lg lg-mid" /> your usual middle
        </p>
        <p className="muted small">The shaded band is the range of your own usual days, the ones Hearth compares with. It does not count days that already looked different.</p>
      </section>

      <section className="why-step" aria-labelledby="why-2">
        <h2 id="why-2">
          <span className="why-num">2</span> One day does not count
        </h2>
        <p>
          {why.singleDay
            ? `On ${prettyDate(why.singleDay.date)} one day stood out, but the trend stayed under the line. Hearth did nothing.`
            : "Hearth does not react to one day. It waits until the trend, the smoothed line, stays above your usual limit."}
        </p>
      </section>

      <section className="why-step" aria-labelledby="why-3">
        <h2 id="why-3">
          <span className="why-num">3</span> Why Hearth asked
        </h2>
        <p>
          {why.episode
            ? `On ${prettyDate(why.episode.start)} the trend crossed the line${why.risingDays >= 3 ? `, after rising for ${why.risingDays} days` : ""}. That is when Hearth asked you a check-in.`
            : "Your days are within your usual pattern now."}
        </p>
        <UChart opts={view.index.opts} data={view.index.data} ariaLabel="All your signals together: each day, the trend and your usual limit" />
        <p className="muted small">Grey dots: each day, all signals together. Pink line: the trend. Dashed line: your usual limit.</p>
      </section>
      <p className="muted small">Worked out by Hearth's code from your own days; no model is involved. It describes a change from your usual pattern, not a diagnosis.</p>
    </Screen>
  );
}
