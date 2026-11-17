// docs/06: scoring, cut-offs and the reliable-change rule. Items are rendered from the JSON (R1).
import PHQ2 from "../../../shared/questionnaires/PHQ2.json";
import PHQ9 from "../../../shared/questionnaires/PHQ9.json";
import MOMENTARY from "../../../shared/questionnaires/momentary.json";
import type { Config, PhqReference, QuestionnaireId, QuestionnaireRecord, QuestionnaireResult } from "./types";
import { median } from "./stats";
import { dateOfTimestamp, daysBetween } from "./time";

export interface QuestionnaireDef {
  id: string;
  title: string;
  stem: string;
  options: { label: string; value: number }[];
  items: { n: number; text: string; safety_item?: boolean }[];
  scoring: { total: string; range: number[]; bands?: { min: number; max: number; id: string }[] };
}

/** The instruments as stored in shared/questionnaires (verbatim, rule R1). */
export const QUESTIONNAIRES: Partial<Record<QuestionnaireId, QuestionnaireDef>> = {
  PHQ2: PHQ2 as QuestionnaireDef,
  PHQ9: PHQ9 as QuestionnaireDef,
};
export const MOMENTARY_ITEMS = MOMENTARY;

/**
 * docs/06 §3.2: median of the PHQ-9 totals that were not flagged in the 180 days up to
 * `today`; the first (onboarding) PHQ-9 total until such a total exists.
 */
export function remissionScore(records: QuestionnaireRecord[], today: string): PhqReference {
  const phq9 = records.filter((r) => r.instrument === "PHQ9" && dateOfTimestamp(r.takenAt) <= today).sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
  if (phq9.length === 0) return { remissionScore: null };
  const recent = phq9.filter((r) => !r.result.flagged && daysBetween(dateOfTimestamp(r.takenAt), today) <= 180).map((r) => r.result.total);
  if (recent.length > 0) return { remissionScore: median(recent) };
  return { remissionScore: phq9[0].result.total };
}

/** docs/06 §3. Throws on answers that do not fit the instrument. */
export function scoreQuestionnaire(id: QuestionnaireId, answers: number[], ref: PhqReference, cfg: Config): QuestionnaireResult {
  const def = QUESTIONNAIRES[id];
  if (!def) throw new Error(`unknown questionnaire ${id}`);
  const values = new Set(def.options.map((o) => o.value));
  if (answers.length !== def.items.length || !answers.every((a) => values.has(a))) throw new Error(`invalid answers for ${id}`);
  const total = answers.reduce((a, b) => a + b, 0);
  const safetyIdx = def.items.findIndex((it) => it.safety_item);
  const safetyItemPositive = safetyIdx >= 0 && answers[safetyIdx] > 0;
  if (id === "PHQ2") {
    const positive = total >= cfg.phq2Cutoff;
    return { id, total, band: null, positive, flagged: false, changeFromReference: null, safetyItemPositive: false, nextStep: positive ? "offer_phq9" : "none" };
  }
  const band = def.scoring.bands?.find((b) => total >= b.min && total <= b.max)?.id ?? null;
  const change = ref.remissionScore === null ? null : total - ref.remissionScore;
  const flagged = total >= cfg.phq9Cutoff || (change !== null && change >= cfg.phq9ReliableChange);
  const nextStep = safetyItemPositive ? "safety" : flagged ? "show_plan_and_share" : "none";
  return { id, total, band, positive: false, flagged, changeFromReference: change, safetyItemPositive, nextStep };
}
