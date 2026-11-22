import type { Config, DayRecord, QuestionnaireRecord, State } from "@hearth/engine";

/**
 * Pure helpers for the page for the GP (screens/PlanPrint.tsx). Every number on that page
 * comes from here or from the engine, never from a model (R2). Wording follows R9: "a change
 * from my usual pattern", never a diagnosis.
 */

export type ChangeSummary = {
  state: State | null;
  /** First day of the current changed period (ELEVATED or CONFIRMED), or null when there is none. */
  since: string | null;
  /** Days in the current changed period, counting the first and the last scored day. */
  days: number;
  /** What changed most on the last scored day, as plain phrases built by the engine. */
  changes: string[];
  lastDate: string | null;
};

const CHANGED: State[] = ["ELEVATED", "CONFIRMED"];

export function changeSummary(records: DayRecord[]): ChangeSummary {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last) return { state: null, since: null, days: 0, changes: [], lastDate: null };
  if (!CHANGED.includes(last.state)) return { state: last.state, since: null, days: 0, changes: [], lastDate: last.date };
  let i = sorted.length - 1;
  while (i > 0 && CHANGED.includes(sorted[i - 1].state)) i--;
  return {
    state: last.state,
    since: sorted[i].date,
    days: sorted.length - i,
    changes: last.contributors.map((c) => c.phrase),
    lastDate: last.date,
  };
}

/** The questionnaire's scale and what the score means against its usual reference values. */
export function questionnaireNote(q: QuestionnaireRecord, cfg: Pick<Config, "phq2Cutoff">): string {
  const r = q.result;
  if (q.instrument === "PHQ2") {
    return r.total >= cfg.phq2Cutoff ? `At or above the usual cut-off of ${cfg.phq2Cutoff}; PHQ-9 offered` : `Below the usual cut-off of ${cfg.phq2Cutoff}`;
  }
  const parts: string[] = [];
  if (r.band) parts.push(`Range: ${r.band.replace(/_/g, " ")}`);
  if (r.changeFromReference !== null && r.changeFromReference !== 0) {
    parts.push(`${r.changeFromReference > 0 ? "+" : ""}${r.changeFromReference} from my reference score`);
  }
  if (r.flagged) parts.push("a clear change from my usual score");
  if (r.safetyItemPositive) parts.push("item 9 answered above 0; support resources shown");
  return parts.join("; ");
}

export function maxScore(instrument: QuestionnaireRecord["instrument"]): number {
  return instrument === "PHQ9" ? 27 : 6;
}

/** Labels on the GP page are in the first person ("Middle of my night"), like the rest of the page. */
export function firstPerson(label: string): string {
  return label.replace(/\byour\b/g, "my").replace(/\bYour\b/g, "My");
}
