// Check-in completion (docs/02 §4): momentary rule, crisis keywords, language features.
import type { CheckinInput, CheckinOutput } from "./types";
import { detectCrisis } from "./guardrails/crisis";
import { languageFeatures } from "./language";
import { momentarySignal, phq2CooldownOver } from "./state";
import { dateOfTimestamp } from "./time";

export function onCheckinCompleted(input: CheckinInput): CheckinOutput {
  const { record, freeText, cfg, date } = input;
  const crisis = detectCrisis(freeText, input.keywords);
  const a = record.answers;
  const momentaryHigh = (typeof a.mood_low === "number" && a.mood_low >= cfg.emaHigh) || (typeof a.enjoyment === "number" && a.enjoyment <= cfg.emaLow);
  const all = [...input.recentCheckins.filter((c) => c.id !== record.id), record];
  const signal = record.answeredAt !== null && momentarySignal(all, date, cfg);
  const phq2Today = input.questionnaires.some((q) => q.instrument === "PHQ2" && dateOfTimestamp(q.takenAt) === date);
  const offerPhq2 = signal && input.state !== "CONFIRMED" && !phq2Today && phq2CooldownOver(input.questionnaires, date, cfg);
  const hasText = typeof freeText === "string" && freeText.trim().length > 0;
  return { crisis, momentaryHigh, offerPhq2, language: hasText ? languageFeatures(freeText) : null, runTasks: hasText ? ["H", "B"] : [] };
}
