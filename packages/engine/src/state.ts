import type {
  Action,
  Config,
  ContextLabel,
  DailyUpdateInput,
  DailyUpdateOutput,
  DayRecord,
  DayType,
  Domain,
  EngineState,
  FeatureDay,
  FeatureId,
  QuestionnaireRecord,
  CheckinRecord,
  QuestionnaireResult,
} from "./types";
import { mean, nextRandom, sd, seedRng } from "./stats";
import { addDays, dateOfTimestamp, daysBetween } from "./time";
import { buildEligibility, comparisonValues, featureFloor, referenceSet, referenceStats, robustZ, type EligibleDay } from "./baseline";
import { CONTEXT_TABLE, effectiveEnd, maskedDomains, stressorActive } from "./context";
import { controlLimit, updateControl } from "./control";
import { computeFeatures, indexRaws } from "./features/index";
import { featureDef } from "./features/catalogue";
import { findHome, learnPlaces } from "./features/mobility";
import { buildContributors, directionOf, scoreFromZ } from "./index-score";
import { updatePersonal, weightedIndex } from "./weights";
import { responseSignal } from "./response";

export function initialState(seed = 1): EngineState {
  return {
    state: "WARM_UP",
    S: 0,
    C: 0,
    mu0: null,
    sigma0: null,
    mu0Daily: null,
    sigma0Daily: null,
    daysNotElevated: 0,
    anchor: null,
    lastDriftCheck: null,
    places: [],
    homePlaceId: null,
    ignoredStreak: 0,
    rngState: seedRng(seed),
    lastProcessedDate: null,
  };
}

/**
 * Apply a finished PHQ-9 to the state straight away (docs/06 §3.3): flagged → CONFIRMED,
 * not flagged while CONFIRMED → MONITOR. `dailyUpdate` applies the same rule the next day,
 * so calling this is optional; it lets the app show the right screen immediately.
 */
export function applyQuestionnaireResult(state: EngineState, result: QuestionnaireResult, opts: { baseline?: boolean } = {}): EngineState {
  if (result.id !== "PHQ9" || opts.baseline) return state;
  if (result.flagged) return { ...state, state: "CONFIRMED" };
  if (state.state === "CONFIRMED") {
    const defined = state.mu0 !== null;
    return { ...state, state: defined ? "MONITOR" : "WARM_UP", S: defined ? (state.mu0 as number) : 0, C: 0, daysNotElevated: 0 };
  }
  return state;
}

function latestOf(qs: QuestionnaireRecord[], instrument: string, onOrBefore: string): QuestionnaireRecord | null {
  let best: QuestionnaireRecord | null = null;
  for (const q of qs) {
    if (q.instrument !== instrument || dateOfTimestamp(q.takenAt) > onOrBefore) continue;
    if (!best || q.takenAt > best.takenAt) best = q;
  }
  return best;
}

/** docs/04 §7.3, momentary signals: 2 of the last 3 answered check-ins within 7 days. */
export function momentarySignal(checkins: CheckinRecord[], date: string, cfg: Config): boolean {
  const recent = checkins
    .filter((c) => c.answeredAt !== null)
    .filter((c) => {
      const d = daysBetween(dateOfTimestamp(c.answeredAt as string), date);
      return d >= 0 && d < 7;
    })
    .sort((a, b) => ((a.answeredAt as string) < (b.answeredAt as string) ? 1 : -1))
    .slice(0, 3);
  const high = recent.filter(
    (c) => (typeof c.answers.mood_low === "number" && c.answers.mood_low >= cfg.emaHigh) || (typeof c.answers.enjoyment === "number" && c.answers.enjoyment <= cfg.emaLow),
  );
  return high.length >= 2;
}

/**
 * PHQ-2 cooldown (docs/04 §7.3). A PHQ-9 covers the PHQ-2 items, so a recent PHQ-9 also
 * starts the cooldown (docs/DECISIONS.md, M4).
 */
export function phq2CooldownOver(questionnaires: QuestionnaireRecord[], date: string, cfg: Config): boolean {
  const last2 = latestOf(questionnaires, "PHQ2", date);
  const last9 = latestOf(questionnaires, "PHQ9", date);
  const ok = (q: QuestionnaireRecord | null) => !q || daysBetween(dateOfTimestamp(q.takenAt), date) >= cfg.phq2CooldownDays;
  return ok(last2) && ok(last9);
}

interface RefProvider {
  values(feature: FeatureId, dayType: DayType, restSource: FeatureDay["restSource"]): number[] | null;
  pooled(feature: FeatureId, restSource: FeatureDay["restSource"]): number[] | null;
}

function makeRefProvider(days: EligibleDay[], cfg: Config): RefProvider {
  const cache = new Map<string, ReturnType<typeof referenceSet>>();
  const get = (feature: FeatureId, restSource: FeatureDay["restSource"]) => {
    const key = `${feature}|${restSource}`;
    let ref = cache.get(key);
    if (!ref) {
      ref = referenceSet(feature, days, restSource, cfg);
      cache.set(key, ref);
    }
    return ref;
  };
  return {
    values: (feature, dayType, restSource) => comparisonValues(get(feature, restSource), dayType, cfg),
    pooled: (feature, restSource) => {
      const ref = get(feature, restSource);
      return ref.length >= cfg.minReferenceDays ? ref.map((r) => r.value) : null;
    },
  };
}

/** z-scores of the usable, unmasked features of one day against the given references. */
function zScores(
  features: FeatureDay,
  masked: Set<Domain>,
  rollMasked: Set<Domain>,
  refs: RefProvider,
  cfg: Config,
): Record<FeatureId, number | null> {
  const z: Record<FeatureId, number | null> = {};
  for (const [feature, value] of Object.entries(features.values)) {
    const def = featureDef(feature);
    z[feature] = null;
    if (!def || value === null || value === undefined) continue;
    if (masked.has(def.domain)) continue;
    // A rolling feature is not usable while its 7-day window still contains masked days.
    if (def.win === "roll7" && rollMasked.has(def.domain)) continue;
    const values = refs.values(feature, features.dayType, features.restSource);
    if (!values) continue;
    z[feature] = robustZ(value, values, featureFloor(feature, cfg));
  }
  return z;
}

function domainsMaskedInWindow(date: string, contexts: ContextLabel[], stored: Map<string, DayRecord>, cfg: Config): Set<Domain> {
  const out = new Set<Domain>();
  for (let k = 0; k < 7; k++) {
    const d = addDays(date, -k);
    for (const dom of maskedDomains(d, contexts, cfg)) out.add(dom);
    for (const dom of stored.get(d)?.maskedDomains ?? []) out.add(dom);
  }
  return out;
}

/** The daily update, docs/04 §8. Pure: same input, same output. */
export function dailyUpdate(input: DailyUpdateInput): DailyUpdateOutput {
  const { date, cfg, rules, contexts, questionnaires, checkins } = input;
  const existing = input.history.find((r) => r.date === date);
  if (existing) return { record: existing, state: input.state, actions: [] };

  const state: EngineState = JSON.parse(JSON.stringify(input.state));
  const history = input.history.filter((r) => r.date < date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const stored = new Map(history.map((r) => [r.date, r]));
  const byDate = indexRaws(input.raws);
  const prevRecord = history.length > 0 ? history[history.length - 1] : null;
  const learnOnly = input.learnOnly === true;

  // A finished `moving` label clears the learned places (docs/04 §6).
  for (const c of contexts) {
    if (c.confirmed && c.type === "moving" && addDays(effectiveEnd(c, cfg), 1) === date) {
      state.places = [];
      state.homePlaceId = null;
    }
  }

  // 1. Features.
  state.places = learnPlaces(state.places, byDate.get(date), cfg);
  state.homePlaceId = findHome(state.places, byDate, date, cfg);
  const features = computeFeatures(input.raws, date, cfg, { places: state.places, homePlaceId: state.homePlaceId, rules });

  // 2. Masks.
  const masks = maskedDomains(date, contexts, cfg);

  // 3–4. Reference sets, z, r, domain scores, index. Personal domain weights (docs/04 §4.4)
  // apply once they have moved away from equal.
  const learned = state.personal?.weights;
  const weights = learned && Object.keys(learned).length > 0 ? learned : null;
  const eligible = buildEligibility(history, date, contexts, questionnaires, cfg);
  const refs = makeRefProvider(eligible, cfg);
  const z = zScores(features, new Set(masks), domainsMaskedInWindow(date, contexts, stored, cfg), refs, cfg);
  const scores = scoreFromZ(z, rules, cfg, weights);
  const contributors = buildContributors(
    z,
    scores.r,
    rules,
    cfg,
    history,
    state.places,
    (f) => {
      const v = refs.values(f, features.dayType, features.restSource);
      return v ? (referenceStats(v, 0)?.median ?? null) : null;
    },
    features.values,
    features.restSource,
    weights,
  );

  // 5. In-control parameters, then EWMA and CUSUM.
  const wasWarmUp = state.state === "WARM_UP";
  if (state.state === "WARM_UP" || state.state === "MONITOR") {
    const ds: number[] = [];
    const dds: number[] = [];
    for (const day of eligible) {
      if (ds.length >= cfg.baselineWindowDays) break;
      if (!day.base) continue;
      // With personal weights the reference days are re-weighted from their stored domain
      // scores, so a weight change does not move the limit by itself (docs/04 §4.4).
      let D = weights && day.record.D !== null ? weightedIndex(day.record.domainScores, weights, cfg.minDomains) : day.record.D;
      let Dd = day.record.D_daily;
      if (D === null && day.record.state === "WARM_UP") {
        // Warm-up days have no stored index. Score them against today's reference so the
        // in-control parameters exist as soon as the features are usable.
        const past = scoreFromZ(zScores(day.record.features, day.masked, domainsMaskedInWindow(day.record.date, contexts, stored, cfg), refs, cfg), rules, cfg, weights);
        D = past.D;
        Dd = past.D_daily;
      }
      if (D !== null) {
        ds.push(D);
        if (Dd !== null) dds.push(Dd);
      }
    }
    if (ds.length >= cfg.minReferenceDays) {
      state.mu0 = mean(ds) as number;
      state.sigma0 = Math.max(sd(ds) as number, cfg.sigmaFloor);
      if (dds.length >= cfg.minReferenceDays) {
        state.mu0Daily = mean(dds) as number;
        state.sigma0Daily = Math.max(sd(dds) as number, cfg.sigmaFloor);
      }
    }
  }

  let elevated = false;
  let UCL: number | null = null;
  if (state.mu0 !== null && state.sigma0 !== null) {
    // Detection starts fresh on the first day after the learned history (docs/04 §8.1).
    if (!learnOnly && prevRecord?.learnOnly) {
      state.S = state.mu0;
      state.C = 0;
    }
    if (wasWarmUp) {
      state.S = state.mu0;
      state.C = 0;
    }
    const next = updateControl({ S: state.S, C: state.C, elevated: prevRecord?.elevated ?? false }, scores.D, state.mu0, state.sigma0, cfg);
    state.S = next.S;
    state.C = next.C;
    elevated = next.elevated && !learnOnly;
    UCL = controlLimit(state.mu0, state.sigma0, cfg);
  }

  // 6. State machine (docs/04 §7).
  const actions: Action[] = [];
  if (state.state === "WARM_UP" && state.mu0 !== null) {
    state.state = "MONITOR";
    state.anchor = { date, stats: anchorStats(features, refs, cfg) };
    state.lastDriftCheck = date;
  }
  // The onboarding PHQ-9 is a starting point, not a change (docs/06 §3.4).
  const lastPhq9 = latestOf(questionnaires.filter((q) => !q.baseline), "PHQ9", date);
  if (lastPhq9?.result.flagged) {
    state.state = "CONFIRMED";
  } else if (state.state === "CONFIRMED") {
    state.state = state.mu0 !== null ? "MONITOR" : "WARM_UP";
    if (state.mu0 !== null) {
      state.S = state.mu0;
      state.C = 0;
      elevated = false;
    }
    state.daysNotElevated = 0;
  }
  if (state.state === "MONITOR" && elevated) {
    state.state = "ELEVATED";
    state.daysNotElevated = 0;
  } else if (state.state === "ELEVATED") {
    if (elevated) state.daysNotElevated = 0;
    else {
      state.daysNotElevated += 1;
      if (state.daysNotElevated >= cfg.recoveryDays) {
        state.state = "MONITOR";
        state.daysNotElevated = 0;
      }
    }
  }

  // Re-anchor after a PHQ-9 below 5 while in MONITOR (docs/04 §3.4 b).
  if (state.state === "MONITOR" && state.anchor && lastPhq9 && lastPhq9.result.total < 5) {
    const taken = dateOfTimestamp(lastPhq9.takenAt);
    if (taken > state.anchor.date) {
      state.anchor = { date, stats: anchorStats(features, refs, cfg) };
      state.lastDriftCheck = date;
    }
  }

  // 7. Weekly drift check.
  let drift = false;
  if (state.anchor && state.state !== "WARM_UP") {
    const since = daysBetween(state.anchor.date, date);
    if (since > 0 && since % 7 === 0 && state.lastDriftCheck !== date) {
      state.lastDriftCheck = date;
      drift = driftExceeded(state.anchor.stats, features, refs, rules, cfg);
    }
  }

  // Unanswered check-ins compared with the person's usual (docs/04 §7.5), when the app opts in.
  const response = input.responses ? responseSignal(input.responses, contexts, date, cfg) : null;

  // 8. Actions.
  const sameDay = (c: CheckinRecord) => dateOfTimestamp(c.scheduledAt) === date;
  const inWeek = (c: CheckinRecord) => {
    const d = daysBetween(dateOfTimestamp(c.scheduledAt), date);
    return d >= 0 && d < 7;
  };
  const limitsOk = checkins.filter(sameDay).length < cfg.maxCheckinsPerDay && checkins.filter(inWeek).length < cfg.maxCheckinsPerWeek;
  const earlier = checkins.filter((c) => dateOfTimestamp(c.scheduledAt) < date).sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1));
  let ignored = 0;
  for (const c of earlier) {
    if (c.answeredAt === null) ignored++;
    else break;
  }
  state.ignoredStreak = ignored;
  const draw = nextRandom(state.rngState);
  state.rngState = draw.state;
  if (state.state === "ELEVATED" && limitsOk) {
    actions.push({ type: "schedule_checkin", kind: "triggered", reasons: contributors });
  } else if (limitsOk) {
    let p = stressorActive(date, contexts, cfg) ? cfg.stressCheckinProb : cfg.randomCheckinProb;
    if (ignored >= cfg.ignoredBeforeBackoff) p /= 2;
    if (draw.value < p) actions.push({ type: "schedule_checkin", kind: "random", reasons: [] });
  }

  if (state.state === "CONFIRMED") {
    if (lastPhq9 && daysBetween(dateOfTimestamp(lastPhq9.takenAt), date) >= cfg.phq9IntervalDays) {
      actions.push({ type: "offer_questionnaire", id: "PHQ9", reason: "interval" });
    }
  } else {
    const lastPhq2 = latestOf(questionnaires, "PHQ2", date);
    const phq9Pending = lastPhq2 !== null && lastPhq2.result.positive && (!lastPhq9 || lastPhq9.takenAt < lastPhq2.takenAt);
    if (phq9Pending) {
      actions.push({ type: "offer_questionnaire", id: "PHQ9", reason: "persistent" });
    } else if (phq2CooldownOver(questionnaires, date, cfg)) {
      let persistent = false;
      if (state.state === "ELEVATED" && state.mu0Daily !== null && state.sigma0Daily !== null) {
        const limit = state.mu0Daily + state.sigma0Daily;
        const window = [...history.slice(-(cfg.persistWindow - 1)).map((r) => r.D_daily), scores.D_daily];
        persistent = window.filter((d) => d !== null && d > limit).length >= cfg.persistDays;
      }
      if (persistent) actions.push({ type: "offer_questionnaire", id: "PHQ2", reason: "persistent" });
      else if (momentarySignal(checkins, date, cfg)) actions.push({ type: "offer_questionnaire", id: "PHQ2", reason: "momentary" });
      else if (response?.status === "fewer_answers") actions.push({ type: "offer_questionnaire", id: "PHQ2", reason: "unanswered" });
      else if (drift) actions.push({ type: "offer_questionnaire", id: "PHQ2", reason: "drift" });
    }
  }

  if (state.state === "ELEVATED" || state.state === "CONFIRMED") actions.push({ type: "show_plan" });

  for (const c of contexts) {
    if (c.confirmed && CONTEXT_TABLE[c.type]?.kind === "explains_sensors" && addDays(effectiveEnd(c, cfg), 1) === date) {
      actions.push({ type: "context_expired", contextId: c.id });
    }
  }

  // Personal domain weights: new samples, and the weekly update in MONITOR (docs/04 §4.4).
  if (input.personal) {
    state.personal = updatePersonal(state.personal, {
      date,
      state: state.state,
      checkins,
      days: [...history.map((r) => ({ date: r.date, domainScores: r.domainScores })), { date, domainScores: scores.domainScores }],
      audit: input.personal.audit,
      cfg,
    });
  }

  state.lastProcessedDate = date;
  const record: DayRecord = {
    date,
    features,
    z,
    r: scores.r,
    domainScores: scores.domainScores,
    maskedDomains: masks,
    D: scores.D,
    D_daily: scores.D_daily,
    P: scores.P,
    S: state.S,
    C: state.C,
    UCL,
    mu0: state.mu0,
    sigma0: state.sigma0,
    elevated,
    contributors,
    state: state.state,
  };
  if (response) record.response = response;
  if (learnOnly) {
    record.learnOnly = true;
    // Check-ins, questionnaires and plan prompts from before the install were never seen.
    return { record, state, actions: [] };
  }
  return { record, state, actions };
}

function anchorStats(features: FeatureDay, refs: RefProvider, cfg: Config): Record<FeatureId, { median: number; scale: number }> {
  const out: Record<FeatureId, { median: number; scale: number }> = {};
  for (const feature of Object.keys(features.values)) {
    const values = refs.pooled(feature, features.restSource);
    if (!values) continue;
    const st = referenceStats(values, featureFloor(feature, cfg));
    if (st && st.scale > 0) out[feature] = st;
  }
  return out;
}

/** docs/04 §3.4: mean risk-directed shift of the reference medians per domain, in anchor scale units. */
function driftExceeded(
  anchor: Record<FeatureId, { median: number; scale: number }>,
  features: FeatureDay,
  refs: RefProvider,
  rules: DailyUpdateInput["rules"],
  cfg: Config,
): boolean {
  const perDomain = new Map<Domain, number[]>();
  for (const [feature, a] of Object.entries(anchor)) {
    const def = featureDef(feature);
    const values = refs.pooled(feature, features.restSource);
    if (!def || !values) continue;
    const now = referenceStats(values, 0);
    if (!now) continue;
    const shift = (now.median - a.median) / a.scale;
    const dir = directionOf(feature, rules);
    const directed = dir === "+" ? Math.max(0, shift) : dir === "-" ? Math.max(0, -shift) : Math.abs(shift);
    const list = perDomain.get(def.domain) ?? [];
    list.push(directed);
    perDomain.set(def.domain, list);
  }
  for (const list of perDomain.values()) {
    if ((mean(list) as number) > cfg.driftThreshold) return true;
  }
  return false;
}
