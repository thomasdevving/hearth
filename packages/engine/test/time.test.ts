import { describe, expect, it } from "vitest";
import { addDays, datesOfIsoWeek, dayIndex, dayTypeOf, daysBetween, isoFromLocalMinutes, isoWeekOf, localMinutes, weekdayOf } from "../src/time";

describe("time", () => {
  it("day arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-06-18", "2026-11-14")).toBe(149);
    expect(dayIndex("1970-01-01")).toBe(0);
  });
  it("weekday and day type", () => {
    expect(weekdayOf("2026-11-16")).toBe(1); // Monday
    expect(weekdayOf("2026-06-18")).toBe(4); // Thursday
    expect(dayTypeOf("2026-11-14")).toBe("weekend");
    expect(dayTypeOf("2026-11-15")).toBe("weekend");
    expect(dayTypeOf("2026-11-16")).toBe("weekday");
  });
  it("local minutes ignore the offset", () => {
    expect(localMinutes("1970-01-01T01:30:00+02:00")).toBe(90);
    expect(localMinutes("1970-01-02T00:00:00Z")).toBe(1440);
    expect(isoFromLocalMinutes(localMinutes("2026-11-16T23:15:00+01:00"), "+01:00")).toBe("2026-11-16T23:15:00+01:00");
  });
  it("ISO weeks", () => {
    expect(isoWeekOf("2026-11-16")).toBe("2026-W47");
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01");
    expect(isoWeekOf("2027-01-01")).toBe("2026-W53");
    expect(isoWeekOf("2024-12-30")).toBe("2025-W01");
    expect(datesOfIsoWeek("2026-W47")).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    for (const d of datesOfIsoWeek("2026-W53")) expect(isoWeekOf(d)).toBe("2026-W53");
  });
});
