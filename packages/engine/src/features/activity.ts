import type { Config, DayRaw } from "../types";

/** Day coverage rule (docs/03 §2): at least cfg.minDailySteps steps, otherwise not carried. */
export function stepsPresent(raw: DayRaw | undefined | null, cfg: Config): boolean {
  if (!raw || !raw.stepBins15 || raw.stepBins15.length !== 96) return false;
  let total = 0;
  for (const v of raw.stepBins15) total += v;
  return total >= cfg.minDailySteps;
}

/** 24 hourly sums of the 15-minute bins. */
export function hourlySteps(bins: number[]): number[] {
  const out: number[] = new Array(24).fill(0);
  for (let i = 0; i < 96; i++) out[i >> 2] += bins[i] ?? 0;
  return out;
}

export function activityFeatures(raw: DayRaw | undefined, cfg: Config): { steps: number | null; active_hours: number | null; walking_speed: number | null } {
  const walking_speed = raw && typeof raw.walkingSpeed === "number" && Number.isFinite(raw.walkingSpeed) ? raw.walkingSpeed : null;
  if (!raw || !stepsPresent(raw, cfg)) return { steps: null, active_hours: null, walking_speed };
  const bins = raw.stepBins15 as number[];
  let steps = 0;
  for (const v of bins) steps += v;
  const active_hours = hourlySteps(bins).filter((h) => h >= cfg.activeHourSteps).length;
  return { steps, active_hours, walking_speed };
}
