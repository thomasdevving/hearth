import type { ReactNode } from "react";
import { navigate } from "../app/events";

export function Screen({ title, back, children, badge }: { title: string; back?: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="screen" aria-labelledby="screen-title">
      <header className="screen-head">
        {back && (
          <button className="link back" onClick={() => navigate(back)} aria-label="Back">
            ‹ Back
          </button>
        )}
        <h1 id="screen-title">{title}</h1>
        {badge}
      </header>
      {children}
    </section>
  );
}

export function Card({ children, tone, onClick, label }: { children: ReactNode; tone?: "accent" | "warm" | "plain"; onClick?: () => void; label?: string }) {
  const cls = `card ${tone ?? "plain"}${onClick ? " clickable" : ""}`;
  if (onClick)
    return (
      <button className={cls} onClick={onClick} aria-label={label}>
        {children}
      </button>
    );
  return <div className={cls}>{children}</div>;
}

/** Every screen with model-written text shows where it was written (docs/01 §7). */
export function ModelBadge({ ranOn }: { ranOn: "on_device" | "cloud" | "template" | "none" }) {
  const text = ranOn === "on_device" ? "on-device" : ranOn === "cloud" ? "cloud" : "fixed text";
  return (
    <span className={`badge badge-${ranOn === "none" ? "template" : ranOn}`} title={ranOn === "cloud" ? "Written by the cloud model" : ranOn === "on_device" ? "Written by the model on this device" : "Fixed text, no model"}>
      {text}
    </span>
  );
}

export function Sparkline({ values, mid, width = 120, height = 32, label }: { values: (number | null)[]; mid?: number | null; width?: number; height?: number; label: string }) {
  const xs = values.map((v, i) => [i, v] as const).filter(([, v]) => v !== null) as [number, number][];
  if (xs.length < 2) return <svg width={width} height={height} role="img" aria-label={`${label}: not enough data yet`} />;
  const all = xs.map(([, v]) => v).concat(mid != null ? [mid] : []);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (width - 4);
  const y = (v: number) => height - 3 - ((v - lo) / span) * (height - 6);
  const d = xs.map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = xs[xs.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`${label}, last ${values.length} days`}>
      {mid != null && <line x1={0} x2={width} y1={y(mid)} y2={y(mid)} className="spark-mid" />}
      <path d={d} className="spark-line" />
      <circle cx={x(last[0])} cy={y(last[1])} r={3} className="spark-dot" />
    </svg>
  );
}
