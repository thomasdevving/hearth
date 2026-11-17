import { describe, expect, it } from "vitest";
import { QUESTIONNAIRES, aggregateWeek, defaultConfig as cfg, languageFeatures, onCheckinCompleted, pickPlace, initialState, remissionScore, scoreQuestionnaire } from "../src/index";
import type { CheckinRecord, DayRecord, QuestionnaireRecord } from "../src/types";

const rec = (instrument: "PHQ2" | "PHQ9", answers: number[], date: string, ref: number | null = null): QuestionnaireRecord => ({
  id: `${instrument}-${date}`,
  instrument,
  takenAt: `${date}T10:00:00+01:00`,
  answers,
  result: scoreQuestionnaire(instrument, answers, { remissionScore: ref }, cfg),
});
const phq9 = (total: number, item9 = 0) => {
  const a = [0, 0, 0, 0, 0, 0, 0, 0, item9];
  let left = total - item9;
  for (let i = 0; i < 8 && left > 0; i++) {
    a[i] = Math.min(3, left);
    left -= a[i];
  }
  return a;
};

describe("PHQ-2", () => {
  it("scores 0–6 and is positive from 3", () => {
    for (const [a, b] of [[0, 0], [1, 1], [1, 2], [3, 3]]) {
      const r = scoreQuestionnaire("PHQ2", [a, b], { remissionScore: null }, cfg);
      expect(r.total).toBe(a + b);
      expect(r.positive).toBe(a + b >= 3);
      expect(r.nextStep).toBe(a + b >= 3 ? "offer_phq9" : "none");
    }
  });
  it("rejects answers that do not fit", () => {
    expect(() => scoreQuestionnaire("PHQ2", [1], { remissionScore: null }, cfg)).toThrow();
    expect(() => scoreQuestionnaire("PHQ2", [1, 4], { remissionScore: null }, cfg)).toThrow();
  });
});

describe("PHQ-9", () => {
  it.each([
    [4, "minimal"],
    [5, "mild"],
    [10, "moderate"],
    [15, "moderately_severe"],
    [20, "severe"],
  ])("total %i → %s", (total, band) => {
    expect(scoreQuestionnaire("PHQ9", phq9(total), { remissionScore: null }, cfg).band).toBe(band);
  });
  it("reliable change rule", () => {
    expect(scoreQuestionnaire("PHQ9", phq9(7), { remissionScore: 2 }, cfg).flagged).toBe(true);
    expect(scoreQuestionnaire("PHQ9", phq9(6), { remissionScore: 2 }, cfg).flagged).toBe(false);
    expect(scoreQuestionnaire("PHQ9", phq9(10), { remissionScore: 9 }, cfg).flagged).toBe(true);
    expect(scoreQuestionnaire("PHQ9", phq9(10), { remissionScore: null }, cfg).flagged).toBe(true);
    const r = scoreQuestionnaire("PHQ9", phq9(7), { remissionScore: 2 }, cfg);
    expect(r.changeFromReference).toBe(5);
    expect(r.nextStep).toBe("show_plan_and_share");
  });
  it("item 9 > 0 sets safetyItemPositive and nextStep safety", () => {
    for (const v of [1, 2, 3]) {
      const r = scoreQuestionnaire("PHQ9", phq9(v, v), { remissionScore: 0 }, cfg);
      expect(r.safetyItemPositive).toBe(true);
      expect(r.nextStep).toBe("safety");
    }
    expect(scoreQuestionnaire("PHQ9", phq9(3), { remissionScore: 0 }, cfg).safetyItemPositive).toBe(false);
  });
  it("reference: median of unflagged totals; flagged totals do not move it", () => {
    const qs = [rec("PHQ9", phq9(3), "2026-06-01"), rec("PHQ9", phq9(5), "2026-07-01", 3), rec("PHQ9", phq9(4), "2026-08-01", 3), rec("PHQ9", phq9(14), "2026-09-01", 4)];
    expect(qs[3].result.flagged).toBe(true);
    expect(remissionScore(qs, "2026-09-10").remissionScore).toBe(4);
    expect(remissionScore(qs.slice(0, 1), "2026-06-02").remissionScore).toBe(3);
    expect(remissionScore([], "2026-06-02").remissionScore).toBeNull();
    // older than 180 days falls out; the onboarding total remains the fallback
    expect(remissionScore(qs.slice(0, 1), "2027-06-02").remissionScore).toBe(3);
  });
  it("the bundled items are the verbatim JSON (R1)", () => {
    expect(QUESTIONNAIRES.PHQ9!.items).toHaveLength(9);
    expect(QUESTIONNAIRES.PHQ9!.items[8].safety_item).toBe(true);
  });
});

describe("language features (docs/03 §7)", () => {
  it("is null under 20 tokens and computes the ratios", () => {
    expect(languageFeatures("too short")).toBeNull();
    const t = "I always feel that nothing I do is ever enough and my friends say you are fine but they never really listen to me at all";
    const f = languageFeatures(t)!;
    expect(f.W).toBe(26);
    expect(f.FPS).toBeCloseTo(4 / 26); // I, I, my, me
    expect(f.OTH).toBeCloseTo(2 / 26); // you, they
    expect(f.ABS).toBeCloseTo(5 / 26); // always, nothing, ever, never, all
    expect(f.SF).toBeCloseTo(4 / 6, 4);
  });
});

const checkin = (id: string, date: string, mood: number, enjoyment = 5): CheckinRecord => ({
  id,
  scheduledAt: `${date}T18:00:00+01:00`,
  answeredAt: `${date}T18:05:00+01:00`,
  kind: "random",
  reasons: [],
  answers: { mood_low: mood, enjoyment, energy: 4, company: "Alone" },
  personalAnswers: {},
  hasFreeText: false,
});

describe("onCheckinCompleted", () => {
  it("flags crisis text, momentary signals and the tasks to run", () => {
    const prev = checkin("c1", "2026-11-17", 6);
    const now = checkin("c2", "2026-11-19", 5);
    const out = onCheckinCompleted({ record: now, freeText: "Some days I want to die, honestly.", recentCheckins: [prev], questionnaires: [], state: "MONITOR", date: "2026-11-19", cfg });
    expect(out.crisis).toBe(true);
    expect(out.momentaryHigh).toBe(true);
    expect(out.offerPhq2).toBe(true);
    expect(out.runTasks).toEqual(["H", "B"]);
  });
  it("respects the PHQ-2 cooldown and CONFIRMED", () => {
    const prev = checkin("c1", "2026-11-17", 6);
    const now = checkin("c2", "2026-11-19", 6);
    const phq2 = rec("PHQ2", [1, 1], "2026-11-15");
    expect(onCheckinCompleted({ record: now, freeText: null, recentCheckins: [prev], questionnaires: [phq2], state: "MONITOR", date: "2026-11-19", cfg }).offerPhq2).toBe(false);
    expect(onCheckinCompleted({ record: now, freeText: null, recentCheckins: [prev], questionnaires: [], state: "CONFIRMED", date: "2026-11-19", cfg }).offerPhq2).toBe(false);
    expect(onCheckinCompleted({ record: now, freeText: "  ", recentCheckins: [], questionnaires: [], state: "MONITOR", date: "2026-11-19", cfg }).runTasks).toEqual([]);
  });
});

describe("aggregateWeek (docs/07 §3)", () => {
  const day = (date: string, D: number | null, elevated = false): DayRecord => ({
    date,
    features: { date, dayType: "weekday", values: { steps: 8000 }, restSource: "steps" },
    z: {},
    r: {},
    domainScores: { activity: 0.333, sleep: 0.5 },
    maskedDomains: [],
    D,
    D_daily: D,
    P: null,
    S: 0,
    C: 0,
    UCL: null,
    mu0: null,
    sigma0: null,
    elevated,
    contributors: elevated ? [{ feature: "place_visits:p_gym", r: 2, phrase: "fewer visits to the gym" }] : [],
    state: elevated ? "ELEVATED" : "MONITOR",
  });
  it("aggregates one ISO week with no place ids, dates or text", () => {
    const records = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-23"].map((d, i) => day(d, i === 4 ? 9 : 0.2 * i, i === 2));
    const agg = aggregateWeek({
      isoWeek: "2026-W47",
      records,
      checkins: [checkin("c1", "2026-11-17", 3), checkin("c2", "2026-11-18", 4)],
      questionnaires: [rec("PHQ2", [1, 1], "2026-11-17")],
      contexts: [{ id: "x", type: "holiday", kind: "explains_sensors", start: "2026-11-10", end: "2026-11-16", quote: "in Spain", source: "model", confirmed: true }],
      markers: [],
      note: null,
    });
    expect(agg.daysWithData).toBe(3);
    expect(agg.indexMean).toBe(0.4); // 0.2, 0.4, 0.6 (the 15th and 23rd are in other weeks)
    expect(agg.daysElevated).toBe(1);
    expect(agg.domainMeans).toEqual({ activity: 0.33, sleep: 0.5 });
    expect(agg.topContributors).toEqual(["place_visits"]);
    expect(agg.ema).toEqual({ n: 2, mood_low: 3.5, enjoyment: 5, energy: 4 });
    expect(agg.phq2).toBe(2);
    expect(agg.phq9).toBeNull();
    expect(agg.contexts).toEqual(["holiday"]);
    expect(JSON.stringify(agg)).not.toMatch(/Spain|p_gym|2026-11-1/);
  });
});

describe("pickPlace", () => {
  it("labels a learned place nearby or adds a new one", () => {
    let s = initialState(1);
    s = { ...s, places: [{ id: "p1", lat: 52.1, lon: 5.1, minutes: 300, label: null }] };
    const a = pickPlace(s, "gym", 52.1005, 5.1005, cfg);
    expect(a.placeId).toBe("p1");
    expect(a.state.places[0].label).toBe("gym");
    const b = pickPlace(s, "Gym!", 52.2, 5.2, cfg);
    expect(b.placeId).toBe("p_gym");
    expect(b.state.places).toHaveLength(2);
    expect(s.places).toHaveLength(1);
  });
});

describe("PHQ-2 cooldown", () => {
  it("also starts after a PHQ-9", async () => {
    const { phq2CooldownOver } = await import("../src/index");
    const q9 = rec("PHQ9", phq9(6), "2026-11-10");
    expect(phq2CooldownOver([q9], "2026-11-14", cfg)).toBe(false);
    expect(phq2CooldownOver([q9], "2026-11-17", cfg)).toBe(true);
  });
});
