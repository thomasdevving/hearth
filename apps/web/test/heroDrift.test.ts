import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addDays, usualRangeSeries, whyTimeline } from "@hearth/engine";
import { db } from "../src/store/db";
import { cfg, loadPersona } from "../src/app/runtime";
import { timeMachine } from "../src/replay/controller";
import committed from "../src/assets/hero-drift.json";

/**
 * The landing hero's drift card (screens/HeroDrift.tsx) shows Sam's "Middle of your night"
 * against Sam's usual range up to the day Hearth noticed. The landing page runs no engine, so
 * the numbers are stored in src/assets/hero-drift.json; this test recomputes them with the real
 * app loop and the same engine function as the Why? screen, so the card can never drift from
 * what the app shows. Regenerate with: UPDATE_HERO_DRIFT=1 npx vitest run test/heroDrift.test.ts
 */
const FEATURE = "rest_midpoint" as const;
const DAYS = 21;

async function compute() {
  await db.delete();
  await db.open();
  await loadPersona("default", 1);
  timeMachine.setAutoAnswer(true);
  await timeMachine.jump("first_change");
  const [records, contexts, qs, rules] = await Promise.all([
    db.day_records.orderBy("date").toArray(),
    db.contexts.toArray(),
    db.questionnaires.orderBy("takenAt").toArray(),
    db.plan_rules.toArray(),
  ]);
  const noticed = whyTimeline(records, cfg).episode?.start;
  if (!noticed) throw new Error("no change in the replay");
  const series = usualRangeSeries(records, FEATURE, addDays(noticed, -(DAYS - 1)), contexts, qs, cfg).filter((p) => p.date <= noticed);
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const rule = rules.find((r) => r.active && r.feature === FEATURE);
  return {
    feature: FEATURE,
    quote: rule?.quote ?? null,
    noticed,
    points: series.map((p) => ({ date: p.date, value: round(p.value), low: round(p.low), median: round(p.median), high: round(p.high) })),
  };
}

describe("hero drift card data", () => {
  it("matches the engine's usual range for Sam up to the day Hearth noticed", async () => {
    const data = await compute();
    if (process.env.UPDATE_HERO_DRIFT) {
      fs.writeFileSync(path.resolve(__dirname, "../src/assets/hero-drift.json"), JSON.stringify(data, null, 1) + "\n");
      return;
    }
    expect(data).toEqual(committed);
    expect(data.points).toHaveLength(DAYS);
  });
});
