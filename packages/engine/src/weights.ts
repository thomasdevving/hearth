import type { AuditResult, CheckinRecord, Config, Domain, PersonalWeights, State, WeightSample, WeightStatus } from "./types";
import { DOMAINS } from "./features/catalogue";
import { mean } from "./stats";
import { addDays, dateOfTimestamp, daysBetween } from "./time";

/**
 * Personal domain weights (docs/04 §4.4). Pure functions: the same samples give the same
 * weights. Learned from random check-ins only, pulled towards equal weights, bounded, and
 * moved in small steps, so the index stays linear and explainable.
 */

export type DomainWeights = Partial<Record<Domain, number>>;

/** The weight of a domain; a missing one weighs 1. */
export function weightOf(weights: DomainWeights | null | undefined, domain: Domain): number {
  const w = weights?.[domain];
  return typeof w === "number" && Number.isFinite(w) ? w : 1;
}

/** D from domain scores (docs/04 §4.3): the weighted mean over the present domains. */
export function weightedIndex(domainScores: Partial<Record<Domain, number>>, weights: DomainWeights | null | undefined, minDomains: number): number | null {
  let num = 0;
  let den = 0;
  let present = 0;
  for (const d of DOMAINS) {
    const g = domainScores[d];
    if (g === undefined || g === null) continue;
    const w = weightOf(weights, d);
    num += w * g;
    den += w;
    present++;
  }
  return present >= minDomains && den > 0 ? num / den : null;
}

interface DayScores {
  date: string;
  domainScores: Partial<Record<Domain, number>>;
}

/**
 * Adds a sample for every answered random check-in not seen before, whose day is in the
 * last `weightSampleLookbackDays` days and has stored domain scores; drops old samples.
 */
export function collectSamples(prev: WeightSample[], checkins: CheckinRecord[], days: DayScores[], date: string, cfg: Config): WeightSample[] {
  const seen = new Set(prev.map((s) => s.checkinId));
  const byDate = new Map(days.map((d) => [d.date, d.domainScores]));
  const added: WeightSample[] = [];
  const candidates = checkins
    .filter((c) => c.kind === "random" && c.answeredAt !== null && typeof c.answers.mood_low === "number" && !seen.has(c.id))
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : a.id < b.id ? -1 : 1));
  for (const c of candidates) {
    const s = dateOfTimestamp(c.scheduledAt);
    const age = daysBetween(s, date);
    if (age < 0 || age >= cfg.weightSampleLookbackDays) continue;
    const x: Partial<Record<Domain, number>> = {};
    for (const d of DOMAINS) {
      const vals: number[] = [];
      for (let k = cfg.weightSampleDays - 1; k >= 0; k--) {
        const g = byDate.get(addDays(s, -k))?.[d];
        if (g !== undefined && g !== null) vals.push(g);
      }
      if (vals.length > 0) x[d] = mean(vals) as number;
    }
    if (Object.keys(x).length === 0) continue;
    added.push({ checkinId: c.id, date: s, y: c.answers.mood_low as number, x });
  }
  const all = [...prev, ...added]
    .filter((smp) => daysBetween(smp.date, date) < cfg.weightWindowDays)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.checkinId < b.checkinId ? -1 : 1));
  return all.slice(Math.max(0, all.length - cfg.weightMaxSamples));
}

/** Solves A·x = b (Gaussian elimination with partial pivoting). Null if A is singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

interface Design {
  domains: Domain[];
  X: number[][]; // n × K, missing values replaced by the domain's mean
  y: number[];
}

function design(samples: WeightSample[]): Design {
  const n = samples.length;
  const domains = DOMAINS.filter((d) => samples.filter((s) => s.x[d] !== undefined).length * 2 >= n);
  const means = domains.map((d) => mean(samples.map((s) => s.x[d]).filter((v): v is number => v !== undefined)) as number);
  const X = samples.map((s) => domains.map((d, k) => s.x[d] ?? means[k]));
  return { domains, X, y: samples.map((s) => s.y) };
}

/** Ridge regression whose penalty pulls each slope towards the mean slope (docs/04 §4.4). */
function fitSlopes(X: number[][], y: number[], shrinkage: number): { beta: number[]; xMean: number[]; yMean: number } | null {
  const n = X.length;
  const K = X[0]?.length ?? 0;
  if (n === 0 || K === 0) return null;
  const xMean = Array.from({ length: K }, (_, k) => X.reduce((a, row) => a + row[k], 0) / n);
  const yMean = y.reduce((a, v) => a + v, 0) / n;
  const Xc = X.map((row) => row.map((v, k) => v - xMean[k]));
  const yc = y.map((v) => v - yMean);
  const XtX = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => Xc.reduce((a, row) => a + row[i] * row[j], 0)));
  const Xty = Array.from({ length: K }, (_, i) => Xc.reduce((a, row, r) => a + row[i] * yc[r], 0));
  const trace = XtX.reduce((a, row, i) => a + row[i], 0);
  if (trace <= 0) return null;
  const lambda = (shrinkage * trace) / K;
  const eps = 1e-9 * trace;
  // P = I − (1/K)·11ᵀ penalises the deviation of each slope from the mean slope.
  const A = XtX.map((row, i) => row.map((v, j) => v + lambda * ((i === j ? 1 : 0) - 1 / K) + (i === j ? eps : 0)));
  const beta = solveLinear(A, Xty);
  return beta ? { beta, xMean, yMean } : null;
}

/** Equal-weight model: y ≈ a + c · mean_k x_k (ordinary least squares). */
function fitEqual(X: number[][], y: number[]): { a: number; c: number } {
  const z = X.map((row) => row.reduce((a, v) => a + v, 0) / row.length);
  const zm = z.reduce((a, v) => a + v, 0) / z.length;
  const ym = y.reduce((a, v) => a + v, 0) / y.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < z.length; i++) {
    sxy += (z[i] - zm) * (y[i] - ym);
    sxx += (z[i] - zm) ** 2;
  }
  const c = sxx > 0 ? sxy / sxx : 0;
  return { a: ym - c * zm, c };
}

/** Clamps to [lo, hi] and rescales to mean 1, repeated until stable. */
export function boundWeights(u: number[], lo: number, hi: number): number[] {
  let w = [...u];
  for (let it = 0; it < 50; it++) {
    w = w.map((v) => Math.min(hi, Math.max(lo, v)));
    const m = w.reduce((a, v) => a + v, 0) / w.length;
    const next = w.map((v) => v / m);
    const done = next.every((v, i) => Math.abs(v - w[i]) < 1e-9);
    w = next;
    if (done) break;
  }
  return w.map((v) => Math.min(hi, Math.max(lo, v)));
}

export interface WeightFit {
  ok: boolean;
  target: DomainWeights; // {} when not ok
  gain: number | null;
  meanSlope: number | null;
}

/**
 * Learns the target weights from the samples, with the leave-one-out gate (docs/04 §4.4).
 * `minGain` defaults to `weightMinGain`; weights that are already active only need to be no
 * worse than equal weights (hysteresis), so they do not flicker on and off.
 */
export function fitDomainWeights(samples: WeightSample[], cfg: Config, minGain = cfg.weightMinGain): WeightFit {
  const none: WeightFit = { ok: false, target: {}, gain: null, meanSlope: null };
  if (samples.length < 3) return none;
  const { domains, X, y } = design(samples);
  if (domains.length < 2) return none;
  const fit = fitSlopes(X, y, cfg.weightShrinkage);
  if (!fit) return none;
  const meanSlope = fit.beta.reduce((a, v) => a + v, 0) / fit.beta.length;

  // Leave-one-out: does the weighted model predict mood_low better than equal weights?
  let seW = 0;
  let seE = 0;
  for (let i = 0; i < X.length; i++) {
    const Xi = X.filter((_, r) => r !== i);
    const yi = y.filter((_, r) => r !== i);
    const f = fitSlopes(Xi, yi, cfg.weightShrinkage);
    const e = fitEqual(Xi, yi);
    const predW = f ? f.yMean + X[i].reduce((a, v, k) => a + f.beta[k] * (v - f.xMean[k]), 0) : e.a + e.c * (X[i].reduce((a, v) => a + v, 0) / X[i].length);
    const predE = e.a + e.c * (X[i].reduce((a, v) => a + v, 0) / X[i].length);
    seW += (y[i] - predW) ** 2;
    seE += (y[i] - predE) ** 2;
  }
  const gain = seE > 0 ? 1 - seW / seE : 0;
  if (!(meanSlope > 0) || gain < minGain) return { ok: false, target: {}, gain, meanSlope };
  const u = boundWeights(fit.beta.map((b) => b / meanSlope), cfg.weightMin, cfg.weightMax);
  const target: DomainWeights = {};
  domains.forEach((d, k) => (target[d] = round4(u[k])));
  return { ok: true, target, gain, meanSlope };
}

/** Moves every weight towards its target by at most `step`. */
export function stepWeights(current: DomainWeights, target: DomainWeights, step: number): DomainWeights {
  const out: DomainWeights = {};
  for (const d of DOMAINS) {
    const c = weightOf(current, d);
    const t = weightOf(target, d);
    const next = c + Math.max(-step, Math.min(step, t - c));
    if (Math.abs(next - 1) > 1e-9) out[d] = round4(next);
  }
  return out;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function initialPersonal(): PersonalWeights {
  return { weights: {}, target: {}, status: "collecting", n: 0, gain: null, updatedOn: null, samples: [] };
}

/**
 * One day of learning (docs/04 §4.4): take new samples; once every `weightUpdateDays` and only
 * in MONITOR, refit and step the weights towards the target.
 */
export function updatePersonal(
  prev: PersonalWeights | undefined,
  args: { date: string; state: State; checkins: CheckinRecord[]; days: DayScores[]; audit: AuditResult; cfg: Config },
): PersonalWeights {
  const { date, state, checkins, days, audit, cfg } = args;
  const base = prev ?? initialPersonal();
  const samples = collectSamples(base.samples, checkins, days, date, cfg);
  const next: PersonalWeights = { ...base, samples, n: samples.length };
  const due = base.updatedOn === null || daysBetween(base.updatedOn, date) >= cfg.weightUpdateDays;
  if (state !== "MONITOR" || !due) return next; // status and weights wait for the next update
  let status: WeightStatus;
  let target: DomainWeights = {};
  let gain: number | null = null;
  if (samples.length < cfg.weightMinSamples) status = "collecting";
  else if (audit.status !== "informative") status = "waiting_for_audit";
  else {
    const fit = fitDomainWeights(samples, cfg, base.status === "active" ? 0 : cfg.weightMinGain);
    gain = fit.gain === null ? null : round4(fit.gain);
    if (fit.ok) {
      status = "active";
      target = fit.target;
    } else status = "no_clear_pattern";
  }
  return { ...next, status, target, gain, updatedOn: date, weights: stepWeights(base.weights, target, cfg.weightMaxStep) };
}
