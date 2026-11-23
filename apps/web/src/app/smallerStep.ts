import type { PlanAction } from "@hearth/engine";
import { db, type ActionChoice } from "../store/db";
import { emitChange } from "./events";

/**
 * "Too much today": each action can have the user's own smaller version. The choice of a day
 * is stored on this device so Hearth can say, by counting, which version was chosen last time.
 * No model writes or picks the smaller step.
 */

export const SMALLER_MAX = 160;

export function cleanSmaller(text: string): string | undefined {
  const t = text.replace(/\s+/g, " ").trim().slice(0, SMALLER_MAX);
  return t.length > 0 ? t : undefined;
}

export async function setSmaller(action: PlanAction, text: string): Promise<void> {
  await db.plan_actions.put({ ...action, smaller: cleanSmaller(text) });
  emitChange();
}

/** One choice per action per day: choosing again on the same day replaces it. */
export async function chooseVersion(actionId: string, date: string, choice: ActionChoice["choice"]): Promise<void> {
  await db.action_choices.put({ id: `${actionId}_${date}`, actionId, date, choice });
  emitChange();
}

export interface ChoiceSummary {
  today: ActionChoice["choice"] | null;
  /** The most recent choice before today, if any. */
  last: ActionChoice | null;
  /** How often each version was chosen before today. */
  counts: { full: number; smaller: number };
}

export function summarizeChoices(choices: ActionChoice[], actionId: string, today: string): ChoiceSummary {
  const mine = choices.filter((c) => c.actionId === actionId).sort((a, b) => (a.date < b.date ? -1 : 1));
  const before = mine.filter((c) => c.date < today);
  return {
    today: mine.find((c) => c.date === today)?.choice ?? null,
    last: before[before.length - 1] ?? null,
    counts: { full: before.filter((c) => c.choice === "full").length, smaller: before.filter((c) => c.choice === "smaller").length },
  };
}
