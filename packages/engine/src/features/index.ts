import type { Config, DayRaw, FeatureDay, Place, PlanRule } from "../types";
import { dayTypeOf } from "../time";
import { activityFeatures } from "./activity";
import { placeVisitsFeatureId } from "./catalogue";
import { findHome, learnPlaces, mobilityFeatures, placeVisits } from "./mobility";
import { phoneFeatures } from "./phone";
import { rhythmFeatures } from "./rhythm";
import { sleepFeatures } from "./sleep";

export interface FeatureContext {
  places: Place[];
  homePlaceId: string | null;
  rules?: PlanRule[];
}

export function indexRaws(raws: DayRaw[]): Map<string, DayRaw> {
  const m = new Map<string, DayRaw>();
  for (const r of raws) m.set(r.date, r);
  return m;
}

/**
 * All features of one local day (docs/03). Without `ctx`, places and home are learned from
 * the raws up to `date`; `dailyUpdate` passes the places stored in EngineState instead.
 */
export function computeFeatures(raws: DayRaw[], date: string, cfg: Config, ctx?: FeatureContext): FeatureDay {
  const byDate = indexRaws(raws);
  let places: Place[];
  let home: string | null;
  if (ctx) {
    places = ctx.places;
    home = ctx.homePlaceId;
  } else {
    places = [];
    for (const r of [...raws].filter((x) => x.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1))) places = learnPlaces(places, r, cfg);
    home = findHome(places, byDate, date, cfg);
  }
  const raw = byDate.get(date);
  const sleep = sleepFeatures(byDate, date, cfg);
  const values: Record<string, number | null> = {
    ...activityFeatures(raw, cfg),
    ...rhythmFeatures(byDate, date, cfg),
    rest_duration: sleep.rest_duration,
    rest_midpoint: sleep.rest_midpoint,
    rest_regularity: sleep.rest_regularity,
    ...mobilityFeatures(byDate, date, places, home, cfg),
    ...phoneFeatures(raw, cfg),
  };
  for (const rule of ctx?.rules ?? []) {
    if (rule.active && rule.feature.startsWith("place_visits") && rule.placeId) {
      values[placeVisitsFeatureId(rule.placeId)] = placeVisits(byDate, date, places, rule.placeId, cfg);
    }
  }
  return { date, dayType: dayTypeOf(date), values, restSource: sleep.restSource };
}

export * from "./catalogue";
export { stepsPresent, hourlySteps } from "./activity";
export { restPeriod } from "./sleep";
export { learnPlaces, findHome, nearestPlace, placeVisits } from "./mobility";
