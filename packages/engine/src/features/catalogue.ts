import type { Domain, FeatureId } from "../types";

export type Direction = "+" | "-" | "±";
export type FeatureWindow = "day" | "roll7";
export interface FeatureDef {
  id: string;
  domain: Domain;
  dir: Direction;
  win: FeatureWindow;
}

/** docs/03 §2. `place_visits` is the template for "place_visits:<placeId>". */
export const FEATURE_CATALOGUE: FeatureDef[] = [
  { id: "steps", domain: "activity", dir: "-", win: "day" },
  { id: "active_hours", domain: "activity", dir: "-", win: "day" },
  { id: "walking_speed", domain: "activity", dir: "-", win: "day" },
  { id: "rhythm_stability", domain: "rhythm", dir: "-", win: "roll7" },
  { id: "fragmentation", domain: "rhythm", dir: "+", win: "roll7" },
  { id: "relative_amplitude", domain: "rhythm", dir: "-", win: "roll7" },
  { id: "rest_duration", domain: "sleep", dir: "±", win: "day" },
  { id: "rest_midpoint", domain: "sleep", dir: "±", win: "day" },
  { id: "rest_regularity", domain: "sleep", dir: "+", win: "roll7" },
  { id: "home_stay", domain: "mobility", dir: "+", win: "day" },
  { id: "location_entropy", domain: "mobility", dir: "-", win: "day" },
  { id: "places_visited", domain: "mobility", dir: "-", win: "day" },
  { id: "location_variance", domain: "mobility", dir: "-", win: "day" },
  { id: "routine_regularity", domain: "mobility", dir: "-", win: "day" },
  { id: "place_visits", domain: "mobility", dir: "-", win: "roll7" },
  { id: "screen_time", domain: "phone", dir: "+", win: "day" },
  { id: "night_use", domain: "phone", dir: "+", win: "day" },
  { id: "communication_time", domain: "phone", dir: "-", win: "day" },
];

export const DOMAINS: Domain[] = ["activity", "rhythm", "sleep", "mobility", "phone"];

/** Features always present in FeatureDay.values (everything except the place_visits template). */
export const BASE_FEATURE_IDS: string[] = FEATURE_CATALOGUE.filter((f) => f.id !== "place_visits").map((f) => f.id);

const byId = new Map(FEATURE_CATALOGUE.map((f) => [f.id, f]));

/** "place_visits:p1" → "place_visits"; other ids unchanged. */
export function catalogueId(feature: FeatureId): string {
  const i = feature.indexOf(":");
  return i < 0 ? feature : feature.slice(0, i);
}

export function featureDef(feature: FeatureId): FeatureDef | null {
  return byId.get(catalogueId(feature)) ?? null;
}

export function placeVisitsFeatureId(placeId: string): FeatureId {
  return `place_visits:${placeId}`;
}
