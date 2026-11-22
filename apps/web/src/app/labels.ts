import { datesOfIsoWeek, type FeatureId, type PlanRule, type Place, type State, type WeekAggregate } from "@hearth/engine";

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
  rest_midpoint: "Middle of your night",
  rest_regularity: "Regular rest times",
  hrv: "Heart rate variability",
  resting_hr: "Resting heart rate",
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

/** Features whose label is plural ("Steps", "Visits to the gym") take a plural verb. */
const PLURAL = new Set(["steps", "active_hours", "places_visited", "place_visits"]);
const PLURAL_TEXT: Record<PlanRule["direction"], string> = {
  higher: "go up",
  lower: "go down",
  later: "get later",
  earlier: "get earlier",
  less_regular: "get less regular",
};

export function directionText(feature: FeatureId, direction: PlanRule["direction"]): string {
  return (PLURAL.has(feature.split(":")[0]) ? PLURAL_TEXT : DIRECTION_TEXT)[direction];
}

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
  if (f === "place_visits") return `${v} in 7 days`;
  if (f === "steps") return Math.round(v).toLocaleString("en-GB");
  if (f === "rest_duration") return `${v.toFixed(1)} h`;
  if (f === "walking_speed") return `${v.toFixed(2)} m/s`;
  if (f === "hrv") return `${Math.round(v)} ms`;
  if (f === "resting_hr") return `${Math.round(v)} bpm`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "2026-W40" → "the week of 28 Sep": people know weeks by their dates, not their number. */
export function weekLabel(isoWeek: string): string {
  const monday = datesOfIsoWeek(isoWeek)[0];
  const d = new Date(`${monday}T12:00:00Z`);
  return `the week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

const DOMAIN_WORD: Record<string, string> = { activity: "activity", rhythm: "daily rhythm", sleep: "rest", body: "heart", mobility: "places", phone: "phone use" };

/**
 * A weekly aggregate in the words the person sees in the app, for task D and E. Same numbers,
 * same data (S1, nothing added): only field names, ids and week codes become plain words, so
 * the model does not repeat "indexMean" or "2026-W40" back to the person.
 */
export function readableWeek(w: WeekAggregate): Record<string, unknown> {
  const domains: Record<string, number> = {};
  for (const [k, v] of Object.entries(w.domainMeans)) if (v !== undefined) domains[DOMAIN_WORD[k] ?? k] = v;
  return {
    week: weekLabel(w.isoWeek),
    daysWithData: w.daysWithData,
    changeFromUsual: w.indexMean,
    daysThatLookedDifferentFromUsual: w.daysElevated,
    howDifferentByArea: domains,
    signalsThatMovedMost: [...new Set(w.topContributors.map((f) => featureLabel(f).replace(/^Visits to a place$/, "Visits to a named place")))],
    checkins: w.ema.n === 0 ? null : { answered: w.ema.n, feelingDownOutOf7: w.ema.mood_low, enjoymentOutOf7: w.ema.enjoyment, energyOutOf7: w.ema.energy },
    phq2: w.phq2,
    phq9: w.phq9,
    whatWasGoingOn: w.contexts.map((c) => CONTEXT_LABEL[c] ?? c),
    noteInOwnWords: w.note?.text ?? null,
  };
}
