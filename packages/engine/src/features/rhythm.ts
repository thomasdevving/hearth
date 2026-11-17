import type { Config, DayRaw } from "../types";
import { addDays } from "../time";
import { hourlySteps, stepsPresent } from "./activity";

export interface RhythmFeatures {
  rhythm_stability: number | null;
  fragmentation: number | null;
  relative_amplitude: number | null;
}

/** Lowest or highest mean over `len` consecutive hours of a 24-hour profile, wrapping midnight. */
function extremeWindow(profile: number[], len: number, pick: "max" | "min"): number {
  let best = pick === "max" ? -Infinity : Infinity;
  for (let start = 0; start < 24; start++) {
    let s = 0;
    for (let k = 0; k < len; k++) s += profile[(start + k) % 24];
    const m = s / len;
    if (pick === "max" ? m > best : m < best) best = m;
  }
  return best;
}

/**
 * Rest-activity rhythm (van Someren), docs/03 §3, from hourly steps of the 7 days ending on
 * `date`. Needs at least 5 days with steps present; missing days are left out.
 */
export function rhythmFeatures(byDate: Map<string, DayRaw>, date: string, cfg: Config): RhythmFeatures {
  const none: RhythmFeatures = { rhythm_stability: null, fragmentation: null, relative_amplitude: null };
  const days: (number[] | null)[] = [];
  for (let k = 6; k >= 0; k--) {
    const raw = byDate.get(addDays(date, -k));
    days.push(stepsPresent(raw, cfg) ? hourlySteps((raw as DayRaw).stepBins15 as number[]) : null);
  }
  const included = days.filter((d): d is number[] => d !== null);
  if (included.length < 5) return none;

  const n = included.length * 24;
  let sum = 0;
  for (const d of included) for (const v of d) sum += v;
  const xbar = sum / n;

  let ssTotal = 0;
  for (const d of included) for (const v of d) ssTotal += (v - xbar) * (v - xbar);

  const profile: number[] = new Array(24).fill(0);
  for (const d of included) for (let h = 0; h < 24; h++) profile[h] += d[h];
  for (let h = 0; h < 24; h++) profile[h] /= included.length;

  let ssHour = 0;
  for (let h = 0; h < 24; h++) ssHour += (profile[h] - xbar) * (profile[h] - xbar);

  // Successive differences, only between consecutive hours of the same block of included days.
  let ssDiff = 0;
  let nDiff = 0;
  let prev: number | null = null;
  for (const d of days) {
    if (d === null) {
      prev = null;
      continue;
    }
    for (let h = 0; h < 24; h++) {
      if (prev !== null) {
        ssDiff += (d[h] - prev) * (d[h] - prev);
        nDiff++;
      }
      prev = d[h];
    }
  }

  const rhythm_stability = ssTotal > 0 ? (n * ssHour) / (24 * ssTotal) : null;
  const fragmentation = ssTotal > 0 && nDiff > 0 ? (n * ssDiff) / (nDiff * ssTotal) : null;
  const m10 = extremeWindow(profile, 10, "max");
  const l5 = extremeWindow(profile, 5, "min");
  const relative_amplitude = m10 + l5 > 0 ? (m10 - l5) / (m10 + l5) : null;
  return { rhythm_stability, fragmentation, relative_amplitude };
}
