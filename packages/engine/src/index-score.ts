import type { Config, Contributor, DayRecord, Domain, FeatureId, Place, PlanRule } from "./types";
import { mean } from "./stats";
import { DOMAINS, catalogueId, featureDef, placeVisitsFeatureId, type Direction } from "./features/catalogue";

/** The feature a confirmed rule watches, or null (inactive, or a place rule without a place). */
export function ruleFeatureId(rule: PlanRule): FeatureId | null {
  if (!rule.active) return null;
  if (catalogueId(rule.feature) === "place_visits") {
    if (rule.feature.includes(":")) return rule.feature;
    return rule.placeId ? placeVisitsFeatureId(rule.placeId) : null;
  }
  return featureDef(rule.feature) ? rule.feature : null;
}

/**
 * Risk direction of a rule (docs/04 §4.1): higher/later → "+", lower/earlier → "-".
 * `less_regular` means the catalogue direction of the feature: "+" for rest_regularity
 * (a larger spread) and "-" for rhythm_stability (a lower stability).
 */
export function ruleDirection(rule: PlanRule): Direction {
  switch (rule.direction) {
    case "higher":
    case "later":
      return "+";
    case "lower":
    case "earlier":
      return "-";
    case "less_regular": {
      const d = featureDef(rule.feature)?.dir;
      return d === "-" ? "-" : "+";
    }
  }
}

export function personalRuleFor(feature: FeatureId, rules: PlanRule[]): PlanRule | null {
  return rules.find((r) => ruleFeatureId(r) === feature) ?? null;
}

export function directionOf(feature: FeatureId, rules: PlanRule[]): Direction {
  const rule = personalRuleFor(feature, rules);
  if (rule) return ruleDirection(rule);
  return featureDef(feature)?.dir ?? "±";
}

/** docs/04 §4.1, capped at 3. */
export function riskFromZ(z: number, dir: Direction): number {
  const r = dir === "+" ? Math.max(0, z) : dir === "-" ? Math.max(0, -z) : Math.max(0, Math.abs(z) - 1);
  return Math.min(3, r);
}

export interface Scores {
  r: Record<FeatureId, number | null>;
  domainScores: Partial<Record<Domain, number>>;
  D: number | null;
  D_daily: number | null;
  P: number | null;
}

function indexFrom(z: Record<FeatureId, number | null>, r: Record<FeatureId, number | null>, rules: PlanRule[], cfg: Config, dailyOnly: boolean) {
  const sums = new Map<Domain, { num: number; den: number }>();
  for (const feature of Object.keys(z)) {
    const rv = r[feature];
    if (rv === null || rv === undefined) continue;
    const def = featureDef(feature);
    if (!def) continue;
    if (dailyOnly && def.win !== "day") continue;
    const a = personalRuleFor(feature, rules) ? cfg.personalWeight : 1;
    const cur = sums.get(def.domain) ?? { num: 0, den: 0 };
    cur.num += a * rv;
    cur.den += a;
    sums.set(def.domain, cur);
  }
  const domainScores: Partial<Record<Domain, number>> = {};
  for (const d of DOMAINS) {
    const s = sums.get(d);
    if (s && s.den > 0) domainScores[d] = s.num / s.den;
  }
  const present = Object.values(domainScores) as number[];
  const D = present.length >= cfg.minDomains ? (mean(present) as number) : null;
  return { domainScores, D };
}

/** From z-scores of the usable, unmasked features to r, domain scores, D, D_daily and P (docs/04 §4). */
export function scoreFromZ(z: Record<FeatureId, number | null>, rules: PlanRule[], cfg: Config): Scores {
  const r: Record<FeatureId, number | null> = {};
  for (const [feature, zv] of Object.entries(z)) r[feature] = zv === null ? null : riskFromZ(zv, directionOf(feature, rules));
  const full = indexFrom(z, r, rules, cfg, false);
  const daily = indexFrom(z, r, rules, cfg, true);
  let num = 0;
  let den = 0;
  for (const feature of Object.keys(r)) {
    const rv = r[feature];
    if (rv === null || !personalRuleFor(feature, rules)) continue;
    num += cfg.personalWeight * rv;
    den += cfg.personalWeight;
  }
  return { r, domainScores: full.domainScores, D: full.D, D_daily: daily.D, P: den > 0 ? num / den : null };
}

function formatMinutes(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Plain-language phrase for a deviating feature. Never diagnostic (rule R9). */
export function contributorPhrase(feature: FeatureId, z: number, opts: { days?: number; deltaMinutes?: number | null; placeLabel?: string | null; restSource?: "healthkit" | "steps" | null }): string {
  const up = z >= 0;
  let base: string;
  switch (catalogueId(feature)) {
    case "steps": base = up ? "more steps than usual" : "fewer steps than usual"; break;
    case "active_hours": base = up ? "more active hours than usual" : "fewer active hours than usual"; break;
    case "walking_speed": base = up ? "a faster walking pace" : "a slower walking pace"; break;
    case "rhythm_stability": base = up ? "a steadier daily rhythm" : "a less steady daily rhythm"; break;
    case "fragmentation": base = up ? "activity in shorter bursts" : "activity in longer stretches"; break;
    case "relative_amplitude": base = up ? "a bigger difference between day and night activity" : "a smaller difference between day and night activity"; break;
    case "rest_duration": base = up ? "longer rest than usual" : "shorter rest than usual"; break;
    case "rest_midpoint": {
      base = up ? "later rest time" : "earlier rest time";
      if (opts.deltaMinutes != null && Math.abs(opts.deltaMinutes) >= 1) base += ` (${up ? "+" : "−"}${formatMinutes(opts.deltaMinutes)})`;
      break;
    }
    case "rest_regularity": base = up ? "less regular rest times" : "more regular rest times"; break;
    case "hrv": base = up ? "higher heart rate variability than usual" : "lower heart rate variability than usual"; break;
    case "resting_hr": base = up ? "a higher resting heart rate than usual" : "a lower resting heart rate than usual"; break;
    case "home_stay": base = up ? "home more than usual" : "home less than usual"; break;
    case "location_entropy": base = up ? "more variety in where you spend time" : "less variety in where you spend time"; break;
    case "places_visited": base = up ? "more places visited than usual" : "fewer places visited than usual"; break;
    case "location_variance": base = up ? "moving around a wider area" : "staying closer to one place"; break;
    case "routine_regularity": base = up ? "a more familiar daily routine" : "a different daily routine"; break;
    case "place_visits": {
      const where = opts.placeLabel ? `the ${opts.placeLabel}` : "a place you named";
      base = up ? `more visits to ${where}` : `fewer visits to ${where}`;
      break;
    }
    case "screen_time": base = up ? "more screen time than usual" : "less screen time than usual"; break;
    case "night_use": base = up ? "more phone use at night" : "less phone use at night"; break;
    case "communication_time": base = up ? "more time in messaging apps" : "less time in messaging apps"; break;
    default: base = "a change from your usual pattern";
  }
  // docs/03 §4: "rest" unless the night was measured as sleep by a watch.
  if (opts.restSource === "healthkit" && catalogueId(feature).startsWith("rest_")) base = base.replace(/\brest\b/, "sleep");
  if (opts.days && opts.days >= 2) base += ` (${opts.days} days)`;
  return base;
}

/** Top 3 features with r ≥ 1, sorted by weight · r (docs/04 §4.3). */
export function buildContributors(
  z: Record<FeatureId, number | null>,
  r: Record<FeatureId, number | null>,
  rules: PlanRule[],
  cfg: Config,
  history: DayRecord[],
  places: Place[],
  refMedian: (feature: FeatureId) => number | null,
  values: Record<FeatureId, number | null>,
  restSource: "healthkit" | "steps" | null = null,
): Contributor[] {
  const rows: { feature: FeatureId; r: number; w: number }[] = [];
  for (const feature of Object.keys(r)) {
    const rv = r[feature];
    if (rv === null || rv === undefined || rv < 1) continue;
    rows.push({ feature, r: rv, w: (personalRuleFor(feature, rules) ? cfg.personalWeight : 1) * rv });
  }
  rows.sort((a, b) => b.w - a.w || (a.feature < b.feature ? -1 : 1));
  const past = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows.slice(0, 3).map(({ feature, r: rv }) => {
    let days = 1;
    for (const rec of past) {
      const pr = rec.r[feature];
      if (pr !== null && pr !== undefined && pr >= 1) days++;
      else break;
    }
    let deltaMinutes: number | null = null;
    if (feature === "rest_midpoint") {
      const med = refMedian(feature);
      const v = values[feature];
      if (med !== null && v !== null && v !== undefined) deltaMinutes = v - med;
    }
    const placeId = feature.includes(":") ? feature.slice(feature.indexOf(":") + 1) : null;
    const placeLabel = placeId ? (places.find((p) => p.id === placeId)?.label ?? null) : null;
    return { feature, r: rv, phrase: contributorPhrase(feature, z[feature] as number, { days, deltaMinutes, placeLabel, restSource }) };
  });
}
