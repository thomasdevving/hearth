// Generates the golden fixtures from the passing engine: npm run fixtures -w packages/engine
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig as cfg } from "../src/config";
import type { CheckinRecord, ContextLabel, PlanRule } from "../src/types";
import { addDays } from "../src/time";
import { FIXTURE_FNS } from "../test/fixture-fns";
import { FAR, GYM, START, makeDays, runDays } from "../test/helpers";
import { SAM_PLAN_EXPECTED, SAM_PLAN_TEXT, runHeadless, simulatePersona } from "../src/simulate/index";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
mkdirSync(dir, { recursive: true });
let count = 0;
function emit(name: string, fn: string, input: unknown[]) {
  const args = JSON.parse(JSON.stringify(input));
  const expectedOutput = JSON.parse(JSON.stringify(FIXTURE_FNS[fn](...args) ?? null));
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ fn, input, expectedOutput }) + "\n");
  count++;
}

const xs = [3, 1, 4, 1, 5, 9, 2, 6];
emit("stats_mean", "mean", [xs]);
emit("stats_sd", "sd", [xs]);
emit("stats_median", "median", [xs]);
emit("stats_mad", "mad", [xs]);
emit("stats_quantile", "quantile", [xs, 0.9]);
emit("stats_mean_empty", "mean", [[]]);
emit("stats_haversine", "haversine", [52.0907, 5.1214, 52.3676, 4.9041]);
emit("robust_z", "robustZ", [6, [1, 2, 3, 4, 100], 0.5]);
emit("robust_z_floor", "robustZ", [6, [5, 5, 5, 5], 0.5]);
emit("score_from_z", "scoreFromZ", [
  { steps: -1.2, active_hours: 0.3, rhythm_stability: -2.5, rest_midpoint: 1.6, rest_duration: null, home_stay: 2, location_entropy: -0.4 },
  [{ id: "r1", feature: "rest_midpoint", direction: "later", placeId: null, quote: "going to bed later", active: true }],
  cfg,
]);
const holiday: ContextLabel = { id: "x1", type: "holiday", kind: "explains_sensors", start: addDays(START, 60), end: addDays(START, 66), quote: null, source: "manual", confirmed: true };
emit("masked_domains", "maskedDomains", [addDays(START, 62), [holiday], cfg]);

// A person with a gym habit, a holiday in week 9 and a lasting change from day 71.
const raws = makeDays(START, 90, 12, (day, date) => {
  if (day >= 61 && day <= 67) return { place: FAR, away: [], steps: 9000 };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const gym = weekday === 1 || weekday === 3 || weekday === 5;
  const base = { away: weekday >= 1 && weekday <= 5 ? [{ lat: 52.08, lon: 5.17, from: 540, to: 1020 }, ...(gym && day < 71 ? [{ ...GYM, from: 1050, to: 1120 }] : [])] : [] };
  return day >= 71 ? { ...base, steps: 3500, speed: 1.1, restEnd: 540, nextRestStart: 1500 } : base;
});
emit("compute_features_day10", "computeFeatures", [raws.slice(0, 10), raws[9].date, cfg]);
emit("compute_features_day40", "computeFeatures", [raws.slice(0, 40), raws[39].date, cfg]);
emit("compute_features_day1", "computeFeatures", [raws.slice(0, 1), raws[0].date, cfg]);

const warm = runDays(raws.slice(0, 8));
const gymPlace = warm.state.places.find((p) => Math.abs(p.lat - GYM.lat) < 0.001 && Math.abs(p.lon - GYM.lon) < 0.001);
if (!gymPlace) throw new Error("gym place not learned");
const rules: PlanRule[] = [
  { id: "r1", feature: "rest_midpoint", direction: "later", placeId: null, quote: "going to bed later", active: true },
  { id: "r2", feature: "place_visits", direction: "lower", placeId: gymPlace.id, quote: "I skip the gym", active: true },
  { id: "r3", feature: "home_stay", direction: "higher", placeId: null, quote: "I stay inside more", active: true },
];
const run = runDays(raws, { rules, contexts: [holiday], seed: 4 });
function dailyFixture(name: string, i: number) {
  const before = runDays(raws.slice(0, i), { rules, contexts: [holiday], seed: 4 });
  const date = raws[i].date;
  const checkins: CheckinRecord[] = before.checkins.filter((c) => c.scheduledAt.slice(0, 10) > addDays(date, -14));
  emit(name, "dailyUpdate", [{ date, raws: raws.slice(Math.max(0, i - 69), i + 1), history: before.records, state: before.state, rules, contexts: [holiday], checkins, questionnaires: [], cfg }]);
}
dailyFixture("daily_update_warm_up", 5);
dailyFixture("daily_update_first_monitor", 14);
dailyFixture("daily_update_holiday_masked", 62);
const firstElevated = run.records.findIndex((r) => r.state === "ELEVATED");
if (firstElevated < 70) throw new Error(`expected the first ELEVATED day after day 70, got index ${firstElevated}`);
dailyFixture("daily_update_first_elevated", firstElevated);
dailyFixture("daily_update_elevated_phq2", run.actions.findIndex((as) => as.some((a) => a.type === "offer_questionnaire")));

const audit = (kind: "triggered" | "random", moods: number[], offset: number): CheckinRecord[] =>
  moods.map((m, i) => ({ id: `${kind}${i}`, scheduledAt: `${addDays(START, offset + i)}T09:00:00+00:00`, answeredAt: `${addDays(START, offset + i)}T09:05:00+00:00`, kind, reasons: [], answers: { mood_low: m }, personalAnswers: {}, hasFreeText: false }));
emit("self_audit_informative", "selfAudit", [[...audit("triggered", [5, 4, 5, 6, 4, 5, 5, 4], 0), ...audit("random", [2, 3, 2, 1, 2, 3, 2, 2], 10)], cfg, 20261130]);
emit("self_audit_unclear", "selfAudit", [[...audit("triggered", [3, 3, 2, 4, 3, 2, 3, 3, 4], 0), ...audit("random", [2, 3, 2, 3, 2, 3, 2, 3, 2], 10)], cfg, 20261130]);
emit("self_audit_collecting", "selfAudit", [audit("random", [2, 2, 3], 0), cfg, 20261130]);

// M3: guardrails, routing, questionnaires, aggregates.
emit("route_s3_no_model", "route", [{ dataClass: "S3", cloudConsent: true, onDeviceAvailable: false, online: true, prefersCloud: false, hasLiteVariant: false }]);
emit("route_s1_offline_lite", "route", [{ dataClass: "S1", cloudConsent: true, onDeviceAvailable: true, online: false, prefersCloud: true, hasLiteVariant: true }]);
emit("score_phq9_reliable_change", "scoreQuestionnaire", ["PHQ9", [1, 1, 1, 1, 1, 1, 1, 0, 0], { remissionScore: 2 }, cfg]);
emit("score_phq2_positive", "scoreQuestionnaire", ["PHQ2", [2, 1], { remissionScore: null }, cfg]);
emit("verify_plan_example", "verifyPlan", [SAM_PLAN_EXPECTED, SAM_PLAN_TEXT, cfg]);
emit("verify_context_holiday", "verifyContext", [{ context: "holiday", start_hint: "this week", end_hint: "back on Sunday", confidence: "high", quote: "I'm in Spain this week" }, "I'm in Spain this week, back on Sunday.", "2026-08-17", cfg]);
emit("detect_crisis", "detectCrisis", ["Some days I don’t want to live anymore."]);
emit("language_features", "languageFeatures", ["I always feel that nothing I do is ever enough and my friends say you are fine but they never really listen to me at all"]);
const sam = runHeadless(simulatePersona(1, "default"), { seed: 1, days: 70 });
emit("aggregate_week_holiday", "aggregateWeek", [{ isoWeek: "2026-W34", records: sam.records, checkins: sam.checkins, questionnaires: sam.questionnaires, contexts: sam.contexts, markers: [], note: null }]);

console.log(`wrote ${count} fixtures to ${dir}`);
