// Task Q, "ask your data" (docs/05 task Q): the model classifies, this code computes the facts.
import type { CheckinRecord, DayRecord } from "./types";
import { mean, median } from "./stats";
import { addDays, dateOfTimestamp, weekdayOf } from "./time";

export type AskIntent = "trend" | "compare" | "why_asked" | "unsupported" | "crisis";
export type AskFeature =
  | "none" | "steps" | "active_hours" | "walking_speed" | "rhythm_stability" | "rest_duration" | "rest_midpoint"
  | "rest_regularity" | "home_stay" | "places_visited" | "routine_regularity" | "mood_low" | "enjoyment" | "energy" | "index";
export type AskPeriod = "none" | "today" | "this_week" | "last_week" | "last_4_weeks";

const LABEL: Record<string, string> = {
  steps: "steps per day", active_hours: "active hours per day", walking_speed: "walking pace", rhythm_stability: "steadiness of your daily rhythm",
  rest_duration: "rest length", rest_midpoint: "middle of your rest", rest_regularity: "spread of your rest times", home_stay: "time at home",
  places_visited: "places visited per day", routine_regularity: "time spent in your usual places", mood_low: "feeling down (1 to 7)",
  enjoyment: "enjoyment (1 to 7)", energy: "energy (1 to 7)", index: "change index",
};
const PERIOD_LABEL: Record<string, string> = { today: "today", this_week: "this week", last_week: "last week", last_4_weeks: "the last 4 weeks", none: "the last week" };

export function formatFact(feature: string, v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  switch (feature) {
    case "rest_midpoint": {
      const m = ((Math.round(v) % 1440) + 1440) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    }
    case "home_stay":
    case "routine_regularity":
      return `${Math.round(v * 100)} %`;
    case "steps":
      return String(Math.round(v / 10) * 10);
    case "rest_duration":
      return `${v.toFixed(1)} hours`;
    case "walking_speed":
      return `${v.toFixed(2)} m/s`;
    case "rest_regularity":
      return `${Math.round(v)} minutes`;
    default:
      return v.toFixed(1);
  }
}

/** First and last date of a period ending on `today`. */
export function periodRange(period: AskPeriod, today: string): [string, string] {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  switch (period) {
    case "today":
      return [today, today];
    case "this_week":
      return [monday, today];
    case "last_week":
      return [addDays(monday, -7), addDays(monday, -1)];
    case "last_4_weeks":
      return [addDays(today, -27), today];
    default:
      return [addDays(today, -6), today];
  }
}

function dailyValues(feature: AskFeature, records: DayRecord[], checkins: CheckinRecord[], from: string, to: string, usualOnly = false): number[] {
  if (feature === "mood_low" || feature === "enjoyment" || feature === "energy") {
    return checkins
      .filter((c) => c.answeredAt !== null && dateOfTimestamp(c.answeredAt) >= from && dateOfTimestamp(c.answeredAt) <= to)
      .map((c) => c.answers[feature])
      .filter((x): x is number => typeof x === "number");
  }
  return records
    .filter((r) => r.date >= from && r.date <= to && (!usualOnly || ((r.state === "MONITOR" || r.state === "WARM_UP") && !r.elevated)))
    .map((r) => (feature === "index" ? r.D : r.features.values[feature]))
    .filter((x): x is number => typeof x === "number");
}

export interface AskFacts {
  kind: AskIntent;
  signal?: string;
  period?: string;
  value?: string | null;
  usual?: string | null;
  previous?: string | null;
  days?: number;
  direction?: "higher" | "lower" | "about the same" | null;
  last_checkin?: { date: string; reason: "random" | "pattern change" | "regular schedule"; changes: string[] } | null;
}

/** The facts a phrasing model may use; every number in the answer must come from here. */
export function askFacts(c: { intent: AskIntent; feature: AskFeature; period: AskPeriod }, records: DayRecord[], checkins: CheckinRecord[], today: string): AskFacts {
  if (c.intent === "why_asked") {
    const last = [...checkins].filter((x) => dateOfTimestamp(x.scheduledAt) <= today).sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1))[0];
    return {
      kind: "why_asked",
      last_checkin: last ? { date: dateOfTimestamp(last.scheduledAt), reason: last.kind === "triggered" ? "pattern change" : last.kind === "fixed" ? "regular schedule" : "random", changes: last.reasons.map((r) => r.phrase) } : null,
    };
  }
  if (c.intent !== "trend" && c.intent !== "compare") return { kind: c.intent };
  const feature = c.feature === "none" ? "index" : c.feature;
  const [from, to] = periodRange(c.period, today);
  const now = dailyValues(feature, records, checkins, from, to);
  const value = feature === "rest_midpoint" || feature === "steps" ? median(now) : mean(now);
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  let other: number | null;
  if (c.intent === "compare") {
    const usual = dailyValues(feature, records, checkins, addDays(from, -56), addDays(from, -1), true);
    other = median(usual);
  } else {
    const prev = dailyValues(feature, records, checkins, addDays(from, -len), addDays(from, -1));
    other = feature === "rest_midpoint" || feature === "steps" ? median(prev) : mean(prev);
  }
  let direction: AskFacts["direction"] = null;
  if (value !== null && other !== null) {
    const tol = Math.max(Math.abs(other) * 0.05, feature === "rest_midpoint" ? 15 : 0.05);
    direction = Math.abs(value - other) <= tol ? "about the same" : value > other ? "higher" : "lower";
  }
  const facts: AskFacts = { kind: c.intent, signal: LABEL[feature], period: PERIOD_LABEL[c.period], value: formatFact(feature, value), days: now.length, direction };
  if (c.intent === "compare") facts.usual = formatFact(feature, other);
  else facts.previous = formatFact(feature, other);
  return facts;
}

/** Plain answer from the facts, used when no model can phrase it. */
export function askTemplate(f: AskFacts): string {
  if (f.kind === "why_asked") {
    if (!f.last_checkin) return "There has not been a check-in yet.";
    if (f.last_checkin.reason === "random") return `The check-in on ${f.last_checkin.date} was a random one. Random check-ins help you see later whether the app's questions are useful for you.`;
    if (f.last_checkin.reason === "regular schedule") return `The check-in on ${f.last_checkin.date} was part of your regular schedule.`;
    return `The check-in on ${f.last_checkin.date} came because some signals changed: ${f.last_checkin.changes.join("; ") || "a small change across several signals"}.`;
  }
  if (f.kind === "trend" || f.kind === "compare") {
    if (!f.value) return `There is not enough data on your ${f.signal} for ${f.period} yet.`;
    const ref = f.kind === "compare" ? f.usual : f.previous;
    const refText = f.kind === "compare" ? "your usual" : "the period before";
    return ref ? `Your ${f.signal} for ${f.period} was ${f.value}, against ${ref} for ${refText} (${f.direction}).` : `Your ${f.signal} for ${f.period} was ${f.value}.`;
  }
  return "I can only answer questions about your own signals and check-ins, such as how your rest was last week compared with usual.";
}
