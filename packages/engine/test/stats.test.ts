import { describe, expect, it } from "vitest";
import { clamp, gaussian, haversine, mad, mean, median, mulberry32, nextRandom, quantile, sd, seedRng } from "../src/stats";

describe("stats", () => {
  it("mean", () => {
    expect(mean([])).toBeNull();
    expect(mean([5])).toBe(5);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it("sd (sample)", () => {
    expect(sd([])).toBeNull();
    expect(sd([7])).toBe(0);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(sd([3, 3, 3])).toBe(0);
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([4])).toBe(4);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("MAD", () => {
    expect(mad([])).toBeNull();
    expect(mad([9])).toBe(0);
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });
  it("quantile", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([8], 0.9)).toBe(8);
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([10, 20], 0.75)).toBe(17.5);
    expect(quantile([5, 1, 3], 2)).toBe(5); // q is clamped
  });
  it("clamp", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it("haversine", () => {
    expect(haversine(52, 5, 52, 5)).toBe(0);
    // one degree of latitude is about 111.2 km
    expect(haversine(52, 5, 53, 5)).toBeGreaterThan(111000);
    expect(haversine(52, 5, 53, 5)).toBeLessThan(111400);
    // Amsterdam – Utrecht, about 35 km
    const d = haversine(52.3676, 4.9041, 52.0907, 5.1214);
    expect(d).toBeGreaterThan(33000);
    expect(d).toBeLessThan(36000);
  });
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 1000 }, () => a());
    const ys = Array.from({ length: 1000 }, () => b());
    const zs = Array.from({ length: 1000 }, () => c());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mean(xs) as number).toBeGreaterThan(0.45);
    expect(mean(xs) as number).toBeLessThan(0.55);
  });
  it("nextRandom threads an explicit state", () => {
    const s0 = seedRng(7);
    const r1 = nextRandom(s0);
    const r2 = nextRandom(r1.state);
    const gen = mulberry32(7);
    expect(gen()).toBe(r1.value);
    expect(gen()).toBe(r2.value);
    expect(nextRandom(s0)).toEqual(r1); // pure
  });
  it("gaussian has about zero mean and unit sd", () => {
    const g = mulberry32(3);
    const xs = Array.from({ length: 5000 }, () => gaussian(g));
    expect(Math.abs(mean(xs) as number)).toBeLessThan(0.05);
    expect(sd(xs) as number).toBeGreaterThan(0.95);
    expect(sd(xs) as number).toBeLessThan(1.05);
  });
});
