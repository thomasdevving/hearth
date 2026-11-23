import { describe, expect, it } from "vitest";
import { defaultConfig, latestEpisode, runHeadless, signalOnset, simulatePersona, usualRangeSeries, whyTimeline, addDays } from "../src/index";
import type { DayRecord, PlanRule, State } from "../src/types";

const rec = (date: string, state: State, r: Record<string, number | null> = {}, extra: Partial<DayRecord> = {}): DayRecord =>
  ({ date, state, r, z: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v])), D: 0, S: 0, UCL: 1, elevated: CHANGED.includes(state), contributors: [], ...extra }) as unknown as DayRecord;
const CHANGED: State[] = ["ELEVATED", "CONFIRMED"];
const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));
const rule = (id: string, feature: string, direction: PlanRule["direction"] = "higher"): PlanRule => ({ id, feature, direction, placeId: null, quote: "q", active: true });

describe("latest changed stretch", () => {
  it("is null without one, ongoing at the end, and finished when the days are usual again", () => {
    const d = days("2026-09-01", 6);
    expect(latestEpisode(d.map((x) => rec(x, "MONITOR")))).toBeNull();
    expect(latestEpisode([rec(d[0], "MONITOR"), rec(d[1], "ELEVATED"), rec(d[2], "CONFIRMED")])).toEqual({ start: d[1], end: null });
    expect(latestEpisode([rec(d[0], "ELEVATED"), rec(d[1], "MONITOR"), rec(d[2], "ELEVATED"), rec(d[3], "ELEVATED"), rec(d[4], "MONITOR")])).toEqual({ start: d[2], end: d[3] });
  });
});

describe("what came first", () => {
  const d = days("2026-09-01", 12);
  // Stretch starts on day 9 (index 8). rest_midpoint moves on days 3–6, home_stay on day 7 only
  // (not sustained), then 8–9; steps moves from day 5; resting_hr never.
  const records = d.map((date, i) =>
    rec(date, i >= 8 ? "ELEVATED" : "MONITOR", {
      rest_midpoint: i >= 2 ? 1.6 : 0.2,
      home_stay: i === 6 || i >= 9 ? 1.4 : 0,
      steps: i >= 4 ? 1.2 : 0,
      resting_hr: 0.3,
    }),
  );
  const rules = [rule("r1", "rest_midpoint", "later"), rule("r2", "home_stay"), rule("r3", "resting_hr")];
  const res = signalOnset(records, rules, defaultConfig)!;

  it("orders the signals by the first sustained move and counts days before the stretch", () => {
    expect(res.episode).toEqual({ start: d[8], end: null });
    expect(res.moved.map((m) => [m.feature, m.daysBefore, m.ruleId])).toEqual([
      ["rest_midpoint", 6, "r1"],
      ["steps", 4, null],
      ["home_stay", -1, "r2"],
    ]);
    expect(res.moved[0].direction).toBe("later");
  });
  it("lists the plan's signs that did not move", () => {
    expect(res.unchanged.map((u) => u.feature)).toEqual(["resting_hr"]);
  });
  it("looks back no further than the config says", () => {
    const short = signalOnset(records, rules, { ...defaultConfig, onsetLookbackDays: 2 })!;
    expect(short.moved.find((m) => m.feature === "rest_midpoint")?.firstDate).toBe(d[6]);
  });
});

describe("explanations on Sam's run (seed 1)", () => {
  const data = simulatePersona(1, "default");
  const run = runHeadless(data, { seed: 1 });
  const firstIdx = run.records.findIndex((r) => r.state === "ELEVATED");
  const upTo = run.records.slice(0, firstIdx + 3);

  it("finds Sam's own signs among the first to move, before Hearth noticed", () => {
    const res = signalOnset(upTo, run.rules, defaultConfig)!;
    expect(res.episode.start).toBe(run.records[firstIdx].date);
    const own = res.moved.filter((m) => m.ruleId);
    expect(own.length).toBeGreaterThan(0);
    expect(own.some((m) => (m.daysBefore ?? 0) > 0)).toBe(true);
  });

  it("gives a usual range that matches the engine's own z-scores", () => {
    const series = usualRangeSeries(upTo, "rest_midpoint", upTo[upTo.length - 30].date, run.contexts, run.questionnaires, defaultConfig);
    const usable = series.filter((p) => p.z !== null && p.median !== null && p.value !== null && Math.abs(p.z) < 4);
    expect(usable.length).toBeGreaterThan(20);
    for (const p of usable) {
      const z = (p.value! - p.median!) / (p.high! - p.median!);
      expect(z).toBeCloseTo(p.z!, 6);
    }
  });

  it("names the trend crossing and, if any, a single day that did not count", () => {
    const w = whyTimeline(upTo, defaultConfig);
    expect(w.episode?.start).toBe(run.records[firstIdx].date);
    expect(w.risingDays).toBeGreaterThan(0);
    if (w.singleDay) {
      const r = upTo.find((x) => x.date === w.singleDay!.date)!;
      expect(r.D!).toBeGreaterThan(r.UCL!);
      expect(r.S).toBeLessThanOrEqual(r.UCL!);
    }
  });
});
