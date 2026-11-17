import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "../src/config";
import { computeFeatures, indexRaws, placeVisits, learnPlaces, restPeriod } from "../src/features/index";
import type { DayRaw } from "../src/types";
import { addDays } from "../src/time";
import { GYM, HOME, WORK, makeDay, START } from "./helpers";

const emptyDay = (date: string): DayRaw => ({ date, stepBins15: null, walkingSpeed: null, sleep: null, visits: null, phone: null });
const withBins = (date: string, hourly: number[]): DayRaw => ({ ...emptyDay(date), stepBins15: hourly.flatMap((h) => [h / 4, h / 4, h / 4, h / 4]) });
const boxDay = (date: string) => withBins(date, Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 18 ? 100 : 0)));

describe("activity", () => {
  it("steps, active hours and walking speed", () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h === 9 ? 400 : h === 10 ? 100 : h === 11 ? 96 : 0));
    const f = computeFeatures([{ ...withBins("2026-07-01", hourly), walkingSpeed: 1.25 }], "2026-07-01", cfg);
    expect(f.values.steps).toBe(596);
    expect(f.values.active_hours).toBe(2); // 400 and 100 reach the 100-step threshold, 96 does not
    expect(f.values.walking_speed).toBe(1.25);
    expect(f.dayType).toBe("weekday");
  });
  it("coverage rule: under 200 steps the step features are null, nothing is imputed", () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h === 9 ? 196 : 0));
    const f = computeFeatures([{ ...withBins("2026-07-01", hourly), walkingSpeed: 1.2 }], "2026-07-01", cfg);
    expect(f.values.steps).toBeNull();
    expect(f.values.active_hours).toBeNull();
    expect(f.values.walking_speed).toBe(1.2);
  });
  it("a missing day gives nulls everywhere", () => {
    const f = computeFeatures([], "2026-07-01", cfg);
    expect(Object.values(f.values).every((v) => v === null)).toBe(true);
    expect(f.restSource).toBeNull();
  });
});

describe("rest-activity rhythm", () => {
  const week = (fn: (d: string, k: number) => DayRaw) => Array.from({ length: 7 }, (_, k) => fn(addDays("2026-07-01", k), k));
  it("seven identical days: IS = 1, IV and RA as computed by hand", () => {
    const f = computeFeatures(week(boxDay), "2026-07-07", cfg);
    expect(f.values.rhythm_stability).toBeCloseTo(1, 10);
    // 14 jumps of 100 over 167 differences; total sum of squares 7 · 58333.33
    expect(f.values.fragmentation).toBeCloseTo((168 * 140000) / (167 * 408333.3333), 6);
    expect(f.values.relative_amplitude).toBe(1); // M10 = 100, L5 = 0
  });
  it("activity at a different time every day lowers IS", () => {
    const shifted = week((d, k) => withBins(d, Array.from({ length: 24 }, (_, h) => ((h + 3 * k) % 24 >= 8 && (h + 3 * k) % 24 < 18 ? 100 : 0))));
    const f = computeFeatures(shifted, "2026-07-07", cfg);
    expect(f.values.rhythm_stability as number).toBeLessThan(0.5);
    expect(f.values.relative_amplitude as number).toBeLessThan(1);
  });
  it("needs 5 days with steps; missing days are left out", () => {
    const five = week(boxDay).map((d, k) => (k === 1 || k === 4 ? emptyDay(d.date) : d));
    const f5 = computeFeatures(five, "2026-07-07", cfg);
    expect(f5.values.rhythm_stability).toBeCloseTo(1, 10);
    // blocks of 1, 2 and 2 days: 10 jumps over 24·5 − 3 differences
    expect(f5.values.fragmentation).toBeCloseTo((120 * 100000) / (117 * 291666.6667), 6);
    const four = five.map((d, k) => (k === 6 ? emptyDay(d.date) : d));
    const f4 = computeFeatures(four, "2026-07-07", cfg);
    expect(f4.values.rhythm_stability).toBeNull();
    expect(f4.values.fragmentation).toBeNull();
    expect(f4.values.relative_amplitude).toBeNull();
  });
  it("constant activity has a zero denominator and gives null", () => {
    const flat = week((d) => withBins(d, new Array(24).fill(100)));
    const f = computeFeatures(flat, "2026-07-07", cfg);
    expect(f.values.rhythm_stability).toBeNull();
    expect(f.values.fragmentation).toBeNull();
    expect(f.values.relative_amplitude).toBe(0);
  });
});

describe("rest period", () => {
  it("step-based: longest run of empty bins in the night window", () => {
    const raws = [makeDay("2026-07-01", { nextRestStart: 1380 }), makeDay("2026-07-02", { restEnd: 420 })];
    const f = computeFeatures(raws, "2026-07-02", cfg);
    expect(f.restSource).toBe("steps");
    expect(f.values.rest_duration).toBe(8); // 23:00 → 07:00
    expect(f.values.rest_midpoint).toBe(180); // 03:00
  });
  it("the midpoint can be negative", () => {
    const raws = [makeDay("2026-07-01", { nextRestStart: 1260 }), makeDay("2026-07-02", { restEnd: 60 })];
    const rp = restPeriod(indexRaws(raws), "2026-07-02", cfg);
    expect(rp).toEqual({ start: -180, end: 60, source: "steps" });
    expect(computeFeatures(raws, "2026-07-02", cfg).values.rest_midpoint).toBe(-60);
  });
  it("needs the previous day and a run of 3 to 14 hours", () => {
    expect(computeFeatures([makeDay("2026-07-02")], "2026-07-02", cfg).values.rest_duration).toBeNull();
    const short = [makeDay("2026-07-01", { nextRestStart: 1440 }), makeDay("2026-07-02", { restEnd: 150 })];
    expect(computeFeatures(short, "2026-07-02", cfg).values.rest_duration).toBeNull(); // 2.5 h
    const long = [makeDay("2026-07-01", { nextRestStart: 1260 }), makeDay("2026-07-02", { restEnd: 720 })];
    expect(computeFeatures(long, "2026-07-02", cfg).values.rest_duration).toBeNull(); // 15 h
  });
  it("HealthKit sleep: merges gaps under 60 minutes and takes the longest interval in the window", () => {
    const day: DayRaw = {
      ...makeDay("2026-07-02"),
      sleep: [
        { start: "2026-07-01T23:30:00+02:00", end: "2026-07-02T03:00:00+02:00" },
        { start: "2026-07-02T03:40:00+02:00", end: "2026-07-02T07:00:00+02:00" }, // 40-minute gap: merged
        { start: "2026-07-02T08:30:00+02:00", end: "2026-07-02T09:00:00+02:00" }, // 90-minute gap: separate
        { start: "2026-07-02T13:00:00+02:00", end: "2026-07-02T18:00:00+02:00" }, // outside the window
      ],
    };
    const f = computeFeatures([day], "2026-07-02", cfg);
    expect(f.restSource).toBe("healthkit");
    expect(f.values.rest_duration).toBe(7.5);
    expect(f.values.rest_midpoint).toBe(195);
  });
  it("rest regularity needs 5 midpoints of the same source", () => {
    const raws = Array.from({ length: 8 }, (_, k) => makeDay(addDays("2026-07-01", k), { restEnd: k % 2 === 0 ? 420 : 480 }));
    // midpoints of the 7 nights ending 07-02 … 07-08 alternate between 210 and 180
    const f = computeFeatures(raws, "2026-07-08", cfg);
    expect(f.values.rest_regularity).toBeCloseTo(16.0357, 3); // sample sd of four 180s and three 210s
    const few = computeFeatures(raws.slice(4), "2026-07-08", cfg); // only 3 nights available
    expect(few.values.rest_regularity).toBeNull();
    expect(few.values.rest_midpoint).not.toBeNull();
  });
});

describe("mobility", () => {
  const workday = (date: string) => makeDay(date, { away: [{ ...WORK, from: 540, to: 1020 }] });
  it("per-day quantities by hand", () => {
    const raws = Array.from({ length: 4 }, (_, k) => workday(addDays("2026-06-29", k)));
    const f = computeFeatures(raws, "2026-07-02", cfg);
    // home 00:00–08:45 and 17:15–24:00 = 930 min, work 480 min, 30 min unknown
    const T = 1410;
    const pH = 930 / T;
    const pW = 480 / T;
    expect(f.values.home_stay).toBeCloseTo(pH, 10);
    expect(f.values.places_visited).toBe(2);
    expect(f.values.location_entropy).toBeCloseTo(-(pH * Math.log(pH) + pW * Math.log(pW)) / Math.log(2), 10);
    const dist = 3655; // metres between HOME and WORK, about
    const expected = Math.log10(1 + pH * pW * dist * dist);
    expect(f.values.location_variance as number).toBeGreaterThan(expected - 0.05);
    expect(f.values.location_variance as number).toBeLessThan(expected + 0.05);
  });
  it("home is unknown until three nights; one place gives entropy 0", () => {
    const raws = Array.from({ length: 3 }, (_, k) => makeDay(addDays("2026-07-04", k), { away: [] }));
    expect(computeFeatures(raws.slice(0, 2), "2026-07-05", cfg).values.home_stay).toBeNull();
    const f = computeFeatures(raws, "2026-07-06", cfg);
    expect(f.values.home_stay).toBe(1);
    expect(f.values.location_entropy).toBe(0);
    expect(f.values.places_visited).toBe(1);
    expect(f.values.location_variance).toBe(0);
  });
  it("null under 480 known minutes or without visit data", () => {
    const short: DayRaw = { ...makeDay("2026-07-01"), visits: [{ arrive: "2026-07-01T10:00:00+00:00", depart: "2026-07-01T17:00:00+00:00", ...WORK }] };
    const f = computeFeatures([short], "2026-07-01", cfg);
    expect(f.values.places_visited).toBeNull();
    expect(f.values.location_entropy).toBeNull();
    expect(computeFeatures([makeDay("2026-07-01", { noVisits: true })], "2026-07-01", cfg).values.location_variance).toBeNull();
  });
  it("routine regularity: 1 on a usual day, lower when the day is spent elsewhere, null without 7 earlier days", () => {
    const days = Array.from({ length: 12 }, (_, k) => addDays("2026-06-22", k)); // Mon 22 June … Fri 3 July
    const raws = days.map((d) => makeDay(d));
    expect(computeFeatures(raws, "2026-07-01", cfg).values.routine_regularity).toBe(1); // 7 weekdays before it
    expect(computeFeatures(raws, "2026-06-30", cfg).values.routine_regularity).toBeNull(); // only 6
    const odd = [...raws.slice(0, 11), makeDay("2026-07-03", { away: [{ ...GYM, from: 540, to: 1020 }] })];
    // 08:00 and 17:00 are still mostly at home; the 8 hours 09–17 are somewhere unusual
    expect(computeFeatures(odd, "2026-07-03", cfg).values.routine_regularity).toBeCloseTo(16 / 24, 10);
  });
  it("places are learned within the radius and visits to a named place are counted once", () => {
    const d1 = makeDay("2026-07-01", { away: [{ ...WORK, from: 540, to: 1020 }, { lat: GYM.lat + 0.0003, lon: GYM.lon, from: 1050, to: 1110 }] });
    const d2 = makeDay("2026-07-02", { away: [{ ...GYM, from: 1050, to: 1060 }] }); // 10 minutes: too short
    const d3 = makeDay("2026-07-03", { away: [{ ...GYM, from: 1050, to: 1120 }] });
    const rest = [4, 5, 6, 7].map((k) => makeDay(`2026-07-0${k}`, { away: [] }));
    const raws = [d1, d2, d3, ...rest];
    let places = learnPlaces([], d1, cfg);
    expect(places).toHaveLength(3);
    for (const r of raws.slice(1)) places = learnPlaces(places, r, cfg);
    expect(places).toHaveLength(3); // 33 m away is the same place
    const gym = places.find((p) => Math.abs(p.lat - GYM.lat) < 0.001 && Math.abs(p.lon - GYM.lon) < 0.001)!;
    expect(placeVisits(indexRaws(raws), "2026-07-07", places, gym.id, cfg)).toBe(2);
    expect(placeVisits(indexRaws(raws), "2026-07-07", places, "nope", cfg)).toBeNull();
    const f = computeFeatures(raws, "2026-07-07", cfg, { places, homePlaceId: null, rules: [{ id: "r1", feature: "place_visits", direction: "lower", placeId: gym.id, quote: "", active: true }] });
    expect(f.values[`place_visits:${gym.id}`]).toBe(2);
    expect(HOME.lat).toBeGreaterThan(0);
  });
  it("a visit across midnight is one visit", () => {
    const visit = { arrive: "2026-07-01T22:00:00+00:00", depart: "2026-07-02T01:00:00+00:00", ...GYM };
    const raws = [1, 2, 3, 4, 5].map((k) => ({ ...makeDay(`2026-07-0${k}`, { away: [] }), visits: k <= 2 ? [visit] : [] }));
    let places = learnPlaces([], raws[0], cfg);
    places = learnPlaces(places, raws[1], cfg);
    expect(places).toHaveLength(1);
    expect(places[0].minutes).toBe(180);
    expect(placeVisits(indexRaws(raws), "2026-07-05", places, places[0].id, cfg)).toBe(1);
  });
});

describe("phone (P2)", () => {
  it("is null unless the phone domain is enabled", () => {
    const day: DayRaw = { ...makeDay("2026-07-01"), phone: { screen: 120, night: 0, communication: 30 } };
    expect(computeFeatures([day], "2026-07-01", cfg).values.screen_time).toBeNull();
    const on = { ...cfg, phone: { ...cfg.phone, enabled: true } };
    const f = computeFeatures([day], "2026-07-01", on);
    expect([f.values.screen_time, f.values.night_use, f.values.communication_time]).toEqual([120, 0, 30]);
  });
});

void START;
