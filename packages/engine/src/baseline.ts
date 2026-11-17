import type { Config, ContextLabel, DayRecord, DayType, Domain, FeatureId, QuestionnaireRecord } from "./types";
import { clamp, mad, median } from "./stats";
import { dayIndex, dateOfTimestamp } from "./time";
import { maskedDomains, mobilityRestart } from "./context";
import { catalogueId, featureDef } from "./features/catalogue";

const SLEEP_FEATURES = new Set(["rest_duration", "rest_midpoint", "rest_regularity"]);

export interface EligibleDay {
  record: DayRecord;
  base: boolean; // state and PHQ-9 conditions of docs/04 §3.1
  masked: Set<Domain>;
}

/**
 * Past days (before `date`, newest first) with the feature-independent part of the
 * eligibility rules: stored state MONITOR or WARM_UP, not elevated, and no flagged PHQ-9
 * within 14 days before or after. Masks are the stored ones plus those of the current labels.
 */
export function buildEligibility(history: DayRecord[], date: string, contexts: ContextLabel[], questionnaires: QuestionnaireRecord[], cfg: Config): EligibleDay[] {
  const flagged = questionnaires.filter((q) => q.instrument === "PHQ9" && q.result.flagged).map((q) => dayIndex(dateOfTimestamp(q.takenAt)));
  const restart = mobilityRestart(date, contexts, cfg);
  return history
    .filter((r) => r.date < date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((record) => {
      const idx = dayIndex(record.date);
      const stateOk = (record.state === "MONITOR" || record.state === "WARM_UP") && !record.elevated;
      const phqOk = !flagged.some((f) => Math.abs(f - idx) <= 14);
      const masked = new Set<Domain>([...record.maskedDomains, ...maskedDomains(record.date, contexts, cfg)]);
      if (restart !== null && record.date <= restart) masked.add("mobility");
      return { record, base: stateOk && phqOk, masked };
    });
}

export interface RefValue {
  value: number;
  dayType: DayType;
}

/** R_j(d): the most recent cfg.baselineWindowDays eligible values of one feature. */
export function referenceSet(feature: FeatureId, days: EligibleDay[], restSource: "healthkit" | "steps" | null, cfg: Config): RefValue[] {
  const def = featureDef(feature);
  if (!def) return [];
  const needSource = SLEEP_FEATURES.has(catalogueId(feature));
  const out: RefValue[] = [];
  for (const d of days) {
    if (out.length >= cfg.baselineWindowDays) break;
    if (!d.base || d.masked.has(def.domain)) continue;
    const v = d.record.features.values[feature];
    if (v === null || v === undefined) continue;
    if (needSource && d.record.features.restSource !== restSource) continue;
    out.push({ value: v, dayType: d.record.features.dayType });
  }
  return out;
}

/**
 * The values a day of `dayType` is compared with: null when the feature is not usable
 * (fewer than cfg.minReferenceDays), same-day-type values when at least cfg.minSameDayType
 * exist, otherwise all of them (docs/04 §2, §3.2).
 */
export function comparisonValues(ref: RefValue[], dayType: DayType, cfg: Config): number[] | null {
  if (ref.length < cfg.minReferenceDays) return null;
  const same = ref.filter((r) => r.dayType === dayType);
  return (same.length >= cfg.minSameDayType ? same : ref).map((r) => r.value);
}

export function featureFloor(feature: FeatureId, cfg: Config): number {
  return cfg.featureFloors[catalogueId(feature)] ?? 0;
}

export function referenceStats(values: number[], floor: number): { median: number; scale: number } | null {
  const m = median(values);
  const d = mad(values);
  if (m === null || d === null) return null;
  return { median: m, scale: 1.4826 * d + floor };
}

/** docs/04 §3.3. Null when there is no reference or the scale is zero. */
export function robustZ(x: number, values: number[], floor: number): number | null {
  const st = referenceStats(values, floor);
  if (!st || st.scale <= 0) return null;
  return clamp((x - st.median) / st.scale, -4, 4);
}
