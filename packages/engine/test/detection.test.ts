import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "../src/config";
import { buildEligibility, comparisonValues, referenceSet, referenceStats, robustZ } from "../src/baseline";
import { maskedDomains } from "../src/context";
import { controlLimit, updateControl } from "../src/control";
import { contributorPhrase, riskFromZ, scoreFromZ } from "../src/index-score";
import { selfAudit } from "../src/audit";
import { dailyUpdate, initialState } from "../src/state";
import { addDays, dayTypeOf } from "../src/time";
import type { CheckinRecord, ContextLabel, DayRecord, PlanRule, QuestionnaireRecord } from "../src/types";
import { FAR, START, makeDays, runDays } from "./helpers";

const rec = (date: string, values: Record<string, number | null>, over: Partial<DayRecord> = {}): DayRecord => ({
  date,
  features: { date, dayType: dayTypeOf(date), values, restSource: "steps" },
  z: {}, r: {}, domainScores: {}, maskedDomains: [], D: 0.2, D_daily: 0.2, P: null, S: 0.2, C: 0, UCL: 0.5, mu0: 0.2, sigma0: 0.15,
  elevated: false, contributors: [], state: "MONITOR", ...over,
});
const label = (type: string, start: string, end: string): ContextLabel => ({ id: `x-${type}`, type, kind: type === "exams" ? "stressor" : "explains_sensors", start, end, quote: null, source: "manual", confirmed: true });
const elevatedDays = (records: DayRecord[]) => records.filter((r) => r.state === "ELEVATED").map((r) => r.date);

describe("z-score (docs/04 §3.3)", () => {
  it("known vector → median, MAD, z", () => {
    const ref = [1, 2, 3, 4, 100];
    expect(referenceStats(ref, 0)).toEqual({ median: 3, scale: 1.4826 });
    expect(robustZ(6, ref, 0)).toBeCloseTo(3 / 1.4826, 10);
    expect(robustZ(6, ref, 0.5174)).toBeCloseTo(1.5, 10);
  });
  it("is clamped to ±4", () => {
    expect(robustZ(100, [1, 2, 3, 4, 100], 0)).toBe(4);
    expect(robustZ(-100, [1, 2, 3, 4, 100], 0)).toBe(-4);
  });
  it("the floor is applied when the MAD is 0", () => {
    expect(robustZ(6, [5, 5, 5, 5], 0.5)).toBe(2);
    expect(robustZ(6, [5, 5, 5, 5], 0)).toBeNull(); // no spread and no floor: not usable
    expect(robustZ(1, [], 1)).toBeNull();
  });
  it("risk direction and cap (docs/04 §4.1)", () => {
    expect([riskFromZ(2, "+"), riskFromZ(-2, "+"), riskFromZ(-2, "-"), riskFromZ(2, "-")]).toEqual([2, 0, 2, 0]);
    expect([riskFromZ(2.5, "±"), riskFromZ(-2.5, "±"), riskFromZ(0.8, "±")]).toEqual([1.5, 1.5, 0]);
    expect([riskFromZ(4, "+"), riskFromZ(-4, "±")]).toEqual([3, 3]);
  });
});

describe("day type (docs/04 §2)", () => {
  const refOf = (weekend: number, weekday: number) => [
    ...Array.from({ length: weekend }, () => ({ value: 100, dayType: "weekend" as const })),
    ...Array.from({ length: weekday }, () => ({ value: 10, dayType: "weekday" as const })),
  ];
  it("Saturday is compared with weekend days once 6 exist, else pooled", () => {
    expect(comparisonValues(refOf(5, 10), "weekend", cfg)).toHaveLength(15);
    expect(comparisonValues(refOf(6, 10), "weekend", cfg)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(comparisonValues(refOf(6, 10), "weekday", cfg)).toHaveLength(10);
  });
  it("is not usable under minReferenceDays", () => {
    expect(comparisonValues(refOf(6, 7), "weekend", cfg)).toBeNull();
    expect(comparisonValues([], "weekday", cfg)).toBeNull();
  });
});

describe("eligibility (docs/04 §3.1)", () => {
  const dates = Array.from({ length: 30 }, (_, k) => addDays("2026-07-01", k));
  const today = "2026-07-31";
  it("elevated, non-monitor and masked days are excluded", () => {
    const history = dates.map((d, k) =>
      rec(d, { steps: 1000 + k, home_stay: 0.5 }, k === 3 ? { elevated: true } : k === 4 ? { state: "ELEVATED" } : k === 5 ? { state: "CONFIRMED" } : k === 6 ? { maskedDomains: ["mobility"] } : k === 7 ? { state: "WARM_UP" } : {}),
    );
    const days = buildEligibility(history, today, [], [], cfg);
    const steps = referenceSet("steps", days, "steps", cfg).map((v) => v.value);
    expect(steps).toHaveLength(27);
    for (const k of [3, 4, 5]) expect(steps).not.toContain(1000 + k);
    expect(steps).toContain(1006); // only mobility was masked that day
    expect(steps).toContain(1007); // warm-up days are eligible
    expect(steps[0]).toBe(1029); // newest first
    expect(referenceSet("home_stay", days, "steps", cfg)).toHaveLength(26);
  });
  it("a label confirmed later masks past days too, and null values are skipped", () => {
    const history = dates.map((d, k) => rec(d, { home_stay: k === 0 ? null : 0.5, steps: 1 }));
    const days = buildEligibility(history, today, [label("holiday", dates[10], dates[16])], [], cfg);
    expect(referenceSet("home_stay", days, "steps", cfg)).toHaveLength(22);
    expect(referenceSet("steps", days, "steps", cfg)).toHaveLength(30);
  });
  it("days within 14 days of a flagged PHQ-9 are excluded, before and after", () => {
    const q: QuestionnaireRecord = { id: "q1", instrument: "PHQ9", takenAt: `${dates[20]}T10:00:00+00:00`, answers: [], result: { id: "PHQ9", total: 12, band: "moderate", positive: false, flagged: true, changeFromReference: 10, safetyItemPositive: false, nextStep: "show_plan_and_share" } };
    const history = dates.map((d) => rec(d, { steps: 1 }));
    expect(referenceSet("steps", buildEligibility(history, today, [], [q], cfg), "steps", cfg)).toHaveLength(6); // days 0–5
    const unflagged = { ...q, result: { ...q.result, flagged: false } };
    expect(referenceSet("steps", buildEligibility(history, today, [], [unflagged], cfg), "steps", cfg)).toHaveLength(30);
  });
  it("sleep features need the same rest source; the window is the most recent 56 days", () => {
    const long = Array.from({ length: 80 }, (_, k) => addDays("2026-04-01", k)).map((d, k) => {
      const r = rec(d, { rest_midpoint: k, steps: k });
      if (k % 2 === 0) r.features.restSource = "healthkit";
      return r;
    });
    const days = buildEligibility(long, "2026-07-31", [], [], cfg);
    expect(referenceSet("rest_midpoint", days, "steps", cfg)).toHaveLength(40);
    const steps = referenceSet("steps", days, "steps", cfg);
    expect(steps).toHaveLength(56);
    expect(Math.min(...steps.map((s) => s.value))).toBe(24);
  });
});

describe("index (docs/04 §4)", () => {
  it("domain averaging: four deviating mobility features give the same G as one", () => {
    const one = scoreFromZ({ location_entropy: -2, steps: 0 }, [], cfg);
    const four = scoreFromZ({ location_entropy: -2, places_visited: -2, location_variance: -2, routine_regularity: -2, steps: 0 }, [], cfg);
    expect(one.domainScores.mobility).toBe(2);
    expect(four.domainScores.mobility).toBe(2);
    expect(four.D).toBe(one.D);
    expect(one.D).toBe(1); // mean of mobility 2 and activity 0
  });
  it("body: lower HRV and higher resting heart rate count, the opposite does not", () => {
    const s = scoreFromZ({ hrv: -2, resting_hr: 1, steps: 0 }, [], cfg);
    expect(s.r.hrv).toBe(2);
    expect(s.r.resting_hr).toBe(1);
    expect(s.domainScores.body).toBe(1.5);
    const calm = scoreFromZ({ hrv: 2, resting_hr: -1, steps: 0 }, [], cfg);
    expect(calm.domainScores.body).toBe(0);
  });
  it("an illness label masks the body group too", () => {
    expect(maskedDomains("2026-07-05", [label("ill", "2026-07-01", "2026-07-07")], cfg)).toContain("body");
    expect(maskedDomains("2026-07-05", [label("holiday", "2026-07-01", "2026-07-07")], cfg)).not.toContain("body");
  });
  it("personal rules weigh double and can override the direction", () => {
    const rules: PlanRule[] = [{ id: "r1", feature: "rest_midpoint", direction: "later", placeId: null, quote: "", active: true }];
    const plain = scoreFromZ({ rest_midpoint: 1.5, rest_duration: 0, steps: 0 }, [], cfg);
    expect(plain.r.rest_midpoint).toBe(0.5); // ± : |z| − 1
    expect(plain.P).toBeNull();
    const personal = scoreFromZ({ rest_midpoint: 1.5, rest_duration: 0, steps: 0 }, rules, cfg);
    expect(personal.r.rest_midpoint).toBe(1.5); // "later" → +
    expect(personal.domainScores.sleep).toBe((2 * 1.5 + 0) / 3);
    expect(personal.P).toBe(1.5);
    expect(scoreFromZ({ rest_midpoint: -2, steps: 0 }, rules, cfg).r.rest_midpoint).toBe(0); // earlier is not the user's sign
  });
  it("fewer than minDomains present → insufficient; D_daily leaves out rolling features", () => {
    const s = scoreFromZ({ steps: -1, active_hours: null, rhythm_stability: -3 }, [], cfg);
    expect(s.D).toBe(2); // activity 1, rhythm 3
    expect(s.D_daily).toBeNull(); // only activity is left
    expect(scoreFromZ({ steps: -1 }, [], cfg).D).toBeNull();
    expect(scoreFromZ({}, [], cfg).D).toBeNull();
  });
});

describe("control statistics (docs/04 §5)", () => {
  it("EWMA, CUSUM and the limit", () => {
    expect(controlLimit(0.2, 0.2, cfg)).toBeCloseTo(0.2 + 2.5 * 0.2 * Math.sqrt(0.3 / 1.7), 12);
    const a = updateControl({ S: 0.2, C: 0, elevated: false }, 0.6, 0.2, 0.2, cfg);
    expect(a.S).toBeCloseTo(0.32, 12);
    expect(a.C).toBeCloseTo(1.5, 12);
    expect(a.elevated).toBe(false);
    let st = a;
    for (let i = 0; i < 3; i++) st = updateControl(st, 0.6, 0.2, 0.2, cfg);
    expect(st.C).toBeCloseTo(6, 12);
    expect(st.elevated).toBe(true);
    expect(updateControl(st, 0, 0.2, 0.2, cfg).C).toBeCloseTo(4.5, 12); // falls by 1 + k
  });
  it("an insufficient day freezes S, C and elevated", () => {
    const prev = { S: 0.7, C: 5, elevated: true };
    expect(updateControl(prev, null, 0.2, 0.2, cfg)).toEqual(prev);
  });
  it("zero spread: sigma is floored, no division by zero", () => {
    const st = updateControl({ S: 0.2, C: 0, elevated: false }, 0.2, 0.2, 0, cfg);
    expect(st.S).toBeCloseTo(0.2, 12);
    expect(st.C).toBe(0);
    expect(st.elevated).toBe(false);
  });
});

describe("dailyUpdate (docs/04 §7–8)", () => {
  const stable = makeDays(START, 100, 11);

  it("leaves WARM_UP when the reference exists and then monitors quietly", () => {
    const run = runDays(stable);
    expect(run.records.slice(0, 14).every((r) => r.state === "WARM_UP" && r.D === null && r.UCL === null)).toBe(true);
    expect(run.records[14].state).toBe("MONITOR");
    expect(run.records[14].mu0).not.toBeNull();
    expect(run.state.anchor?.date).toBe(run.records[14].date);
    expect(run.records.every((r) => r.state !== "CONFIRMED")).toBe(true);
  });

  it("zero spread: a constant history does not divide by zero and does not alarm", () => {
    const flat = makeDays(START, 100, 1, () => ({}), 0);
    const run = runDays(flat);
    expect(run.records.slice(30).every((r) => Math.abs(r.D as number) < 1e-9 && r.state === "MONITOR" && !r.elevated)).toBe(true);
    // Once the first weeks (weekend days compared with a pooled reference) have left the
    // window, the index history is constant and sigma sits on its floor.
    const late = run.records.slice(86);
    expect(late.every((r) => r.sigma0 === cfg.sigmaFloor && Math.abs(r.S) < 1e-6 && r.C === 0)).toBe(true);
    expect(late.every((r) => Number.isFinite(r.S) && Number.isFinite(r.C) && Number.isFinite(r.UCL as number))).toBe(true);
    expect(JSON.stringify(run.records)).not.toContain("NaN");
  });

  it("slow decline: 1% per day for 60 days still becomes ELEVATED", () => {
    const raws = makeDays(START, 130, 5, (day) => {
      const k = Math.max(0, day - 70); // decline from day 71
      return { steps: 8000 * (1 - 0.01 * k), speed: 1.3 * (1 - 0.002 * k), restEnd: 420 + 2 * k, nextRestStart: 1380 + 2 * k };
    });
    const run = runDays(raws);
    expect(elevatedDays(run.records.slice(0, 70))).toEqual([]);
    const first = run.records.findIndex((r) => r.state === "ELEVATED");
    expect(first).toBeGreaterThanOrEqual(70);
    // The reference did not follow the decline: once elevated it stays frozen.
    const atAlarm = run.records[first];
    const last = run.records[run.records.length - 1];
    expect(last.state).toBe("ELEVATED");
    expect(last.mu0).toBe(atAlarm.mu0);
    expect(last.sigma0).toBe(atAlarm.sigma0);
    expect(last.D as number).toBeGreaterThan((atAlarm.mu0 as number) + 2 * (atAlarm.sigma0 as number));
  });

  const holidayRaws = makeDays(START, 80, 21, (day) => (day >= 61 && day <= 67 ? { place: FAR, away: [], steps: 9000 } : {}));
  const holiday = label("holiday", addDays(START, 60), addDays(START, 66));

  it("holiday: a confirmed week with a large mobility change produces no ELEVATED day", () => {
    const without = runDays(holidayRaws);
    const withLabel = runDays(holidayRaws, { contexts: [holiday] });
    expect(elevatedDays(without.records.slice(60, 67)).length).toBeGreaterThan(0);
    expect(elevatedDays(withLabel.records)).toEqual([]);
    for (const r of withLabel.records.slice(60, 67)) {
      expect(r.maskedDomains).toEqual(["mobility", "phone"]);
      expect(r.domainScores.mobility).toBeUndefined();
      expect(r.z.routine_regularity).toBeNull();
    }
    expect(withLabel.records[59].maskedDomains).toEqual([]);
    expect(withLabel.records[67].maskedDomains).toEqual([]);
    // the day after the label ends, the app is told once
    expect(withLabel.actions[67]).toContainEqual({ type: "context_expired", contextId: "x-holiday" });
    expect(withLabel.actions.flat().filter((a) => a.type === "context_expired")).toHaveLength(1);
  });

  it("stressor: a confirmed exams week masks nothing", () => {
    const exams = label("exams", addDays(START, 60), addDays(START, 66));
    expect(maskedDomains(addDays(START, 62), [exams], cfg)).toEqual([]);
    const run = runDays(holidayRaws, { contexts: [exams] });
    const plain = runDays(holidayRaws);
    expect(run.records.every((r) => r.maskedDomains.length === 0)).toBe(true);
    expect(run.records.map((r) => r.D)).toEqual(plain.records.map((r) => r.D));
  });

  it("a label that explains sensors is capped at contextMaxDays; an unconfirmed label does nothing", () => {
    const long = label("holiday", "2026-07-01", "2026-08-30");
    expect(maskedDomains("2026-07-14", [long], cfg)).toEqual(["mobility", "phone"]);
    expect(maskedDomains("2026-07-15", [long], cfg)).toEqual([]);
    expect(maskedDomains("2026-07-05", [{ ...long, confirmed: false }], cfg)).toEqual([]);
    expect(maskedDomains("2026-07-05", [label("ill", "2026-07-01", "2026-07-07")], cfg)).toEqual(["activity", "rhythm", "sleep", "body", "mobility"]);
  });

  it("persistence: rolling features alone cannot satisfy §7.3", () => {
    // From day 61 the activity moves to a different part of the day every day. Daily totals,
    // rest and places stay the same, so only the 7-day rhythm features change.
    const base = Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 17 ? 4 : 1));
    const raws = makeDays(START, 100, 8, (day) => {
      if (day < 61) return { hourWeights: base };
      const shift = (day * 5) % 12;
      return { hourWeights: Array.from({ length: 24 }, (_, h) => ((h + shift) % 24 >= 9 && (h + shift) % 24 < 15 ? 5 : 1)) };
    });
    const run = runDays(raws);
    const after = run.records.slice(60);
    expect(after.some((r) => r.state === "ELEVATED")).toBe(true);
    expect(after.some((r) => (r.domainScores.rhythm ?? 0) > 1.5)).toBe(true);
    const offers = run.actions.flat().filter((a) => a.type === "offer_questionnaire");
    expect(offers.filter((a) => a.type === "offer_questionnaire" && a.reason === "persistent")).toEqual([]);
  });

  it("a persistent change in one-day features offers PHQ-2 once the state is ELEVATED, with a cooldown", () => {
    const raws = makeDays(START, 100, 12, (day) => (day >= 71 ? { steps: 3500, speed: 1.1, restEnd: 540, nextRestStart: 1500 } : {}));
    const run = runDays(raws);
    const first = run.records.findIndex((r) => r.state === "ELEVATED");
    expect(first).toBeGreaterThanOrEqual(70);
    const offerDay = run.actions.findIndex((as) => as.some((a) => a.type === "offer_questionnaire" && a.id === "PHQ2" && a.reason === "persistent"));
    expect(offerDay).toBeGreaterThanOrEqual(first);
    expect(offerDay - first).toBeLessThanOrEqual(7);
    expect(run.actions[first]).toContainEqual({ type: "show_plan" });
    expect(run.actions[first].find((a) => a.type === "schedule_checkin")).toMatchObject({ kind: "triggered" });
    expect(run.records[first].contributors.length).toBeGreaterThan(0);
    // After a PHQ-2 has been taken, it is not offered again for phq2CooldownDays.
    const taken: QuestionnaireRecord = { id: "q", instrument: "PHQ2", takenAt: `${raws[offerDay].date}T10:00:00+00:00`, answers: [1, 1], result: { id: "PHQ2", total: 2, band: null, positive: false, flagged: false, changeFromReference: null, safetyItemPositive: false, nextStep: "none" } };
    const again = runDays(raws.slice(0, offerDay + 9), { questionnaires: [taken] });
    const offers = again.actions.map((as, i) => (as.some((a) => a.type === "offer_questionnaire") ? i : -1)).filter((i) => i > offerDay);
    expect(offers[0]).toBe(offerDay + 7);
  });

  it("a flagged PHQ-9 gives CONFIRMED; a later unflagged one returns to MONITOR", () => {
    const q = (date: string, total: number, flagged: boolean): QuestionnaireRecord => ({ id: date, instrument: "PHQ9", takenAt: `${date}T10:00:00+00:00`, answers: [], result: { id: "PHQ9", total, band: null, positive: false, flagged, changeFromReference: null, safetyItemPositive: false, nextStep: "none" } });
    const flagged = q(addDays(START, 39), 13, true);
    const run = runDays(stable.slice(0, 60), { questionnaires: [flagged] });
    expect(run.records[38].state).toBe("MONITOR");
    expect(run.records.slice(39).every((r) => r.state === "CONFIRMED")).toBe(true);
    expect(run.actions[45]).toContainEqual({ type: "show_plan" });
    expect(run.actions[45].some((a) => a.type === "offer_questionnaire")).toBe(false);
    expect(run.actions[53]).toContainEqual({ type: "offer_questionnaire", id: "PHQ9", reason: "interval" });
    expect(run.actions.flat().some((a) => a.type === "schedule_checkin" && a.kind === "triggered")).toBe(false);
    const better = runDays(stable.slice(0, 60), { questionnaires: [flagged, q(addDays(START, 53), 3, false)] });
    expect(better.records[52].state).toBe("CONFIRMED");
    expect(better.records[53].state).toBe("MONITOR");
  });

  it("momentary signals offer PHQ-2", () => {
    const run = runDays(stable.slice(0, 60), { answer: (date) => (date >= addDays(START, 30) ? { mood_low: 6, enjoyment: 2, energy: 2 } : { mood_low: 2, enjoyment: 5, energy: 5 }) });
    const offers = run.actions.flat().filter((a) => a.type === "offer_questionnaire");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((a) => a.type === "offer_questionnaire" && a.id === "PHQ2" && a.reason === "momentary")).toBe(true);
    expect(run.actions.slice(0, 30).flat().some((a) => a.type === "offer_questionnaire")).toBe(false);
  });

  it("limits: never more than 1 check-in per day or 4 per week, also while ELEVATED", () => {
    const raws = makeDays(START, 120, 12, (day) => (day >= 71 ? { steps: 3500, speed: 1.1, restEnd: 540, nextRestStart: 1500 } : {}));
    for (const seed of [1, 2, 3]) {
      const run = runDays(raws, { seed });
      const days = run.checkins.map((c) => c.scheduledAt.slice(0, 10));
      expect(new Set(days).size).toBe(days.length);
      for (const d of raws.map((r) => r.date)) {
        const inWeek = days.filter((x) => x <= d && x > addDays(d, -7)).length;
        expect(inWeek).toBeLessThanOrEqual(cfg.maxCheckinsPerWeek);
      }
      expect(run.checkins.some((c) => c.kind === "triggered")).toBe(true);
      expect(run.checkins.some((c) => c.kind === "random")).toBe(true);
      expect(run.actions.every((as) => as.filter((a) => a.type === "schedule_checkin").length <= 1)).toBe(true);
    }
  });

  it("random check-ins come about one day in three, and half as often after two ignored ones", () => {
    const answered = runDays(makeDays(START, 100, 11), { cfg: { ...cfg, maxCheckinsPerWeek: 7 } });
    const ignored = runDays(makeDays(START, 100, 11), { cfg: { ...cfg, maxCheckinsPerWeek: 7 }, answer: () => null });
    expect(answered.checkins.length).toBeGreaterThan(22);
    expect(answered.checkins.length).toBeLessThan(45);
    expect(ignored.checkins.length).toBeLessThan(answered.checkins.length * 0.75);
    expect(ignored.state.ignoredStreak).toBeGreaterThanOrEqual(2);
    expect(answered.state.ignoredStreak).toBe(0);
  });

  it("idempotence: re-running a processed day returns the same record and no actions", () => {
    const run = runDays(stable.slice(0, 40));
    const again = dailyUpdate({ date: stable[30].date, raws: stable.slice(0, 40), history: run.records, state: run.state, rules: [], contexts: [], checkins: run.checkins, questionnaires: [], cfg });
    expect(again.record).toBe(run.records[30]);
    expect(again.state).toBe(run.state);
    expect(again.actions).toEqual([]);
  });

  it("determinism: same seed and inputs → identical outputs; the input is not mutated", () => {
    const a = runDays(stable.slice(0, 50), { seed: 7 });
    const b = runDays(stable.slice(0, 50), { seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = runDays(stable.slice(0, 50), { seed: 8 });
    expect(JSON.stringify(a.checkins)).not.toBe(JSON.stringify(c.checkins));
    expect(a.records.map((r) => r.D)).toEqual(c.records.map((r) => r.D)); // the seed only drives prompts
    const state = initialState(3);
    const frozen = JSON.stringify(state);
    dailyUpdate({ date: stable[0].date, raws: stable.slice(0, 1), history: [], state, rules: [], contexts: [], checkins: [], questionnaires: [], cfg });
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("an insufficient day has no index and keeps the control statistics", () => {
    const raws = makeDays(START, 40, 11).map((r, i) => (i === 35 ? { ...r, stepBins15: null, walkingSpeed: null, visits: null } : r));
    const run = runDays(raws);
    expect(run.records[35].D).toBeNull();
    expect(run.records[35].S).toBe(run.records[34].S);
    expect(run.records[35].C).toBe(run.records[34].C);
    expect(run.records[35].elevated).toBe(run.records[34].elevated);
  });
});

describe("self-audit (docs/04 §9)", () => {
  const mk = (kind: "triggered" | "random", moods: number[], offset = 0): CheckinRecord[] =>
    moods.map((m, i) => ({ id: `${kind}${i}`, scheduledAt: `${addDays("2026-07-01", offset + i)}T09:00:00+00:00`, answeredAt: `${addDays("2026-07-01", offset + i)}T09:05:00+00:00`, kind, reasons: [], answers: { mood_low: m }, personalAnswers: {}, hasFreeText: false }));
  it("collecting: fewer than 8 in either group", () => {
    expect(selfAudit([], cfg).status).toBe("collecting");
    const r = selfAudit([...mk("triggered", [5, 5, 5, 5, 5, 5, 5]), ...mk("random", new Array(20).fill(2), 10)], cfg);
    expect(r).toMatchObject({ status: "collecting", nTriggered: 7, nRandom: 20, delta: null, p: null });
  });
  it("informative: mood is clearly lower at triggered check-ins", () => {
    const r = selfAudit([...mk("triggered", [5, 4, 5, 6, 4, 5, 5, 4]), ...mk("random", [2, 3, 2, 1, 2, 3, 2, 2], 10)], cfg);
    expect(r.status).toBe("informative");
    expect(r.delta).toBeCloseTo(2.625, 10);
    expect(r.p as number).toBeLessThan(0.01);
  });
  it("not_informative: both groups have 12 and there is no difference", () => {
    const moods = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3];
    expect(selfAudit([...mk("triggered", moods), ...mk("random", moods, 20)], cfg).status).toBe("not_informative");
  });
  it("unclear: enough to test, not enough to say no", () => {
    const moods = [2, 3, 2, 3, 2, 3, 2, 3, 2];
    const r = selfAudit([...mk("triggered", moods), ...mk("random", moods, 20)], cfg);
    expect(r.status).toBe("unclear");
    expect(r.delta).toBe(0);
  });
  it("ignores unanswered, fixed and out-of-window check-ins, and is seeded", () => {
    const old = mk("triggered", new Array(10).fill(7), -200);
    const recent = [...mk("triggered", [2, 3, 2, 3, 2, 3, 2, 3, 2]), ...mk("random", [2, 3, 2, 3, 2, 3, 2, 3, 2], 20)];
    const ignored = mk("triggered", [7, 7, 7], 40).map((c) => ({ ...c, answeredAt: null }));
    const fixed = mk("random", [7, 7, 7], 50).map((c) => ({ ...c, kind: "fixed" as const }));
    const r = selfAudit([...old, ...recent, ...ignored, ...fixed], cfg);
    expect(r).toMatchObject({ nTriggered: 9, nRandom: 9, status: "unclear" });
    expect(selfAudit(recent, cfg)).toEqual(selfAudit(recent, cfg));
  });
});

describe("contributor wording (docs/03 §4)", () => {
  it("says sleep only when a watch measured it", () => {
    expect(contributorPhrase("rest_midpoint", 2, { restSource: "steps" })).toBe("later rest time");
    expect(contributorPhrase("rest_midpoint", 2, { restSource: "healthkit" })).toBe("later sleep time");
    expect(contributorPhrase("rest_regularity", 2, { restSource: "healthkit" })).toBe("less regular sleep times");
    expect(contributorPhrase("resting_hr", 2, { restSource: "healthkit" })).toBe("a higher resting heart rate than usual");
  });
});
