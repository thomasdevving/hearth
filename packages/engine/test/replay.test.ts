import { describe, expect, it } from "vitest";
import { runHeadless, simulatePersona, scoreQuestionnaire, defaultConfig, scriptedQuestionnaire } from "../src/index";

// docs/08 §2.3, with seed 1 and the default config.
describe("replay persona", () => {
  const data = simulatePersona(1, "default");
  const run = runHeadless(data, { seed: 1 });
  const state = (day: number) => run.records[day - 1].state;
  const gymId = run.rules.find((r) => r.feature === "place_visits")?.placeId;

  it("has 150 days, the plan on day 1 and the scripted texts", () => {
    expect(data.raws).toHaveLength(150);
    expect(data.script[0]).toMatchObject({ type: "plan_text", date: data.startDate });
    expect(run.rules.map((r) => r.feature)).toEqual(["rest_midpoint", "place_visits", "home_stay"]);
    expect(gymId).toBeTruthy();
  });
  it("is deterministic", () => {
    expect(simulatePersona(1, "default")).toEqual(data);
    expect(simulatePersona(2, "default").raws[5]).not.toEqual(data.raws[5]);
  });
  it("state is MONITOR from day 15 at the latest", () => {
    expect(state(15)).toBe("MONITOR");
  });
  it("no ELEVATED day during 61–67 once the holiday is confirmed", () => {
    for (let d = 61; d <= 67; d++) expect(state(d)).not.toBe("ELEVATED");
    expect(run.contexts.find((c) => c.type === "holiday")).toMatchObject({ start: run.records[60].date, end: run.records[66].date });
  });
  it("at least one ELEVATED day in the holiday when it is not confirmed", () => {
    const nc = runHeadless(data, { seed: 1, confirmContexts: false });
    expect(nc.records.slice(60, 67).some((r) => r.state === "ELEVATED")).toBe(true);
  });
  it("the exam week masks nothing", () => {
    expect(run.contexts.find((c) => c.type === "exams")?.kind).toBe("stressor");
    for (let d = 96; d <= 102; d++) expect(run.records[d - 1].maskedDomains).toEqual([]);
  });
  it("first ELEVATED day is between day 108 and day 120, with rest and gym as contributors", () => {
    const first = run.records.findIndex((r) => r.state === "ELEVATED") + 1;
    expect(first).toBeGreaterThanOrEqual(108);
    expect(first).toBeLessThanOrEqual(120);
    const features = run.records[first - 1].contributors.map((c) => c.feature);
    expect(features).toContain("rest_midpoint");
    expect(features).toContain(`place_visits:${gymId}`);
    // PHQ-2 is offered within 7 days after the first ELEVATED day.
    const offered = run.days.find((d) => d.day >= first && d.phq2Offered);
    expect(offered).toBeTruthy();
    expect(offered!.day - first).toBeLessThanOrEqual(7);
  });
  it("no day ever has more than one check-in", () => {
    const perDay = new Map<string, number>();
    for (const c of run.checkins) perDay.set(c.scheduledAt.slice(0, 10), (perDay.get(c.scheduledAt.slice(0, 10)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(1);
    expect(run.days.filter((d) => d.actions.filter((a) => a.type === "schedule_checkin").length > 1)).toHaveLength(0);
  });
  it("the scripted PHQ-2 = 4 and PHQ-9 = 13 lead to CONFIRMED, and a later PHQ-9 back to MONITOR", () => {
    const totals = run.questionnaires.map((q) => `${q.instrument}=${q.result.total}`);
    expect(totals).toContain("PHQ2=4");
    expect(totals).toContain("PHQ9=13");
    expect(run.records.some((r) => r.state === "CONFIRMED")).toBe(true);
    expect(run.records[149].state).not.toBe("CONFIRMED");
  });
});

describe("other scenarios", () => {
  it("slow: the decline over 60 days still becomes ELEVATED", () => {
    const run = runHeadless(simulatePersona(1, "slow"), { seed: 1 });
    expect(run.records.slice(70).some((r) => r.state === "ELEVATED")).toBe(true);
  });
  it("safety: the PHQ-9 has item 9 = 1, which opens the safety flow", () => {
    const data = simulatePersona(1, "safety");
    const answers = scriptedQuestionnaire(data.script, "PHQ9", data.raws[120].date)!;
    expect(answers[8]).toBe(1);
    expect(scoreQuestionnaire("PHQ9", answers, { remissionScore: 3 }, defaultConfig).nextStep).toBe("safety");
    const run = runHeadless(data, { seed: 1 });
    expect(run.questionnaires.some((q) => q.result.safetyItemPositive)).toBe(true);
  });
});
