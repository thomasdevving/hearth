import { describe, expect, it } from "vitest";
import { askFacts, askTemplate, periodRange, numberCheck, runHeadless, simulatePersona } from "../src/index";

describe("ask your data (task Q facts)", () => {
  const run = runHeadless(simulatePersona(1, "default"), { seed: 1, days: 120 });
  const today = run.records[119].date;
  it("periods", () => {
    expect(periodRange("this_week", "2026-11-19")).toEqual(["2026-11-16", "2026-11-19"]);
    expect(periodRange("last_week", "2026-11-19")).toEqual(["2026-11-09", "2026-11-15"]);
    expect(periodRange("last_4_weeks", "2026-11-19")).toEqual(["2026-10-23", "2026-11-19"]);
  });
  it("compares rest last week with usual and finds it later during the decline", () => {
    const f = askFacts({ intent: "compare", feature: "rest_midpoint", period: "last_week" }, run.records, run.checkins, today);
    expect(f.value).toMatch(/^\d\d:\d\d$/);
    expect(f.usual).toMatch(/^\d\d:\d\d$/);
    expect(f.direction).toBe("higher");
    const t = askTemplate(f);
    expect(numberCheck(t, f).ok).toBe(true);
  });
  it("why_asked names the last check-in and its reason without numbers from nowhere", () => {
    const f = askFacts({ intent: "why_asked", feature: "none", period: "none" }, run.records, run.checkins, today);
    expect(f.last_checkin).toBeTruthy();
    expect(numberCheck(askTemplate(f), f).ok).toBe(true);
  });
  it("mood trends use check-ins; unsupported gives the fixed reply", () => {
    const f = askFacts({ intent: "trend", feature: "mood_low", period: "last_4_weeks" }, run.records, run.checkins, today);
    expect(f.days).toBeGreaterThan(0);
    expect(askTemplate({ kind: "unsupported" })).toMatch(/only answer questions/);
  });
});
