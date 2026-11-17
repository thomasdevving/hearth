// docs/10 metrics 8, 11, 12 from the router and the ledger.
import type { LedgerEntry, VerifiedContext } from "@baseline/engine";
import hSet from "../../../../eval/task_h.json";

export interface HCase {
  text: string;
  context: string;
  start?: string;
  end?: string | null;
}
export const H_TODAY: string = hSet.today;
export const H_CASES: HCase[] = hSet.cases as HCase[];

export function scoreH(c: HCase, v: VerifiedContext | null): { label: boolean; dates: boolean | null } {
  const label = (v?.type ?? "none") === c.context;
  if (!label || c.context === "none" || !v) return { label, dates: null };
  const endOk = c.end === null || c.end === undefined ? !v.endResolved : v.end === c.end;
  return { label, dates: v.start === c.start && endOk };
}

function pct(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
}

export interface TaskStats {
  task: string;
  calls: number;
  onDeviceShare: number | null;
  onDevice: { p50: number | null; p95: number | null };
  cloud: { p50: number | null; p95: number | null };
  fallbacks: number;
}

/** Per task: share of model calls that ran on-device, and latency percentiles (ok calls only). */
export function ledgerStats(entries: LedgerEntry[]): TaskStats[] {
  const tasks = [...new Set(entries.map((e) => e.task))].sort();
  return tasks.map((task) => {
    const es = entries.filter((e) => e.task === task);
    const model = es.filter((e) => e.ranOn !== "none");
    const lat = (on: string) => es.filter((e) => e.ranOn === on && e.outcome === "ok" && e.latencyMs !== null).map((e) => e.latencyMs as number);
    return {
      task,
      calls: es.length,
      onDeviceShare: model.length ? model.filter((e) => e.ranOn === "on_device").length / model.length : null,
      onDevice: { p50: pct(lat("on_device"), 0.5), p95: pct(lat("on_device"), 0.95) },
      cloud: { p50: pct(lat("cloud"), 0.5), p95: pct(lat("cloud"), 0.95) },
      fallbacks: es.filter((e) => e.ranOn === "none").length,
    };
  });
}
