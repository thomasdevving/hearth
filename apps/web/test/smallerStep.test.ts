import { describe, expect, it } from "vitest";
import { cleanSmaller, summarizeChoices, SMALLER_MAX } from "../src/app/smallerStep";
import type { ActionChoice } from "../src/store/db";

const c = (actionId: string, date: string, choice: ActionChoice["choice"]): ActionChoice => ({ id: `${actionId}_${date}`, actionId, date, choice });

describe("smaller step for a hard day", () => {
  it("keeps the user's own words, trimmed, and nothing when empty", () => {
    expect(cleanSmaller("  Just text:   ten minutes tonight? ")).toBe("Just text: ten minutes tonight?");
    expect(cleanSmaller("   ")).toBeUndefined();
    expect(cleanSmaller("x".repeat(400))).toHaveLength(SMALLER_MAX);
  });

  it("knows today's choice, the last one before today and counts per version", () => {
    const choices = [c("a1", "2026-09-01", "full"), c("a1", "2026-09-20", "smaller"), c("a2", "2026-09-25", "full"), c("a1", "2026-10-05", "full")];
    const s = summarizeChoices(choices, "a1", "2026-10-05");
    expect(s.today).toBe("full");
    expect(s.last).toMatchObject({ date: "2026-09-20", choice: "smaller" });
    expect(s.counts).toEqual({ full: 1, smaller: 1 });
    expect(summarizeChoices(choices, "a3", "2026-10-05")).toEqual({ today: null, last: null, counts: { full: 0, smaller: 0 } });
  });
});
