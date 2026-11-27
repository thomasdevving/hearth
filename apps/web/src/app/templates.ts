import { weekLabel } from "./labels";
// Non-LLM fallbacks (docs/05 §3). Plain, warm, no diagnostic words (R9).
import type { QuestionnaireResult, WeekAggregate } from "@hearth/engine";

export const INTRO_RANDOM = "Quick check-in. How are you doing right now?";
export const INTRO_TRIGGERED = "A few things look different from your usual week. How are you doing today?";
export const INTRO_FIXED = "Time for your regular check-in. How are you doing right now?";

const BAND_TEXT: Record<string, string> = {
  minimal: "Your answers are in the lowest range.",
  mild: "Your answers are in the mild range.",
  moderate: "Your answers are in the moderate range.",
  moderately_severe: "Your answers are in the moderately severe range.",
  severe: "Your answers are in the highest range.",
};

/** A positive PHQ-2 within a week of a PHQ-9: the longer questionnaire is not repeated yet. */
export const PHQ9_RECENT = "You answered the longer questionnaire less than a week ago, so Hearth does not ask it again yet.";

/**
 * Fallback explanation for the result page. The page already shows the total and the change
 * from the user's own score, so this only adds what they mean (no repeated numbers).
 */
export function resultTemplate(r: QuestionnaireResult, phq9Next = true): string {
  if (r.id === "PHQ2") {
    if (!r.positive) return "Your answers are in the usual range.";
    // Within a week of a PHQ-9 the longer questionnaire is not asked again (cooldown).
    return phq9Next ? "That is a higher score, so the next step is a slightly longer questionnaire." : `That is a higher score. ${PHQ9_RECENT}`;
  }
  const parts = [BAND_TEXT[r.band ?? ""] ?? ""];
  if (r.flagged) parts.push("This is a clear change, so your plan is shown next. It may be a good moment to talk to your GP or clinician.");
  return parts.filter(Boolean).join(" ");
}

export function weeklyTemplate(weeks: WeekAggregate[]): { reflection: string; open_question: string } {
  const w = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  if (!w) return { reflection: "No full week of data yet.", open_question: "What would you like to notice this week?" };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [`In ${weekLabel(w.isoWeek)} there were ${plural(w.daysWithData, "day", "days")} with data.`];
  // Words, not the raw index: the comparison is made in code (R2), the number stays on Trends.
  if (w.indexMean !== null && prev?.indexMean != null) {
    const diff = w.indexMean - prev.indexMean;
    parts.push(Math.abs(diff) < 0.05 ? "Your days were about as close to your usual pattern as the week before." : diff > 0 ? "Your days were a little further from your usual pattern than the week before." : "Your days were closer to your usual pattern than the week before.");
  }
  if (w.daysElevated > 0) parts.push(`On ${plural(w.daysElevated, "day", "days")} your pattern looked different from usual.`);
  if (w.ema.n > 0 && w.ema.mood_low !== null) parts.push(`You answered ${plural(w.ema.n, "check-in", "check-ins")}; "feeling down" averaged ${w.ema.mood_low} out of 7.`);
  if (w.contexts.length > 0) parts.push(`You noted: ${w.contexts.join(", ")}.`);
  return { reflection: parts.join(" "), open_question: "What made the better days of this week different?" };
}
