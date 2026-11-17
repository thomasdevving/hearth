import type { Config, DayRaw } from "../types";
import { sd } from "../stats";
import { addDays, dayIndex, localMinutes } from "../time";
import { stepsPresent } from "./activity";

export interface RestPeriod {
  start: number; // minutes after local midnight of `date` (negative = previous evening)
  end: number;
  source: "healthkit" | "steps";
}

const WINDOW_START = -180; // 21:00 on the previous day
const WINDOW_END = 720; // 12:00 on the date

/** Main rest period of the night ending on `date` (docs/03 §4), or null. */
export function restPeriod(byDate: Map<string, DayRaw>, date: string, cfg: Config): RestPeriod | null {
  const raw = byDate.get(date);
  if (!raw) return null;
  const midnight = dayIndex(date) * 1440;

  if (raw.sleep && raw.sleep.length > 0) {
    const ivs = raw.sleep
      .map((iv) => ({ s: localMinutes(iv.start) - midnight, e: localMinutes(iv.end) - midnight }))
      .filter((iv) => iv.e > iv.s)
      .sort((a, b) => a.s - b.s);
    const merged: { s: number; e: number }[] = [];
    for (const iv of ivs) {
      const last = merged[merged.length - 1];
      if (last && iv.s - last.e < 60) last.e = Math.max(last.e, iv.e);
      else merged.push({ ...iv });
    }
    let best: { s: number; e: number } | null = null;
    for (const iv of merged) {
      const s = Math.max(iv.s, WINDOW_START);
      const e = Math.min(iv.e, WINDOW_END);
      if (e > s && (!best || e - s > best.e - best.s)) best = { s, e };
    }
    return best ? { start: best.s, end: best.e, source: "healthkit" } : null;
  }

  // Step-based: longest run of empty 15-minute bins in the night window.
  const prev = byDate.get(addDays(date, -1));
  if (!stepsPresent(raw, cfg) || !stepsPresent(prev, cfg)) return null;
  const prevBins = (prev as DayRaw).stepBins15 as number[];
  const bins = raw.stepBins15 as number[];
  const night: number[] = [...prevBins.slice(84, 96), ...bins.slice(0, 48)]; // 21:00 → 12:00
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i <= night.length; i++) {
    const empty = i < night.length && night[i] === 0;
    if (empty && runStart < 0) runStart = i;
    if (!empty && runStart >= 0) {
      if (i - runStart > bestLen) {
        bestLen = i - runStart;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  const hours = bestLen / 4;
  if (bestStart < 0 || hours < 3 || hours > 14) return null;
  const start = WINDOW_START + bestStart * 15;
  return { start, end: start + bestLen * 15, source: "steps" };
}

export interface SleepFeatures {
  rest_duration: number | null;
  rest_midpoint: number | null;
  rest_regularity: number | null;
  restSource: "healthkit" | "steps" | null;
}

export function sleepFeatures(byDate: Map<string, DayRaw>, date: string, cfg: Config): SleepFeatures {
  const today = restPeriod(byDate, date, cfg);
  if (!today) return { rest_duration: null, rest_midpoint: null, rest_regularity: null, restSource: null };
  // Regularity: sd of the midpoint over the 7 days ending on `date`, same source only.
  const mids: number[] = [(today.start + today.end) / 2];
  for (let k = 1; k <= 6; k++) {
    const rp = restPeriod(byDate, addDays(date, -k), cfg);
    if (rp && rp.source === today.source) mids.push((rp.start + rp.end) / 2);
  }
  return {
    rest_duration: (today.end - today.start) / 60,
    rest_midpoint: (today.start + today.end) / 2,
    rest_regularity: mids.length >= 5 ? sd(mids) : null,
    restSource: today.source,
  };
}
