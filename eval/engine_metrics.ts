// docs/10 metrics 2–6, computed from the engine with the replay persona.
//   npx tsx eval/engine_metrics.ts
import { runHeadless, simulatePersona, type HeadlessResult, type Scenario } from "../packages/engine/src/index";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const firstElevated = (r: HeadlessResult) => r.records.findIndex((x) => x.state === "ELEVATED") + 1; // 0 = never
const elevatedDays = (r: HeadlessResult, from = 1, to = r.records.length) => r.records.slice(from - 1, to).filter((x) => x.state === "ELEVATED").length;

function acceptance(seed: number) {
  const data = simulatePersona(seed, "default");
  const r = runHeadless(data, { seed });
  const nc = runHeadless(data, { seed, confirmContexts: false });
  const st = (d: number) => r.records[d - 1].state;
  const fe = firstElevated(r);
  const gym = r.rules.find((x) => x.feature === "place_visits")?.placeId;
  const cons = fe ? r.records.slice(fe - 1, fe + 2).flatMap((x) => x.contributors.map((c) => c.feature)) : []; // first 3 days of the change
  const phq2 = r.days.find((d) => d.day >= fe && d.phq2Offered);
  const perDay = new Map<string, number>();
  for (const c of r.checkins) perDay.set(c.scheduledAt.slice(0, 10), (perDay.get(c.scheduledAt.slice(0, 10)) ?? 0) + 1);
  return {
    monitorBy15: st(15) === "MONITOR",
    holidayQuiet: range(61, 67).every((d) => st(d) !== "ELEVATED"),
    holidayAlarmIfUnconfirmed: range(61, 67).some((d) => nc.records[d - 1].state === "ELEVATED"),
    examMasksNothing: range(96, 102).every((d) => r.records[d - 1].maskedDomains.length === 0),
    firstElevatedIn108to120: fe >= 108 && fe <= 120,
    contributorsRestAndGym: cons.includes("rest_midpoint") && cons.includes(`place_visits:${gym}`),
    phq2Within7: !!phq2 && phq2.day - fe <= 7,
    oneCheckinPerDay: [...perDay.values()].every((v) => v <= 1),
  };
}

const out: string[] = [];
const log = (s = "") => {
  out.push(s);
  console.log(s);
};

// Metric 2
const acc = range(1, 20).map(acceptance);
log("## Metric 2 · Replay acceptance, seeds 1–20 (docs/08 §2.3)");
log("| Point | Seeds passing |");
log("|---|---|");
for (const k of Object.keys(acc[0]) as (keyof (typeof acc)[0])[]) log(`| ${k} | ${acc.filter((a) => a[k]).length} / 20 |`);
log(`| all points together | ${acc.filter((a) => Object.values(a).every(Boolean)).length} / 20 |`);
log(`Seeds failing any point: ${acc.map((a, i) => (Object.values(a).every(Boolean) ? null : i + 1)).filter(Boolean).join(", ") || "none"}`);

// Metric 3
const stable = range(1, 50).map((seed) => runHeadless(simulatePersona(seed, "stable"), { seed }));
const fa = stable.map((r) => (elevatedDays(r, 15) / (r.records.length - 14)) * 100);
const episodes = stable.map((r) => r.records.filter((x, i) => x.state === "ELEVATED" && (i === 0 || r.records[i - 1].state !== "ELEVATED")).length);
log("\n## Metric 3 · False alarms on stable data, seeds 1–50 (150 days, from day 15)");
log(`ELEVATED days per 100 days: mean ${(fa.reduce((a, b) => a + b, 0) / fa.length).toFixed(2)}, median ${median(fa).toFixed(2)}, max ${Math.max(...fa).toFixed(2)}`);
log(`Episodes (entries into ELEVATED) per 150 days: mean ${(episodes.reduce((a, b) => a + b, 0) / episodes.length).toFixed(2)}; seeds with none: ${episodes.filter((e) => e === 0).length} / 50`);

// Metrics 4 and 6
function delays(scenario: Scenario, start: number, withPlan: boolean, personal = false) {
  const ds: number[] = [];
  let missed = 0;
  let early = 0;
  for (const seed of range(1, 50)) {
    const r = runHeadless(simulatePersona(seed, scenario), { seed, withPlan, personal });
    const fe = r.records.findIndex((x, i) => i + 1 >= start && x.state === "ELEVATED") + 1;
    if (r.records.slice(14, start - 1).some((x) => x.state === "ELEVATED")) early++;
    if (fe === 0) missed++;
    else ds.push(fe - start);
  }
  return { median: median(ds), min: Math.min(...ds), max: Math.max(...ds), missed, early };
}
log("\n## Metric 4 · Detection delay (days from decline start to first ELEVATED), seeds 1–50");
log("| Scenario | Median | Range | Not detected | Seeds with an earlier false alarm |");
log("|---|---|---|---|---|");
const d4 = delays("default", 103, true);
const d4s = delays("slow", 71, true);
log(`| default (decline 103–130) | ${d4.median} | ${d4.min}–${d4.max} | ${d4.missed} | ${d4.early} |`);
log(`| slow (decline 71–130) | ${d4s.median} | ${d4s.min}–${d4s.max} | ${d4s.missed} | ${d4s.early} |`);

// Metric 5
log("\n## Metric 5 · Context filter, ELEVATED days in days 61–67");
const c5 = range(1, 20).map((seed) => {
  const data = simulatePersona(seed, "default");
  return [elevatedDays(runHeadless(data, { seed }), 61, 67), elevatedDays(runHeadless(data, { seed, confirmContexts: false }), 61, 67)];
});
log(`Seed 1: ${c5[0][0]} with the holiday confirmed, ${c5[0][1]} without.`);
log(`Seeds 1–20: ${c5.reduce((a, b) => a + b[0], 0)} days with, ${c5.reduce((a, b) => a + b[1], 0)} without (sum over seeds).`);

log("\n## Metric 6 · Personal rules effect on detection delay (default, seeds 1–50)");
const d6 = delays("default", 103, false);
log(`With Sam's confirmed rules: median ${d4.median} (range ${d4.min}–${d4.max}), not detected ${d4.missed}.`);
log(`Without rules: median ${d6.median} (range ${d6.min}–${d6.max}), not detected ${d6.missed}.`);

// Metric 7 · Personal domain weights (docs/04 §4.4)
log("\n## Metric 7 · Personal domain weights (docs/04 §4.4)");
log("Learned only from random check-ins, gated by the real self-audit and leave-one-out validation.");
const stableP = range(1, 50).map((seed) => runHeadless(simulatePersona(seed, "stable"), { seed, personal: true }));
const faP = stableP.map((r) => (elevatedDays(r, 15) / (r.records.length - 14)) * 100);
const activeStable = stableP.filter((r) => Object.keys(r.state.personal?.weights ?? {}).length > 0).length;
log(`Stable persona, seeds 1–50: ELEVATED days per 100 days ${(faP.reduce((a, b) => a + b, 0) / faP.length).toFixed(2)} with weights vs ${(fa.reduce((a, b) => a + b, 0) / fa.length).toFixed(2)} without (max ${Math.max(...faP).toFixed(2)} vs ${Math.max(...fa).toFixed(2)}); weights active at the end in ${activeStable} / 50.`);
const d7 = delays("default", 103, true, true);
log(`Sam (default), seeds 1–50: detection delay median ${d7.median} (range ${d7.min}–${d7.max}), not detected ${d7.missed}, earlier false alarm ${d7.early}; without weights median ${d4.median} (range ${d4.min}–${d4.max}), not detected ${d4.missed}, earlier false alarm ${d4.early}.`);

// A person whose mood follows activity, not sleep timing (test/helpers.ts activitySensitive).
// The self-audit gate is held at "informative" here so the learning itself is measured.
import { activitySensitive, runDays } from "../packages/engine/test/helpers";
const informativeAudit = { status: "informative" as const, nTriggered: 10, nRandom: 20, delta: 1, p: 0.01 };
function personalised(effect: number) {
  let earlier = 0, later = 0, detW = 0, detE = 0, falseW = 0, falseE = 0, activeBefore = 0, rightDomain = 0;
  for (const seed of range(1, 20)) {
    const a = activitySensitive(seed, 135, effect);
    let before = false;
    let top = "";
    const w = runDays(a.raws, {
      answer: (d) => a.answer(d),
      personal: informativeAudit,
      onDay: (d, st) => {
        const ws = st.personal?.weights ?? {};
        if (d < "2026-10-30" && Object.keys(ws).length > 0) {
          before = true;
          top = Object.entries(ws).sort((x, y) => (y[1] as number) - (x[1] as number))[0][0];
        }
      },
    });
    const b = activitySensitive(seed, 135, effect);
    const e = runDays(b.raws, { answer: (d) => b.answer(d) });
    const first = (recs: typeof w.records) => {
      const i = recs.findIndex((x, j) => j >= 134 && x.state === "ELEVATED");
      return i < 0 ? Infinity : i + 1;
    };
    const fw = first(w.records), fe = first(e.records);
    if (fw < fe) earlier++;
    if (fw > fe) later++;
    if (fw < Infinity) detW++;
    if (fe < Infinity) detE++;
    falseW += w.records.slice(30, 134).filter((x) => x.state === "ELEVATED").length;
    falseE += e.records.slice(30, 134).filter((x) => x.state === "ELEVATED").length;
    if (before) { activeBefore++; if (top === "activity") rightDomain++; }
  }
  return { earlier, later, detW, detE, falseW, falseE, activeBefore, rightDomain };
}
const p1 = personalised(1);
const p0 = personalised(0);
log("| Activity-sensitive person, seeds 1–20 | Mood follows activity | No link (control) |");
log("|---|---|---|");
log(`| Weights active before the decline | ${p1.activeBefore} / 20 (activity weighs most in ${p1.rightDomain}) | ${p0.activeBefore} / 20 |`);
log(`| Decline seen earlier / later than equal weights | ${p1.earlier} / ${p1.later} | ${p0.earlier} / ${p0.later} |`);
log(`| Decline detected (with / without weights) | ${p1.detW} / ${p1.detE} | ${p0.detW} / ${p0.detE} |`);
log(`| False ELEVATED days, days 31–134 (with / without) | ${p1.falseW} / ${p1.falseE} | ${p0.falseW} / ${p0.falseE} |`);

// Metric 8 · Unanswered check-ins as a signal (docs/04 §7.5)
// Stable sensor data (test/helpers.ts makeDays), so only the response pattern can fire. Each
// person leaves a fixed share of check-ins at random; in the "stops" runs that share rises to
// 75 % from day 120. How often real people stop answering before a relapse is not known: this
// measures the rule, not the clinical claim.
import { defaultConfig } from "../packages/engine/src/config";
import { mulberry32 } from "../packages/engine/src/stats";
import { addDays } from "../packages/engine/src/time";
import { makeDays, START } from "../packages/engine/test/helpers";
import type { Config, ContextLabel } from "../packages/engine/src/types";
log("\n## Metric 8 · Unanswered check-ins (docs/04 §7.5)");
const raws8 = makeDays(START, 180, 4);
const ok8 = { mood_low: 2, enjoyment: 5, energy: 5 };
function response8(cfg: Config, seed: number, base: number, after: number, from: number, contexts: ContextLabel[] = [], holiday: [number, number] | null = null) {
  const rand = mulberry32(seed * 97 + Math.round(base * 100));
  const fromDate = addDays(START, from - 1);
  const inHoliday = (d: string) => holiday !== null && d >= addDays(START, holiday[0] - 1) && d <= addDays(START, holiday[1] - 1);
  const r = runDays(raws8, { seed, cfg, contexts, responses: true, answer: (d) => (rand() < (d >= fromDate ? after : inHoliday(d) ? 0.8 : base) ? null : ok8) });
  const on = r.records.map((x) => x.response?.status === "fewer_answers");
  let falseEp = 0;
  for (let i = 1; i < Math.min(from - 1, on.length); i++) if (on[i] && !on[i - 1]) falseEp++;
  const det = on.findIndex((x, i) => i >= from - 1 && x);
  return { falseEp, delay: det < 0 ? null : det - (from - 1) };
}
function table8(cfg: Config) {
  const rows: string[] = [];
  for (const base of [0.1, 0.2, 0.3]) {
    let fe = 0, late = 0;
    const ds: number[] = [];
    for (const seed of range(1, 40)) {
      fe += response8(cfg, seed, base, base, 999).falseEp;
      const b = response8(cfg, seed, base, 0.75, 120);
      if (b.delay === null || b.delay > 28) late++;
      else ds.push(b.delay);
    }
    rows.push(`| ${base * 100} % | ${(fe / 40 / 1.8).toFixed(2)} | ${median(ds)} | ${40 - late} / 40 |`);
  }
  return rows;
}
log("Stable sensors, seeds 1–40, 180 days. False episodes: entries into \"fewer answers\" with no change in the share left. Stops: from day 120 the person leaves 75 %.");
log("| Usually left | False episodes per 100 days | Stops: median days to the signal | Stops: signal within 28 days |");
log("|---|---|---|---|");
for (const row of table8(defaultConfig)) log(row);
log(`With the old back-off (halve after ${2} unanswered instead of ${defaultConfig.ignoredBeforeBackoff}):`);
for (const row of table8({ ...defaultConfig, ignoredBeforeBackoff: 2 })) log(row);
let hWith = 0, hWithout = 0;
for (const seed of range(1, 40)) {
  const ctx: ContextLabel = { id: "h", type: "holiday", kind: "explains_sensors", start: addDays(START, 89), end: addDays(START, 99), quote: null, source: "manual", confirmed: true };
  hWith += response8(defaultConfig, seed, 0.1, 0.1, 999, [ctx], [90, 100]).falseEp;
  hWithout += response8(defaultConfig, seed, 0.1, 0.1, 999, [], [90, 100]).falseEp;
}
log(`Holiday (days 90–100, 80 % left, usually 10 %), seeds 1–40: ${hWith} false episodes with the holiday confirmed, ${hWithout} without.`);
const sam8 = range(1, 50).map((seed) => runHeadless(simulatePersona(seed, "default"), { seed, responses: true }));
const samUnanswered = sam8.reduce((a, r) => a + r.days.filter((d) => d.actions.some((x) => x.type === "offer_questionnaire" && x.reason === "unanswered")).length, 0);
const samSame = sam8.filter((r, i) => firstElevated(r) === firstElevated(runHeadless(simulatePersona(i + 1, "default"), { seed: i + 1 }))).length;
log(`Sam (answers almost every check-in), seeds 1–50 with the signal on: ${samUnanswered} "unanswered" PHQ-2 offers; first ELEVATED day unchanged in ${samSame} / 50.`);

import { writeFileSync } from "node:fs";
writeFileSync(new URL("./results/engine_metrics.md", import.meta.url), out.join("\n") + "\n");
