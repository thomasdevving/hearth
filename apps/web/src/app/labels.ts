import type { FeatureId, PlanRule, Place, State } from "@hearth/engine";

export const STATE_LABEL: Record<State, string> = {
  WARM_UP: "Learning your pattern",
  MONITOR: "Steady",
  ELEVATED: "Changed",
  CONFIRMED: "Changed",
};

export const STATE_TEXT: Record<State, string> = {
  WARM_UP: "Hearth is still learning what your usual weeks look like. This takes about two weeks.",
  MONITOR: "Your days look like your usual pattern.",
  ELEVATED: "Some of your signals have moved away from your usual pattern for a few days. That can have many reasons.",
  CONFIRMED: "Your answers and your signals both show a change from your usual pattern. Your plan is below.",
};

const FEATURE_LABEL: Record<string, string> = {
  steps: "Steps",
  active_hours: "Active hours",
  walking_speed: "Walking pace",
  rhythm_stability: "Daily rhythm",
  fragmentation: "Stop-and-start activity",
  relative_amplitude: "Day–night difference",
  rest_duration: "Rest length",
  rest_midpoint: "Rest time (midpoint)",
  rest_regularity: "Regular rest times",
  home_stay: "Time at home",
  location_entropy: "Variety of places",
  places_visited: "Places visited",
  location_variance: "Area covered",
  routine_regularity: "Usual routine",
  place_visits: "Visits",
  screen_time: "Screen time",
  night_use: "Phone use at night",
  communication_time: "Time in messaging apps",
};

export function featureLabel(feature: FeatureId, places: Place[] = []): string {
  if (feature.startsWith("place_visits")) {
    const id = feature.split(":")[1];
    const p = places.find((x) => x.id === id);
    return p?.label ? `Visits to the ${p.label}` : "Visits to a place";
  }
  return FEATURE_LABEL[feature] ?? feature;
}

export function ruleFeature(rule: PlanRule): FeatureId {
  return rule.feature === "place_visits" && rule.placeId ? `place_visits:${rule.placeId}` : rule.feature;
}

export const DIRECTION_TEXT: Record<PlanRule["direction"], string> = {
  higher: "goes up",
  lower: "goes down",
  later: "gets later",
  earlier: "gets earlier",
  less_regular: "gets less regular",
};

export const CONTEXT_LABEL: Record<string, string> = {
  holiday: "On holiday",
  travel: "Travelling",
  visitors: "Visitors staying",
  ill: "Ill",
  moving: "Moving house",
  exams: "Exams",
  new_job: "New job",
  loss: "A loss",
  other_stress: "Something stressful",
};

export function formatValue(feature: FeatureId, v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  const f = feature.split(":")[0];
  if (f === "rest_midpoint") {
    const m = ((Math.round(v) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  if (f === "home_stay") return `${Math.round(v * 100)} %`;
  if (f === "steps") return Math.round(v).toLocaleString("en-GB");
  if (f === "rest_duration") return `${v.toFixed(1)} h`;
  if (f === "walking_speed") return `${v.toFixed(2)} m/s`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
