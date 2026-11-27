import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "../src/config";
import { mulberry32 } from "../src/stats";
import { addDays, daysBetween } from "../src/time";
import type { CheckinRecord, ContextLabel } from "../src/types";
import { binomialUpperTail, responseSignal } from "../src/response";
import { makeDays, runDays, START } from "./helpers";

// Unanswered check-ins as a signal (docs/04 §7.5).

const D = "2026-09-01";

function checkin(i: number, date: string, answered: boolean): CheckinRecord {
  return {
    id: `c${i}`,
    scheduledAt: `${date}T18:00:00+00:00`,
    answeredAt: answered ? `${date}T18:05:00+00:00` : null,
    kind: "random",
    reasons: [],
    answers: answered ? { mood_low: 2, enjoyment: 5, energy: 5 } : {},
    personalAnswers: {},
    hasFreeText: false,
  };
}

/** One check-in every `every` days going back from `date`; `missed(daysAgo)` says which were left. */
function history(date: string, days: number, every: number, missed: (daysAgo: number) => boolean): CheckinRecord[] {
  const out: CheckinRecord[] = [];
  for (let ago = 1; ago <= days; ago += every) out.push(checkin(ago, addDays(date, -ago), !missed(ago)));
  return out;
}

describe("binomialUpperTail", () => {
  it("matches hand-computed values", () => {
    expect(binomialUpperTail(0, 5, 0.3)).toBe(1);
    expect(binomialUpperTail(6, 5, 0.3)).toBe(0);
    expect(binomialUpperTail(3, 3, 0.2)).toBeCloseTo(0.008, 6);
    expect(binomialUpperTail(3, 4, 0.2)).toBeCloseTo(4 * 0.008 * 0.8 + 0.0016, 6);
    expect(binomialUpperTail(1, 10, 0.5)).toBeCloseTo(1 - 0.5 ** 10, 9);
  });
});

describe("responseSignal", () => {
  it("collects until there are enough usual and recent check-ins", () => {
    const s = responseSignal(history(D, 20, 3, () => false), [], D, cfg);
    expect(s.status).toBe("collecting");
    expect(s.p).toBeNull();
  });

  it("stays usual for someone who always leaves a few", () => {
    // Every third check-in missed, before and lately.
    const s = responseSignal(history(D, 84, 2, (ago) => ago % 6 === 1), [], D, cfg);
    expect(s.nUsual).toBeGreaterThanOrEqual(cfg.responseMinUsual);
    expect(s.status).toBe("usual");
  });

  it("flags a clear rise in unanswered check-ins", () => {
    const s = responseSignal(history(D, 84, 3, (ago) => ago <= 14), [], D, cfg);
    expect(s.missedRecent).toBe(s.nRecent);
    expect(s.missedUsual).toBe(0);
    expect(s.status).toBe("fewer_answers");
    expect(s.p).toBeLessThan(cfg.responseAlpha);
  });

  it("needs at least responseMinMissed misses, however rare they usually are", () => {
    const s = responseSignal(history(D, 84, 3, (ago) => ago <= 4), [], D, cfg);
    expect(s.missedRecent).toBe(2);
    expect(s.status).toBe("usual");
  });

  it("does not flag someone who often leaves them anyway", () => {
    // 4 of the last 5 left, but about half are usually left too.
    const s = responseSignal(history(D, 84, 3, (ago) => ago <= 7 || ago % 2 === 0), [], D, cfg);
    expect(s.missedRecent).toBe(4);
    expect(s.usualMiss).toBeGreaterThan(0.4);
    expect(s.status).toBe("usual");
  });

  it("leaves out days explained by a confirmed holiday", () => {
    const all = history(D, 84, 3, (ago) => ago <= 14);
    const holiday: ContextLabel = { id: "h", type: "holiday", kind: "explains_sensors", start: addDays(D, -14), end: addDays(D, -1), quote: null, source: "manual", confirmed: true };
    const s = responseSignal(all, [holiday], D, cfg);
    expect(s.nRecent).toBe(0);
    expect(s.status).toBe("collecting");
    // A stressor explains nothing: exams are exactly when a change matters.
    const exams: ContextLabel = { ...holiday, type: "exams", kind: "stressor" };
    expect(responseSignal(all, [exams], D, cfg).status).toBe("fewer_answers");
  });

  it("ignores today's check-in, which may still be answered", () => {
    const all = [...history(D, 84, 3, () => false), checkin(999, D, false)];
    const s = responseSignal(all, [], D, cfg);
    expect(s.missedRecent).toBe(0);
  });
});

describe("dailyUpdate with the response signal", () => {
  const raws = makeDays(START, 150, 4);
  const stopFrom = addDays(START, 99); // day 100

  it("is off unless the app passes every check-in", () => {
    const r = runDays(raws, { answer: (d) => (d >= stopFrom ? null : { mood_low: 2, enjoyment: 5, energy: 5 }) });
    expect(r.records.every((x) => x.response === undefined)).toBe(true);
    expect(r.actions.flat().some((a) => a.type === "offer_questionnaire" && a.reason === "unanswered")).toBe(false);
  });

  it("offers PHQ-2 once check-ins go unanswered, at most once per cooldown", () => {
    const r = runDays(raws, { responses: true, answer: (d) => (d >= stopFrom ? null : { mood_low: 2, enjoyment: 5, energy: 5 }) });
    expect(r.records.slice(0, 99).every((x) => x.response?.status !== "fewer_answers")).toBe(true);
    const offers = r.records.map((x, i) => ({ date: x.date, a: r.actions[i] })).filter((d) => d.a.some((a) => a.type === "offer_questionnaire" && a.reason === "unanswered"));
    expect(offers.length).toBeGreaterThan(0);
    const first = daysBetween(stopFrom, offers[0].date);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(cfg.responseRecentDays);
    // No questionnaire is taken in this run, so the cooldown counts from nothing: one offer a day
    // is what the app de-duplicates against its open inbox. The signal stays on while silent.
    expect(r.records.slice(-5).every((x) => x.response?.status === "fewer_answers")).toBe(true);
  });

  it("rarely fires for someone who leaves one in six at random, and not for long", () => {
    // A false episode costs one offer of two questions; docs/10 metric 8 has the rates.
    let episodes = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const rand = mulberry32(seed * 31);
      const r = runDays(raws, { seed, responses: true, answer: () => (rand() < 1 / 6 ? null : { mood_low: 2, enjoyment: 5, energy: 5 }) });
      const on = r.records.map((x) => x.response?.status === "fewer_answers");
      episodes += on.filter((x, i) => x && !on[i - 1]).length;
      let run = 0;
      for (const x of on) {
        run = x ? run + 1 : 0;
        expect(run, `seed ${seed}`).toBeLessThanOrEqual(cfg.responseRecentDays);
      }
    }
    expect(episodes).toBeLessThanOrEqual(10); // 10 people × 150 days: well under one each per 100 days
  });
});
