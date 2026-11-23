import { useEffect, useRef, useState } from "react";
import { formatValue, prettyDate } from "../app/labels";
import { LogoMark } from "../ui/Logo";
import drift from "../assets/hero-drift.json";

/*
 * The hero's drift card: Sam's "Middle of your night" for three weeks against Sam's own usual
 * range, the nights drifting later, and the day Hearth noticed and offered a check-in. The
 * numbers are the engine's (usualRangeSeries, the same function as the Why? screen), stored in
 * hero-drift.json and checked by test/heroDrift.test.ts; the landing page runs no app loop.
 */

type Point = { date: string; value: number | null; low: number | null; median: number | null; high: number | null };
const points = drift.points as Point[];
const fmt = (v: number | null) => formatValue("rest_midpoint", v);

const W = 292;
const H = 140;
const PAD = { l: 4, r: 4, t: 36, b: 6 };
/** Points shown in the first phase: the usual weeks, before the last stretch. */
const USUAL_UNTIL = 15;

const numbers = points.flatMap((p) => [p.value, p.low, p.high]).filter((v): v is number => v !== null);
const yMin = Math.min(...numbers) - 12;
const yMax = Math.max(...numbers) + 12;
const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1);
const y = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
const line = (key: "value" | "median" | "high" | "low") =>
  points.map((p, i) => (p[key] === null ? "" : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`)).join("");
const band = `${line("high")}${[...points].reverse().map((p, j) => `L${x(points.length - 1 - j).toFixed(1)},${y(p.low ?? 0).toFixed(1)}`).join("")}Z`;
const outside = (p: Point) => p.value !== null && p.low !== null && p.high !== null && (p.value > p.high || p.value < p.low);

const last = points[points.length - 1];
const PHASES = [
  { key: "usual", label: "Usual", ms: 3800, title: "Hearth learns your usual activity", desc: "Each dot is the middle of one of Sam's nights. The green band is Sam's own usual range." },
  { key: "drift", label: "Drift", ms: 3800, title: "Then Sam's nights drift later", desc: `On ${prettyDate(last.date)} the middle of Sam's night was ${fmt(last.value)}, while it is usually around ${fmt(last.median)}.` },
  { key: "checkin", label: "Check-in", ms: 5600, title: "Hearth notices and checks in", desc: "Sam's nights stayed outside the usual range for a few days, so Hearth asks how Sam is doing." },
] as const;

const chartLabel = `Chart of Sam's middle of the night for ${points.length} days. On ${prettyDate(last.date)} it was ${fmt(last.value)}, above the usual range of ${fmt(last.low)} to ${fmt(last.high)}. That is the day Hearth noticed.`;

export function HeroDrift() {
  const root = useRef<HTMLElement>(null);
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState(reduce ? 2 : 0);
  const [playing, setPlaying] = useState(!reduce);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = playing && inView;
  const shown = phase === 0 ? USUAL_UNTIL : points.length;

  return (
    <section ref={root} className={`hero-preview drift is-${PHASES[phase].key}`} aria-label="A look inside Hearth: Sam's nights drifting later">
      <div className="preview-header">
        <span className="preview-brand"><LogoMark size={22} /> A little look inside</span>
        <span className="preview-demo">Demo</span>
      </div>

      <div className="drift-steps" role="group" aria-label="Choose a moment">
        {PHASES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={i === phase}
            onClick={() => setPhase(i)}
            className={i < phase ? "is-done" : undefined}
          >
            <span className="drift-step-bar" aria-hidden="true">
              <span
                key={`${phase}-${i}`}
                style={{ animationDuration: `${p.ms}ms`, animationPlayState: running ? "running" : "paused" }}
                className={i === phase && !reduce ? "is-running" : undefined}
                onAnimationEnd={() => setPhase((phase + 1) % PHASES.length)}
              />
            </span>
            {p.label}
          </button>
        ))}
        {!reduce && (
          <button type="button" className="drift-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((v) => !v)}>
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
              {playing ? <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /> : <path d="M3 1.5v9l7-4.5z" fill="currentColor" />}
            </svg>
          </button>
        )}
      </div>

      <div className="drift-copy">
        {PHASES.map((p, i) => (
          <div key={p.key} className="drift-copy-view" aria-hidden={i !== phase}>
            <h2>{p.title}</h2>
            <p className="preview-description">{p.desc}</p>
          </div>
        ))}
      </div>

      <svg className="drift-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chartLabel}>
        <defs>
          <clipPath id="drift-reveal">
            <rect className="drift-reveal" x={0} y={0} width={W} height={H} style={{ transform: `scaleX(${(x(shown - 1) + 6) / W})` }} />
          </clipPath>
        </defs>
        <path className="drift-band" d={band} />
        <path className="drift-median" d={line("median")} />
        <g clipPath="url(#drift-reveal)">
          <path className="drift-line" d={line("value")} />
          {points.map((p, i) =>
            p.value === null ? null : <circle key={p.date} className={`drift-dot${outside(p) && i >= USUAL_UNTIL - 1 ? " is-out" : ""}`} cx={x(i)} cy={y(p.value)} r={outside(p) && i >= USUAL_UNTIL - 1 ? 3.6 : 2.4} />,
          )}
        </g>
        <g className="drift-mark">
          <line x1={x(points.length - 1)} x2={x(points.length - 1)} y1={PAD.t - 8} y2={H - PAD.b} />
          <text x={x(points.length - 1) - 5} y={PAD.t - 10} textAnchor="end">Hearth noticed</text>
        </g>
        <text className="drift-axis" x={PAD.l} y={12}>{prettyDate(points[0].date)}</text>
        <text className="drift-axis drift-axis-end" x={W - PAD.r} y={12} textAnchor="end">{prettyDate(last.date)}</text>
      </svg>
      <p className="drift-example">Example: Sam's sleep</p>

      <div className="drift-foot">
        <p className="drift-legend" aria-hidden={phase === 2}>
          <span className="lg-line" aria-hidden="true" /> Middle of the night
          <span className="lg-band" aria-hidden="true" /> Sam's usual range
        </p>
        <div className="drift-checkin" aria-hidden={phase !== 2}>
          <div className="drift-checkin-head">
            <strong>Check-in ready</strong>
            <span className="drift-chip">on-device</span>
          </div>
          <span>Three quick questions</span>
          <span className="drift-sign">Your sign: <em>“{drift.quote}”</em></span>
        </div>
      </div>

      <a className="preview-open" href="#/home">Explore the full demo<span aria-hidden="true">→</span></a>
    </section>
  );
}
