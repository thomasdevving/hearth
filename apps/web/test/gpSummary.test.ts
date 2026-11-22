import { describe, expect, it } from "vitest";
import { defaultConfig, scoreQuestionnaire, type DayRecord, type QuestionnaireRecord, type State } from "@hearth/engine";
import { changeSummary, firstPerson, questionnaireNote } from "../src/export/gpSummary";

const day = (date: string, state: State, phrases: string[] = []): DayRecord =>
  ({ date, state, contributors: phrases.map((phrase) => ({ feature: "steps", r: 1.5, phrase })) }) as unknown as DayRecord;

const q = (instrument: "PHQ2" | "PHQ9", answers: number[], remissionScore: number | null = null): QuestionnaireRecord => ({
  id: "q",
  instrument,
  takenAt: "2026-10-05T09:00:00+02:00",
  answers,
  result: scoreQuestionnaire(instrument, answers, { remissionScore }, defaultConfig),
});

describe("page for the GP", () => {
  it("finds when the current change started and what changed on the last day", () => {
    const s = changeSummary([
      day("2026-09-27", "MONITOR"),
      day("2026-09-29", "ELEVATED"),
      day("2026-09-28", "ELEVATED"),
      day("2026-09-30", "CONFIRMED", ["later sleep", "higher resting heart rate"]),
    ]);
    expect(s.since).toBe("2026-09-28");
    expect(s.days).toBe(3);
    expect(s.changes).toEqual(["later sleep", "higher resting heart rate"]);
    expect(s.lastDate).toBe("2026-09-30");
  });

  it("reports no change period when the last day is usual", () => {
    const s = changeSummary([day("2026-09-28", "ELEVATED"), day("2026-09-29", "MONITOR")]);
    expect(s.since).toBeNull();
    expect(s.state).toBe("MONITOR");
    expect(changeSummary([]).state).toBeNull();
  });

  it("explains a PHQ-2 score against the cut-off from config", () => {
    expect(questionnaireNote(q("PHQ2", [2, 2]), defaultConfig)).toBe(`At or above the usual cut-off of ${defaultConfig.phq2Cutoff}; PHQ-9 offered`);
    expect(questionnaireNote(q("PHQ2", [1, 0]), defaultConfig)).toBe(`Below the usual cut-off of ${defaultConfig.phq2Cutoff}`);
  });

  it("gives the PHQ-9 range and never leaves the note empty", () => {
    expect(questionnaireNote(q("PHQ9", [0, 0, 1, 1, 1, 0, 0, 0, 0]), defaultConfig)).toBe("Range: minimal");
    expect(questionnaireNote(q("PHQ9", [2, 2, 2, 2, 2, 2, 2, 2, 0]), defaultConfig)).toContain("Range: moderately severe");
  });

  it("writes labels in the first person", () => {
    expect(firstPerson("Middle of your night")).toBe("Middle of my night");
    expect(firstPerson("Time at home")).toBe("Time at home");
  });
});
