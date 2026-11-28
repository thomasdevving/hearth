// docs/05 §4–5: code-side checks on every model output (rule R8).
import type { Config, DiaryMarkers, RuleDirection, TaskId, VerifiedContext, VerifiedPlan, VerifiedRule } from "../types";
import { defaultConfig } from "../config";
import { CONTEXT_TABLE } from "../context";
import { featureDef } from "../features/catalogue";
import { schemas, validate } from "./validate";
import { findQuoteSpan, quoteDropsNegation, verifyQuote } from "./quotes";
import { resolveContextPeriod, resolveDateHint } from "./dates";
import { hasBannedWords, numberCheck, piiCheck } from "./text";

const PHONE_FEATURES = new Set(["screen_time", "night_use", "communication_time"]);

/**
 * docs/05 task G rule 3: the directions a personal rule may take. A warning sign is the
 * direction that signals a harder time (the catalogue's `dir`): fewer steps, more time at home.
 * Sleep length and timing can go either way; regularity only gets less regular.
 */
export function ruleDirections(feature: string): RuleDirection[] {
  const d = featureDef(feature);
  if (!d) return [];
  if (feature === "rest_midpoint") return ["later", "earlier"];
  if (feature === "rest_regularity" || feature === "rhythm_stability") return ["less_regular"];
  if (d.dir === "±") return ["higher", "lower"];
  return [d.dir === "+" ? "higher" : "lower"];
}

export function directionLegal(feature: string, direction: RuleDirection): boolean {
  return ruleDirections(feature).includes(direction);
}

/**
 * The one combined choice the on-device model gets per rule ("steps, lower"): only legal
 * pairs, and only features a person's own words map to. Location entropy and the like stay
 * research signals for everyone, not something people write about themselves.
 */
const SIGNAL_FEATURES = ["rest_midpoint", "rest_duration", "rest_regularity", "rhythm_stability", "routine_regularity", "steps", "walking_speed", "home_stay", "places_visited", "place_visits", "resting_hr", "hrv"];
export function ruleSignals(cfg: Config = defaultConfig): string[] {
  const features = cfg.phone.enabled ? [...SIGNAL_FEATURES, ...PHONE_FEATURES] : SIGNAL_FEATURES;
  return features.flatMap((f) => ruleDirections(f).map((d) => `${f}, ${d}`));
}
/** Turns `{ signal: "steps, lower" }` rules back into `{ feature, direction }` (other fields kept). */
export function expandRuleSignals(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { rules?: unknown }).rules)) return raw;
  const r = raw as { rules: unknown[] };
  return {
    ...r,
    rules: r.rules.map((x) => {
      if (!x || typeof x !== "object" || typeof (x as { signal?: unknown }).signal !== "string") return x;
      const { signal, ...rest } = x as { signal: string };
      const [feature, direction] = signal.split(",").map((t) => t.trim());
      return { ...rest, feature, direction };
    }),
  };
}

// "What helps" text (docs/05 task G): an entry quoted from it is an action, never a sign.
const HELP_WORD = /\bhelp(s|ed|ing)?\b/i;
const SIGN_WORD = /\b(stop|stops|stopped|skip|skips|skipped|miss|misses|missed|less|fewer|no longer|don'?t|doesn'?t|do not|not|never|hardly|barely|avoid|avoids|quit)\b/i;
const HELP_HEADER = /^\s*(what\s+)?helps?(\s+me)?\s*:/i;

/**
 * Character ranges of the source that talk about what helps: clauses with "helps" (split at
 * sentence ends, commas and semicolons, so "I sleep ten hours, which helps" keeps the sign),
 * and lists under a "What helps:" heading.
 */
function helpRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /[^.!?\n,;]+[.!?,;]*/g;
  for (let m; (m = re.exec(text)); ) if (HELP_WORD.test(m[0])) out.push([m.index, m.index + m[0].length]);
  let pos = 0, inList = false;
  for (const line of text.split("\n")) {
    const end = pos + line.length;
    if (HELP_HEADER.test(line)) inList = true;
    else if (line.trim() === "" || /:\s*$/.test(line)) inList = false;
    if (inList) out.push([pos, end]);
    pos = end + 1;
  }
  return out;
}
function spanOf(quote: string, text: string): [number, number] | null {
  const q = findQuoteSpan(quote, text);
  if (!q) return null;
  let i = text.indexOf(q);
  if (i < 0) i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? null : [i, i + q.length];
}
const overlaps = (a: [number, number] | null, b: [number, number] | null) => !!a && !!b && a[0] < b[1] && b[0] < a[1];
const inside = (a: [number, number] | null, ranges: [number, number][]) => !!a && ranges.some((r) => a[0] >= r[0] && a[1] <= r[1]);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Task G guardrails: schema, quote verification on every entry, legal directions, merged
 * duplicates (first quote wins), nothing quoted from what helps, no question for a sign that is
 * already a rule. Phone-domain rules are dropped while `cfg.phone.enabled` is off.
 */
const gRules = (schemas.G as { properties: { rules: { items: { properties: { feature: { enum: string[] }; direction: { enum: string[] } } } } } }).properties.rules.items.properties;
const RULE_FEATURES = new Set(gRules.feature.enum);
const RULE_DIRECTIONS = new Set(gRules.direction.enum);

/**
 * A small model's output, made safe to check entry by entry: one malformed entry, a missing
 * place_label, extra fields or one entry too many drop only that entry, not the whole plan.
 */
function sanitizePlan(raw: unknown): { plan: unknown; dropped: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { plan: raw, dropped: 0 };
  const r = raw as Record<string, unknown>;
  let dropped = 0;
  const list = (v: unknown, max: number, keep: (e: Record<string, unknown>) => Record<string, unknown> | null) => {
    if (!Array.isArray(v)) return [];
    const out: Record<string, unknown>[] = [];
    for (const e of v) {
      const k = e && typeof e === "object" && !Array.isArray(e) ? keep(e as Record<string, unknown>) : null;
      if (!k || out.length >= max) dropped++;
      else out.push(k);
    }
    return out;
  };
  const str = (x: unknown, max = 1000) => (typeof x === "string" && x.trim() && x.length <= max ? x : null);
  const plan = {
    rules: list(r.rules, 6, (e) => {
      const feature = str(e.feature), direction = str(e.direction), quote = str(e.quote);
      if (!feature || !RULE_FEATURES.has(feature) || !direction || !RULE_DIRECTIONS.has(direction)) return null;
      const place = e.place_label == null ? "" : typeof e.place_label === "string" ? e.place_label.slice(0, 30) : null;
      return feature && direction && quote && place !== null ? { feature, direction, place_label: place, quote } : null;
    }),
    personal_checkin_items: list(r.personal_checkin_items, 3, (e) => {
      const question = str(e.question, 80), quote = str(e.quote);
      return question && quote ? { question, quote } : null;
    }),
    actions: list(r.actions, 6, (e) => {
      const text = str(e.text, 80), quote = str(e.quote);
      return text && quote ? { text, quote } : null;
    }),
  };
  return { plan, dropped };
}

export function verifyPlan(raw: unknown, sourceText: string, cfg: Config = defaultConfig): VerifiedPlan {
  const empty: VerifiedPlan = { rules: [], personal_checkin_items: [], actions: [], dropped: 0, valid: false };
  const clean = sanitizePlan(raw);
  raw = clean.plan;
  if (!validate("G", raw).valid) return empty;
  const g = raw as {
    rules: { feature: string; direction: RuleDirection; place_label: string; quote: string }[];
    personal_checkin_items: { question: string; quote: string }[];
    actions: { text: string; quote: string }[];
  };
  let dropped = clean.dropped;
  const helps = helpRanges(sourceText);
  const actionSpans = g.actions.map((a) => spanOf(a.quote, sourceText));
  // A sign quoted from what helps ("Going to the gym helps") is an action; the model listed
  // it as one too, or the sentence is about helping and says nothing about stopping.
  const fromHelps = (quote: string) => {
    const sp = spanOf(quote, sourceText);
    return actionSpans.some((a) => overlaps(sp, a)) || (inside(sp, helps) && !SIGN_WORD.test(quote));
  };
  const rules: VerifiedRule[] = [];
  const ruleSpans: ([number, number] | null)[] = [];
  const seen = new Set<string>();
  for (const r0 of g.rules) {
    // Regularity only gets less regular: "rhythm_stability, lower" means the same thing.
    const r = r0.feature === "rest_regularity" || r0.feature === "rhythm_stability" ? { ...r0, direction: "less_regular" as RuleDirection } : r0;
    const label = r.feature === "place_visits" ? norm(r.place_label ?? "") : "";
    const ok =
      featureDef(r.feature) !== null &&
      !fromHelps(r.quote) &&
      verifyQuote(r.quote, sourceText) &&
      !quoteDropsNegation(r.quote, sourceText) &&
      directionLegal(r.feature, r.direction) &&
      (r.feature !== "place_visits" || label.length > 0) &&
      (cfg.phone.enabled || !PHONE_FEATURES.has(r.feature));
    const key = `${r.feature}|${label}`;
    if (!ok || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    ruleSpans.push(spanOf(r.quote, sourceText));
    rules.push({ feature: r.feature, direction: r.direction, place_label: label || null, quote: findQuoteSpan(r.quote, sourceText) ?? r.quote });
  }
  const items: { question: string; quote: string }[] = [];
  const seenItems = new Set<string>();
  for (const it of g.personal_checkin_items) {
    const key = norm(it.question);
    // One sign, one card: no question for a sign that already became a rule, or for what helps.
    const sp = spanOf(it.quote, sourceText);
    const covered = ruleSpans.some((r) => overlaps(sp, r)) || fromHelps(it.quote);
    if (!verifyQuote(it.quote, sourceText) || quoteDropsNegation(it.quote, sourceText) || key.length === 0 || seenItems.has(key) || hasBannedWords(it.question) || covered) {
      dropped++;
      continue;
    }
    seenItems.add(key);
    items.push({ question: it.question.trim(), quote: findQuoteSpan(it.quote, sourceText) ?? it.quote });
  }
  const actions: { text: string; quote: string }[] = [];
  const seenActions = new Set<string>();
  for (const a of g.actions) {
    const key = norm(a.text);
    if (!verifyQuote(a.quote, sourceText) || key.length === 0 || seenActions.has(key)) {
      dropped++;
      continue;
    }
    seenActions.add(key);
    actions.push({ text: a.text.trim(), quote: findQuoteSpan(a.quote, sourceText) ?? a.quote });
  }
  return { rules, personal_checkin_items: items, actions, dropped, valid: true };
}

const CONF_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * Task H guardrails: schema, quote verification, confidence ≥ cfg.ctxMinConf, dates resolved
 * here from the hints, `kind` taken from docs/04 §6. Returns null when nothing usable was found.
 * A hint that is not in the source text is treated as unknown.
 */
export function verifyContext(raw: unknown, sourceText: string, today: string, cfg: Config = defaultConfig): VerifiedContext | null {
  if (!validate("H", raw).valid) return null;
  const h = raw as { context: string; start_hint: string; end_hint: string; confidence: "low" | "medium" | "high"; quote: string };
  if (h.context === "none") return null;
  const row = CONTEXT_TABLE[h.context];
  if (!row) return null;
  if (!verifyQuote(h.quote, sourceText)) return null;
  if (CONF_RANK[h.confidence] < CONF_RANK[cfg.ctxMinConf]) return null;
  const hint = (x: string) => (x && x.toLowerCase() !== "unknown" && verifyQuote(x, sourceText) ? x : "unknown");
  const p = resolveContextPeriod(hint(h.start_hint), hint(h.end_hint), today, row.kind, cfg);
  return {
    type: h.context,
    kind: row.kind,
    start: p.start,
    end: p.end,
    quote: h.quote,
    confidence: h.confidence,
    startResolved: p.startResolved,
    endResolved: p.endResolved,
  };
}

/** Task B guardrails: schema only. Markers are display data (rule R6). */
export function verifyMarkers(raw: unknown): DiaryMarkers | null {
  if (!validate("B", raw).valid) return null;
  const b = raw as DiaryMarkers;
  return { ...b, themes: [...b.themes] };
}

// ---------- the other tasks ----------

/** Context the checks of one task need. Everything is optional; missing context fails closed. */
export interface VerifyContext {
  sourceText?: string;
  facts?: unknown; // the model input, for the number check
  today?: string;
  cfg?: Config;
  actionIds?: string[]; // task K
  itemIds?: string[]; // task I
  placeLabels?: string[]; // task P
  contactName?: string | null; // task P
  variant?: "full" | "lite"; // task D
  signIds?: string[]; // task R
}

export type VerifyResult = { ok: true; value: unknown } | { ok: false; reason: string };

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** A symptom question in a check-in intro (task A): a question mark next to a symptom word. */
const SYMPTOM_WORDS = /\b(sleep|sleeping|appetite|eating|mood|sad|sadness|hopeless|anxious|anxiety|tired|energy|suicid|harm|worthless|guilt|concentrat|interest|pleasure)\w*/i;

function prose(text: string, facts: unknown): string | null {
  if (hasBannedWords(text)) return "banned_word";
  if (!numberCheck(text, facts ?? {}).ok) return "unknown_number";
  return null;
}

/**
 * Validate a model output for any task (R8): schema, then the task's own checks.
 * Task G and H have richer results through verifyPlan / verifyContext; here they only pass
 * when at least something usable survives.
 */
export function verifyTask(task: TaskId | "Q_classify" | "Q_phrase", raw: unknown, ctx: VerifyContext = {}): VerifyResult {
  const cfg = ctx.cfg ?? defaultConfig;
  switch (task) {
    case "G2": {
      if (!validate("G2", raw).valid) return { ok: false, reason: "schema" };
      const t = (raw as { text: string }).text.trim();
      return t ? { ok: true, value: { text: t } } : { ok: false, reason: "empty" };
    }
    case "G": {
      const plan = verifyPlan(raw, ctx.sourceText ?? "", cfg);
      if (!plan.valid) return { ok: false, reason: "schema" };
      return { ok: true, value: plan };
    }
    case "H": {
      if (!validate("H", raw).valid) return { ok: false, reason: "schema" };
      if ((raw as { context: string }).context === "none") return { ok: true, value: null };
      const v = verifyContext(raw, ctx.sourceText ?? "", ctx.today ?? "1970-01-01", cfg);
      // A context that fails its checks is "nothing found", not a broken output.
      return { ok: true, value: v };
    }
    case "B": {
      const m = verifyMarkers(raw);
      return m ? { ok: true, value: m } : { ok: false, reason: "schema" };
    }
    case "A": {
      if (!validate("A", raw).valid) return { ok: false, reason: "schema" };
      const intro = (raw as { intro: string }).intro;
      const bad = prose(intro, ctx.facts);
      if (bad) return { ok: false, reason: bad };
      if (intro.includes("?") && SYMPTOM_WORDS.test(intro)) return { ok: false, reason: "symptom_question" };
      if (intro.trim().length === 0) return { ok: false, reason: "empty" };
      return { ok: true, value: raw };
    }
    case "C": {
      if (!validate("C", raw).valid) return { ok: false, reason: "schema" };
      const text = (raw as { explanation: string }).explanation;
      if (words(text) > 80) return { ok: false, reason: "too_long" };
      const bad = prose(text, ctx.facts);
      return bad ? { ok: false, reason: bad } : { ok: true, value: raw };
    }
    case "D": {
      if (!validate("D", raw).valid) return { ok: false, reason: "schema" };
      const d = raw as { reflection: string; open_question: string };
      const limit = ctx.variant === "lite" ? 60 : 250;
      if (words(d.reflection) > limit) return { ok: false, reason: "too_long" };
      const bad = prose(`${d.reflection} ${d.open_question}`, ctx.facts);
      return bad ? { ok: false, reason: bad } : { ok: true, value: raw };
    }
    case "E": {
      if (!validate("E", raw).valid) return { ok: false, reason: "schema" };
      const e = raw as { summary: string; timeline: { iso_week: string; note: string }[]; questions_to_bring: string[] };
      if (words(e.summary) > 120) return { ok: false, reason: "too_long" };
      const all = [e.summary, ...e.timeline.map((t) => t.note), ...e.questions_to_bring].join(" ");
      const bad = prose(all, ctx.facts);
      return bad ? { ok: false, reason: bad } : { ok: true, value: raw };
    }
    case "K": {
      if (!validate("K", raw).valid) return { ok: false, reason: "schema" };
      const ids = (raw as { action_ids: string[] }).action_ids;
      const allowed = new Set(ctx.actionIds ?? []);
      if (!ids.every((id) => allowed.has(id))) return { ok: false, reason: "unknown_id" };
      return { ok: true, value: { action_ids: [...new Set(ids)] } };
    }
    case "I": {
      if (!validate("I", raw).valid) return { ok: false, reason: "schema" };
      const allowed = new Set(ctx.itemIds ?? []);
      const answers = (raw as { answers: { item_id: string; answer: string; quote: string }[] }).answers;
      const kept = answers.filter((a) => allowed.has(a.item_id) && (a.answer === "not_mentioned" || verifyQuote(a.quote, ctx.sourceText ?? "")));
      return { ok: true, value: { answers: kept } };
    }
    case "P": {
      if (!validate("P", raw).valid) return { ok: false, reason: "schema" };
      const note = (raw as { note: string }).note;
      if (hasBannedWords(note)) return { ok: false, reason: "banned_word" };
      const pii = piiCheck(note, { placeLabels: ctx.placeLabels, contactName: ctx.contactName });
      return pii.ok ? { ok: true, value: raw } : { ok: false, reason: `pii:${pii.reasons.join(",")}` };
    }
    case "R": {
      // Recall: only the user's own signs, and only with a quote that is really in their text.
      if (!validate("R", raw).valid) return { ok: false, reason: "schema" };
      const allowed = new Set(ctx.signIds ?? []);
      const seen = new Set<string>();
      const matches = (raw as { matches: { sign_id: string; quote: string }[] }).matches.filter((m) => {
        if (!allowed.has(m.sign_id) || seen.has(m.sign_id) || !verifyQuote(m.quote, ctx.sourceText ?? "") || quoteDropsNegation(m.quote, ctx.sourceText ?? "")) return false;
        seen.add(m.sign_id);
        return true;
      }).map((m) => ({ sign_id: m.sign_id, quote: findQuoteSpan(m.quote, ctx.sourceText ?? "") ?? m.quote }));
      return { ok: true, value: { matches } };
    }
    case "T": {
      if (!validate("T", raw).valid) return { ok: false, reason: "schema" };
      const message = (raw as { message: string }).message.trim();
      if (!message) return { ok: false, reason: "empty" };
      if (words(message) > 40) return { ok: false, reason: "too_long" };
      const bad = prose(message, ctx.facts);
      return bad ? { ok: false, reason: bad } : { ok: true, value: { message } };
    }
    case "Q":
    case "Q_classify":
      return validate("Q_classify", raw).valid ? { ok: true, value: raw } : { ok: false, reason: "schema" };
    case "Q_phrase": {
      if (!validate("Q_phrase", raw).valid) return { ok: false, reason: "schema" };
      const text = (raw as { answer: string }).answer;
      if (words(text) > 60) return { ok: false, reason: "too_long" };
      const bad = prose(text, ctx.facts);
      return bad ? { ok: false, reason: bad } : { ok: true, value: raw };
    }
  }
  return { ok: false, reason: "unknown_task" };
}

export { resolveDateHint };
