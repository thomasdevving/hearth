// docs/10 metric 7: task G accuracy on hand-written plans, scored after the guardrails.
import { verifyQuote, type VerifiedPlan } from "@baseline/engine";
import evalSet from "../../../../eval/task_g.json";

export interface GCase {
  id: string;
  text: string;
  rules: string[][]; // [feature, direction, place_label?]
  items: string[];
  actions: string[];
}
export const G_CASES: GCase[] = evalSet.cases as GCase[];

export interface GCaseResult {
  id: string;
  status: "ok" | "fallback" | "invalid_output" | "error";
  ranOn: string;
  predicted: string[]; // accepted rules as keys
  expected: string[];
  tp: number;
  rawRules: number;
  quoteRejected: number; // raw rules whose quote is not in the text
  items: number;
  actions: number;
  expectedItems: number;
  expectedActions: number;
  raw: unknown;
  latencyMs: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const ruleKey = (feature: string, direction: string, label?: string | null) => (feature === "place_visits" ? `${feature}:${direction}:${norm(label ?? "")}` : `${feature}:${direction}`);

/** Place labels match leniently ("swimming" ~ "swimming pool"); everything else exactly. */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const [fa, da, la] = a.split(":");
  const [fb, db, lb] = b.split(":");
  return fa === "place_visits" && fb === fa && da === db && !!la && !!lb && (la.includes(lb) || lb.includes(la));
}

export function scoreCase(c: GCase, plan: VerifiedPlan | null, raw: unknown, status: GCaseResult["status"], ranOn: string, latencyMs: number | null): GCaseResult {
  const expected = c.rules.map(([f, d, l]) => ruleKey(f, d, l));
  const predicted = (plan?.rules ?? []).map((r) => ruleKey(r.feature, r.direction, r.place_label));
  const left = [...expected];
  let tp = 0;
  for (const p of predicted) {
    const i = left.findIndex((e) => same(p, e));
    if (i >= 0) {
      tp++;
      left.splice(i, 1);
    }
  }
  const rawRules = Array.isArray((raw as { rules?: unknown[] })?.rules) ? ((raw as { rules: { quote?: string }[] }).rules) : [];
  return {
    id: c.id,
    status,
    ranOn,
    predicted,
    expected,
    tp,
    rawRules: rawRules.length,
    quoteRejected: rawRules.filter((r) => !verifyQuote(r?.quote ?? "", c.text)).length,
    items: plan?.personal_checkin_items.length ?? 0,
    actions: plan?.actions.length ?? 0,
    expectedItems: c.items.length,
    expectedActions: c.actions.length,
    raw,
    latencyMs,
  };
}

export interface GSummary {
  cases: number;
  modelRuns: number;
  precision: number | null;
  recall: number | null;
  quoteRejectedShare: number | null;
  itemsFound: string;
  actionsFound: string;
}

export function summarise(results: GCaseResult[]): GSummary {
  const ran = results.filter((r) => r.status === "ok");
  const pred = ran.reduce((a, r) => a + r.predicted.length, 0);
  const exp = ran.reduce((a, r) => a + r.expected.length, 0);
  const tp = ran.reduce((a, r) => a + r.tp, 0);
  const raw = ran.reduce((a, r) => a + r.rawRules, 0);
  const rej = ran.reduce((a, r) => a + r.quoteRejected, 0);
  return {
    cases: results.length,
    modelRuns: ran.length,
    precision: pred ? tp / pred : null,
    recall: exp ? tp / exp : null,
    quoteRejectedShare: raw ? rej / raw : null,
    itemsFound: `${ran.reduce((a, r) => a + r.items, 0)} of ${ran.reduce((a, r) => a + r.expectedItems, 0)} expected`,
    actionsFound: `${ran.reduce((a, r) => a + r.actions, 0)} of ${ran.reduce((a, r) => a + r.expectedActions, 0)} expected`,
  };
}
