import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "../src/config";
import { gaussian, mulberry32 } from "../src/stats";
import { addDays } from "../src/time";
import type { AuditResult, CheckinRecord, Domain, EngineState, WeightSample } from "../src/types";
import { scoreFromZ } from "../src/index-score";
import { activitySensitive, runDays } from "./helpers";
import { boundWeights, collectSamples, fitDomainWeights, solveLinear, stepWeights, updatePersonal, weightOf, weightedIndex } from "../src/weights";

// Personal domain weights (docs/04 §4.4): the arithmetic, the samples and the gates.

const informative: AuditResult = { status: "informative", nTriggered: 10, nRandom: 20, delta: 1.2, p: 0.01 };
const unclear: AuditResult = { status: "unclear", nTriggered: 10, nRandom: 20, delta: 0.2, p: 0.4 };
const D0 = "2026-06-01";

function checkin(id: string, date: string, kind: CheckinRecord["kind"], mood: number | null): CheckinRecord {
  return {
    id,
    scheduledAt: `${date}T18:00:00+00:00`,
    answeredAt: mood === null ? null : `${date}T18:05:00+00:00`,
    kind,
    reasons: [],
    answers: mood === null ? {} : { mood_low: mood, enjoyment: 4, energy: 4 },
    personalAnswers: {},
    hasFreeText: false,
  };
}

/** n samples: mood follows `effect` · domain score plus noise; scores are independent. */
function synthetic(n: number, effect: Partial<Record<Domain, number>>, seed = 3, noise = 0.5): WeightSample[] {
  const rand = mulberry32(seed);
  const doms: Domain[] = ["activity", "rhythm", "sleep", "body", "mobility"];
  return Array.from({ length: n }, (_, i) => {
    const x: Partial<Record<Domain, number>> = {};
    let y = 2;
    for (const d of doms) {
      const v = Math.max(0, 0.6 + 0.6 * gaussian(rand));
      x[d] = v;
      y += (effect[d] ?? 0) * v;
    }
    return { checkinId: `c${i}`, date: addDays(D0, i * 3), y: y + noise * gaussian(rand), x };
  });
}

describe("weighted index (docs/04 §4.3)", () => {
  it("without weights it is the plain mean; with weights a weighted mean", () => {
    const g = { activity: 1, sleep: 3 };
    expect(weightedIndex(g, null, 2)).toBe(2);
    expect(weightedIndex(g, { sleep: 2 }, 2)).toBeCloseTo((1 + 2 * 3) / 3, 12);
    expect(weightOf({ sleep: 2 }, "activity")).toBe(1);
  });
  it("is null under minDomains", () => {
    expect(weightedIndex({ sleep: 1 }, { sleep: 2 }, 2)).toBeNull();
  });
});

describe("linear algebra helpers", () => {
  it("solves a small system and refuses a singular one", () => {
    const x = solveLinear([[2, 1], [1, 3]], [5, 10]) as number[];
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(3, 12);
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
  it("bounds weights to [min, max] with mean 1", () => {
    const w = boundWeights([10, 1, 0.01, 1], 0.5, 2);
    expect(Math.max(...w)).toBeLessThanOrEqual(2 + 1e-12);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.5 - 1e-12);
    expect(w.reduce((a, v) => a + v, 0) / w.length).toBeCloseTo(1, 6);
  });
  it("steps towards the target by at most the step size", () => {
    expect(stepWeights({}, { sleep: 2, activity: 0.5 }, 0.25)).toEqual({ sleep: 1.25, activity: 0.75 });
    expect(stepWeights({ sleep: 1.9 }, { sleep: 2 }, 0.25)).toEqual({ sleep: 2 });
    expect(stepWeights({ sleep: 1.25 }, {}, 0.25)).toEqual({});
  });
});

describe("samples (docs/04 §4.4)", () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ date: addDays(D0, i), domainScores: { sleep: i, activity: 1 } as Partial<Record<Domain, number>> }));

  it("only answered random check-ins, once, with the mean over the last 3 days", () => {
    const today = addDays(D0, 8);
    const cs = [
      checkin("r1", addDays(D0, 6), "random", 5),
      checkin("t1", addDays(D0, 6), "triggered", 6),
      checkin("f1", addDays(D0, 6), "fixed", 6),
      checkin("i1", addDays(D0, 7), "random", null),
    ];
    const s = collectSamples([], cs, days, today, cfg);
    expect(s.map((x) => x.checkinId)).toEqual(["r1"]);
    expect(s[0].y).toBe(5);
    expect(s[0].x.sleep).toBeCloseTo((4 + 5 + 6) / 3, 12);
    expect(collectSamples(s, cs, days, addDays(today, 1), cfg)).toHaveLength(1); // not twice
  });
  it("skips check-ins outside the look-back, in the future, or without domain scores", () => {
    const today = addDays(D0, 9);
    const cs = [checkin("old", D0, "random", 3), checkin("future", addDays(D0, 12), "random", 3), checkin("none", addDays(D0, 20), "random", 3)];
    expect(collectSamples([], cs, days, today, cfg)).toEqual([]);
  });
  it("drops samples older than the window and keeps at most weightMaxSamples", () => {
    const old: WeightSample = { checkinId: "o", date: D0, y: 2, x: { sleep: 1 } };
    expect(collectSamples([old], [], days, addDays(D0, cfg.weightWindowDays), cfg)).toEqual([]);
    const many = Array.from({ length: cfg.weightMaxSamples + 5 }, (_, i) => ({ checkinId: `m${i}`, date: addDays(D0, i), y: 2, x: { sleep: 1 } }));
    const kept = collectSamples(many, [], [], addDays(D0, cfg.weightMaxSamples + 5), cfg);
    expect(kept).toHaveLength(cfg.weightMaxSamples);
    expect(kept[0].checkinId).toBe("m5");
  });
});

describe("fit (docs/04 §4.4)", () => {
  it("learns that sleep goes with low mood for this person", () => {
    const fit = fitDomainWeights(synthetic(40, { sleep: 1.5 }), cfg);
    expect(fit.ok).toBe(true);
    expect(fit.gain as number).toBeGreaterThanOrEqual(cfg.weightMinGain);
    const t = fit.target;
    expect(t.sleep as number).toBeGreaterThan(1.3);
    for (const d of ["activity", "rhythm", "body", "mobility"] as Domain[]) expect(t[d] as number).toBeLessThan(1);
    const ws = Object.values(t) as number[];
    expect(Math.min(...ws)).toBeGreaterThanOrEqual(cfg.weightMin - 1e-9);
    expect(Math.max(...ws)).toBeLessThanOrEqual(cfg.weightMax + 1e-9);
    expect(ws.reduce((a, v) => a + v, 0) / ws.length).toBeCloseTo(1, 3);
  });
  it("finds no pattern when mood is unrelated to the signals", () => {
    const fit = fitDomainWeights(synthetic(40, {}), cfg);
    expect(fit.ok).toBe(false);
    expect(fit.target).toEqual({});
  });
  it("keeps weights near equal when every domain matters the same", () => {
    const fit = fitDomainWeights(synthetic(60, { activity: 0.6, rhythm: 0.6, sleep: 0.6, body: 0.6, mobility: 0.6 }), cfg);
    if (fit.ok) for (const w of Object.values(fit.target) as number[]) expect(Math.abs(w - 1)).toBeLessThan(0.2);
  });
  it("is pulled towards equal weights by the shrinkage", () => {
    const samples = synthetic(40, { sleep: 1.5 });
    const loose = fitDomainWeights(samples, { ...cfg, weightShrinkage: 0.1, weightMinGain: 0 });
    const tight = fitDomainWeights(samples, { ...cfg, weightShrinkage: 20, weightMinGain: 0 });
    expect(Math.abs((tight.target.sleep as number) - 1)).toBeLessThan(Math.abs((loose.target.sleep as number) - 1));
  });
  it("needs at least two domains and a few samples", () => {
    expect(fitDomainWeights(synthetic(2, { sleep: 1 }), cfg).ok).toBe(false);
    const oneDomain = synthetic(30, { sleep: 1 }).map((s) => ({ ...s, x: { sleep: s.x.sleep } }));
    expect(fitDomainWeights(oneDomain, cfg).ok).toBe(false);
  });
  it("is deterministic", () => {
    const s = synthetic(40, { sleep: 1.5 });
    expect(fitDomainWeights(s, cfg)).toEqual(fitDomainWeights(s, cfg));
  });
});

describe("weekly update and gates (docs/04 §4.4)", () => {
  // Days with scores and one answered random check-in every third day, mood following sleep.
  function setup(n: number, effect: number) {
    const rand = mulberry32(9);
    const days: { date: string; domainScores: Partial<Record<Domain, number>> }[] = [];
    const checkins: CheckinRecord[] = [];
    for (let i = 0; i < n * 3; i++) {
      const date = addDays(D0, i);
      const sleep = Math.max(0, 0.6 + 0.7 * gaussian(rand));
      days.push({ date, domainScores: { sleep, activity: Math.max(0, 0.6 + 0.7 * gaussian(rand)), rhythm: Math.max(0, 0.6 + 0.7 * gaussian(rand)) } });
      if (i % 3 === 2) checkins.push(checkin(`c${i}`, date, "random", Math.min(7, Math.max(1, Math.round(2 + effect * sleep + 0.4 * gaussian(rand))))));
    }
    return { days, checkins };
  }
  function run(n: number, effect: number, audit: AuditResult, stateOf: (day: number) => "MONITOR" | "ELEVATED" = () => "MONITOR") {
    const { days, checkins } = setup(n, effect);
    let p = undefined as ReturnType<typeof updatePersonal> | undefined;
    for (let i = 0; i < days.length; i++) {
      p = updatePersonal(p, { date: days[i].date, state: stateOf(i), checkins: checkins.filter((c) => c.scheduledAt.slice(0, 10) <= days[i].date), days: days.slice(0, i + 1), audit, cfg });
    }
    return p!;
  }

  it("collects until weightMinSamples", () => {
    const p = run(cfg.weightMinSamples - 5, 2, informative);
    expect(p.status).toBe("collecting");
    expect(p.weights).toEqual({});
  });
  it("waits for an informative self-audit", () => {
    const p = run(40, 2, unclear);
    expect(p.n).toBeGreaterThanOrEqual(cfg.weightMinSamples);
    expect(p.status).toBe("waiting_for_audit");
    expect(p.weights).toEqual({});
  });
  it("becomes active and moves the weights in small weekly steps", () => {
    const p = run(60, 2, informative);
    expect(p.status).toBe("active");
    expect(weightOf(p.weights, "sleep")).toBeGreaterThan(1);
    expect(weightOf(p.target, "sleep")).toBeGreaterThanOrEqual(weightOf(p.weights, "sleep"));
    expect(p.gain as number).toBeGreaterThanOrEqual(cfg.weightMinGain);
  });
  it("freezes the weights outside MONITOR but keeps collecting", () => {
    const p = run(60, 2, informative, () => "ELEVATED");
    expect(p.weights).toEqual({});
    expect(p.updatedOn).toBeNull();
    expect(p.n).toBeGreaterThan(0);
  });
  it("updates at most once every weightUpdateDays", () => {
    const { days, checkins } = setup(40, 2);
    let p = updatePersonal(undefined, { date: days[0].date, state: "MONITOR", checkins, days, audit: informative, cfg });
    const first = p.updatedOn;
    p = updatePersonal(p, { date: addDays(days[0].date, cfg.weightUpdateDays - 1), state: "MONITOR", checkins, days, audit: informative, cfg });
    expect(p.updatedOn).toBe(first);
    p = updatePersonal(p, { date: addDays(days[0].date, cfg.weightUpdateDays), state: "MONITOR", checkins, days, audit: informative, cfg });
    expect(p.updatedOn).toBe(addDays(days[0].date, cfg.weightUpdateDays));
  });
});

describe("dailyUpdate with personal domain weights (docs/04 §4.4)", () => {
  // Seed 7 of the activity-sensitive person: mood follows activity, not sleep timing.
  const sc = activitySensitive(7, 135);
  const run = (personal?: AuditResult | "audit") => {
    const states: EngineState[] = [];
    const r = runDays(sc.raws, { answer: (d) => sc.answer(d), ...(personal ? { personal } : {}), onDay: (_d, st) => states.push(st) });
    return { ...r, states };
  };
  const withW = run(informative);
  const without = run();

  it("leaves the output untouched without the opt-in", () => {
    expect(without.state.personal).toBeUndefined();
  });
  it("learns that activity matters most for this person, within the bounds", () => {
    const p = withW.states[133].personal!; // day 134, before the decline
    expect(p.status).toBe("active");
    const w = p.weights as Record<string, number>;
    const top = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    expect(top).toBe("activity");
    for (const v of Object.values(w)) {
      expect(v).toBeGreaterThanOrEqual(cfg.weightMin - 1e-9);
      expect(v).toBeLessThanOrEqual(cfg.weightMax + 1e-9);
    }
  });
  it("uses the previous day's weights in D, and never moves them while changed", () => {
    let checked = 0;
    for (let i = 1; i < withW.records.length; i++) {
      const prevW = withW.states[i - 1].personal?.weights ?? {};
      const rec = withW.records[i];
      if (Object.keys(prevW).length > 0 && rec.D !== null) {
        expect(rec.D).toBeCloseTo(weightedIndex(rec.domainScores, prevW, cfg.minDomains) as number, 12);
        checked++;
      }
      if (withW.states[i - 1].state !== "MONITOR") expect(withW.states[i].personal?.weights).toEqual(prevW);
    }
    expect(checked).toBeGreaterThan(20);
  });
  it("notices the later fall in activity sooner than equal weights", () => {
    const first = (recs: typeof withW.records) => recs.findIndex((r, i) => i >= 134 && r.state === "ELEVATED");
    expect(first(withW.records)).toBeGreaterThanOrEqual(134);
    const eq = first(without.records);
    expect(eq === -1 || first(withW.records) < eq).toBe(true);
  });
  it("runs with the real self-audit as the gate", () => {
    const real = run("audit");
    expect(real.state.personal).toBeDefined();
    expect(["collecting", "waiting_for_audit", "no_clear_pattern", "active"]).toContain(real.state.personal!.status);
  });
});

describe("index with weights (docs/04 §4.3)", () => {
  it("weights change D but not D_daily", () => {
    const z = { steps: -2, rest_duration: -0.5, rhythm_stability: -1 } as Record<string, number | null>;
    const eq = scoreFromZ(z, [], cfg);
    const wtd = scoreFromZ(z, [], cfg, { activity: 2, sleep: 0.5, rhythm: 0.5 });
    expect(wtd.D as number).toBeGreaterThan(eq.D as number);
    expect(wtd.D_daily).toEqual(eq.D_daily);
    expect(wtd.domainScores).toEqual(eq.domainScores);
  });
});
