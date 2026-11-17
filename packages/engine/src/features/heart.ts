import type { DayRaw } from "../types";

/** docs/03 §9: heart rate variability and resting heart rate, from a watch. */
export function heartFeatures(raw: DayRaw | undefined): { hrv: number | null; resting_hr: number | null } {
  const h = raw?.heart;
  const inRange = (v: number | null | undefined, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  return { hrv: inRange(h?.hrv, 5, 300), resting_hr: inRange(h?.restingHr, 30, 130) };
}
