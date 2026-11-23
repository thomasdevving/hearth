import type { Config, ContextLabel, DayRecord, FeatureId, PlanRule, QuestionnaireRecord, RuleDirection, State } from "./types";
import { buildEligibility, comparisonValues, featureFloor, referenceSet, referenceStats } from "./baseline";
import { addDays, dateOfTimestamp, daysBetween } from "./time";
import { catalogueId, featureDef } from "./features/catalogue";
import { ruleFeatureId } from "./index-score";

/**
 * Explanations of what the engine already decided, for the "Why?" screen and for looking back
 * at a hard stretch. Pure functions over stored day records: they compute nothing the scoring
 * did not, and no model is involved (R2).
 */

const CHANGED: State[] = ["ELEVATED", "CONFIRMED"];
const byDate = (records: DayRecord[]) => [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// The usual range of one signal -----------------------------------------------------------

export interface UsualPoint {
  date: string;
  value: number | null;
  /** The middle of the days this day was compared with, and that ± one robust spread. */
  median: number | null;
  low: number | null;
  high: number | null;
  z: number | null;
}

/**
 * Per day from `from` on: the feature's value and the usual range it was scored against
 * (docs/04 §3: eligible reference days, same day type when possible, median ± 1.4826·MAD + floor),
 * using the questionnaires known on that day.
 */
export function usualRangeSeries(
  records: DayRecord[],
  feature: FeatureId,
  from: string,
  contexts: ContextLabel[],
  questionnaires: QuestionnaireRecord[],
  cfg: Config,
): UsualPoint[] {
  const all = byDate(records);
  return all
    .filter((r) => r.date >= from)
    .map((r) => {
      // As the engine saw that day: a questionnaire taken later does not change the past range.
      const known = questionnaires.filter((q) => dateOfTimestamp(q.takenAt) <= r.date);
      const eligible = buildEligibility(all, r.date, contexts, known, cfg);
      const ref = referenceSet(feature, eligible, r.features.restSource, cfg);
      const values = comparisonValues(ref, r.features.dayType, cfg);
      const stats = values ? referenceStats(values, featureFloor(feature, cfg)) : null;
      const value = r.features.values[feature] ?? null;
      return {
        date: r.date,
        value,
        median: stats?.median ?? null,
        low: stats ? stats.median - stats.scale : null,
        high: stats ? stats.median + stats.scale : null,
        z: r.z[feature] ?? null,
      };
    });
}

// Episodes ----------------------------------------------------------------------------------

export interface Episode {
  /** First day of the stretch the engine marked as a change (ELEVATED or CONFIRMED). */
  start: string;
  /** Last changed day; null while the stretch is still going on. */
  end: string | null;
}

/** The most recent changed stretch, ongoing or finished; null if there has been none. */
export function latestEpisode(records: DayRecord[]): Episode | null {
  const all = byDate(records);
  let i = all.length - 1;
  while (i >= 0 && !CHANGED.includes(all[i].state)) i--;
  if (i < 0) return null;
  const ongoing = i === all.length - 1;
  const endIdx = i;
  while (i > 0 && CHANGED.includes(all[i - 1].state)) i--;
  return { start: all[i].date, end: ongoing ? null : all[endIdx].date };
}

export interface WhyTimeline {
  episode: Episode | null;
  /** Before the stretch: the day whose own index was furthest above the limit while the trend stayed inside it. */
  singleDay: { date: string; D: number; UCL: number } | null;
  /** Days the trend (EWMA) had been rising before it crossed the limit. */
  risingDays: number;
}

/** "One bad day did not count; the trend did": the facts behind the index chart. */
export function whyTimeline(records: DayRecord[], cfg: Pick<Config, "onsetLookbackDays">): WhyTimeline {
  const all = byDate(records);
  const episode = latestEpisode(all);
  if (!episode) return { episode, singleDay: null, risingDays: 0 };
  const startIdx = all.findIndex((r) => r.date === episode.start);
  const from = addDays(episode.start, -cfg.onsetLookbackDays);
  let singleDay: WhyTimeline["singleDay"] = null;
  for (const r of all.slice(0, startIdx)) {
    if (r.date < from || r.D === null || r.UCL === null || r.elevated) continue;
    if (r.D > r.UCL && r.S <= r.UCL && (!singleDay || r.D - r.UCL > singleDay.D - singleDay.UCL)) singleDay = { date: r.date, D: r.D, UCL: r.UCL };
  }
  let risingDays = 0;
  for (let i = startIdx; i > 0 && all[i].S > all[i - 1].S; i--) risingDays++;
  return { episode, singleDay, risingDays };
}

// What came first -----------------------------------------------------------------------------

export interface SignalOnset {
  feature: FeatureId;
  /** The rule in the user's plan that watches this signal, if any. */
  ruleId: string | null;
  /** First day of the first sustained move away from the usual range; null if it did not move. */
  firstDate: string | null;
  /** Days before the start of the stretch (negative: after it started). */
  daysBefore: number | null;
  /** Which way it moved, in the plan's words. */
  direction: RuleDirection | null;
}

export interface OnsetResult {
  episode: Episode;
  /** Signals that moved, earliest first: the user's own signs and the others. */
  moved: SignalOnset[];
  /** Signs in the user's plan that did not move this time. */
  unchanged: SignalOnset[];
}

function directionFromZ(feature: FeatureId, z: number): RuleDirection {
  const id = catalogueId(feature);
  if (id === "rest_midpoint") return z > 0 ? "later" : "earlier";
  if (id === "rest_regularity" || id === "rhythm_stability") return "less_regular";
  return z > 0 ? "higher" : "lower";
}

/**
 * For the latest stretch: which signals moved first, and how many days before the engine
 * noticed. A signal "moved" on the first day it was at least `onsetRiskMin` away from the
 * usual range (in its risk direction) on `onsetSustainDays` of three days in a row, searched
 * from `onsetLookbackDays` before the stretch to its end. Masked or unusable days do not count.
 */
export function signalOnset(records: DayRecord[], rules: PlanRule[], cfg: Pick<Config, "onsetLookbackDays" | "onsetRiskMin" | "onsetSustainDays">): OnsetResult | null {
  const all = byDate(records);
  const episode = latestEpisode(all);
  if (!episode) return null;
  const from = addDays(episode.start, -cfg.onsetLookbackDays);
  const to = episode.end ?? all[all.length - 1].date;
  const window = all.filter((r) => r.date >= from && r.date <= to);

  const ruleFor = new Map<FeatureId, string>();
  for (const rule of rules) {
    const f = ruleFeatureId(rule);
    if (f) ruleFor.set(f, rule.id);
  }
  const features = new Set<FeatureId>(ruleFor.keys());
  for (const r of window) for (const [f, v] of Object.entries(r.r)) if (v !== null && featureDef(f)) features.add(f);

  const moved: SignalOnset[] = [];
  const unchanged: SignalOnset[] = [];
  for (const feature of features) {
    const hit = (i: number) => (window[i]?.r[feature] ?? 0) >= cfg.onsetRiskMin;
    let first = -1;
    for (let i = 0; i < window.length && first < 0; i++) {
      if (!hit(i)) continue;
      const n = [i, i + 1, i + 2].filter(hit).length;
      if (n >= cfg.onsetSustainDays) first = i;
    }
    const ruleId = ruleFor.get(feature) ?? null;
    if (first < 0) {
      if (ruleId) unchanged.push({ feature, ruleId, firstDate: null, daysBefore: null, direction: null });
      continue;
    }
    const day = window[first];
    moved.push({
      feature,
      ruleId,
      firstDate: day.date,
      daysBefore: daysBetween(day.date, episode.start),
      direction: directionFromZ(feature, day.z[feature] ?? 0),
    });
  }
  moved.sort((a, b) => (a.firstDate! < b.firstDate! ? -1 : a.firstDate! > b.firstDate! ? 1 : (a.ruleId ? 0 : 1) - (b.ruleId ? 0 : 1) || a.feature.localeCompare(b.feature)));
  return { episode, moved, unchanged };
}
