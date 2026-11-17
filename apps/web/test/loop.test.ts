import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/store/db";
import { loadPersona, getMeta } from "../src/app/runtime";
import { timeMachine } from "../src/replay/controller";

describe("app loop with the time machine (M4)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await loadPersona("default", 1);
  });

  it("runs 70 days with scripted answers, confirms the holiday and leaves MONITOR intact", async () => {
    timeMachine.setAutoAnswer(true);
    for (let i = 0; i < 70; i++) await timeMachine.step();
    const meta = await getMeta();
    expect(meta?.dayNumber).toBe(71); // onboarding processes day 1, then 70 steps
    const records = await db.day_records.orderBy("date").toArray();
    expect(records).toHaveLength(71);
    expect(records[14].state).toBe("MONITOR");
    const ctx = await db.contexts.toArray();
    expect(ctx.map((c) => c.type)).toContain("holiday");
    expect(records.slice(60, 67).every((r) => r.state !== "ELEVATED")).toBe(true);
    expect(records.slice(61, 67).every((r) => r.maskedDomains.includes("mobility"))).toBe(true);
    const rules = await db.plan_rules.toArray();
    expect(rules.map((r) => r.feature)).toEqual(expect.arrayContaining(["rest_midpoint", "place_visits", "home_stay"]));
    const perDay = new Map<string, number>();
    for (const c of await db.checkins.toArray()) perDay.set(c.scheduledAt.slice(0, 10), (perDay.get(c.scheduledAt.slice(0, 10)) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(1);
    // Nothing was sent anywhere: no model and no cloud calls in the ledger.
    expect((await db.ledger.toArray()).every((e) => e.ranOn !== "cloud")).toBe(true);
  });

  it("Jump to first change stops on the first ELEVATED day", async () => {
    await timeMachine.jump("first_change");
    const records = await db.day_records.orderBy("date").toArray();
    const last = records[records.length - 1];
    expect(last.state).toBe("ELEVATED");
    expect(records.filter((r) => r.state === "ELEVATED")).toHaveLength(1);
    expect(records.length).toBeGreaterThanOrEqual(108);
    expect(records.length).toBeLessThanOrEqual(120);
  });
});
