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
function delays(scenario: Scenario, start: number, withPlan: boolean) {
  const ds: number[] = [];
  let missed = 0;
  let early = 0;
  for (const seed of range(1, 50)) {
    const r = runHeadless(simulatePersona(seed, scenario), { seed, withPlan });
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

import { writeFileSync } from "node:fs";
writeFileSync(new URL("./results/engine_metrics.md", import.meta.url), out.join("\n") + "\n");
