// Unanswered check-ins as a signal (docs/04 §7.5). Leaving check-ins unanswered more often
// than usual can itself be an early sign of a low period. Hearth compares the share left
// unanswered in the last `responseRecentDays` with the person's own usual share before that.
import type { CheckinRecord, Config, ContextLabel, ResponseSignal } from "./types";
import { contextActive, contextKind } from "./context";
import { addDays, dateOfTimestamp } from "./time";

/** P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let sum = 0;
  let coef = 1; // C(n, i), built up from C(n, 0)
  for (let i = 0; i <= n; i++) {
    if (i > 0) coef = (coef * (n - i + 1)) / i;
    if (i >= k) sum += coef * p ** i * (1 - p) ** (n - i);
  }
  return Math.min(1, sum);
}

/**
 * The response signal on `date`, from every check-in scheduled before that date (one from
 * today may still be answered). Days covered by a confirmed label that explains the sensors
 * (holiday, travel, visitors, ill, moving) are left out of both windows: not answering on
 * holiday says little.
 */
export function responseSignal(checkins: CheckinRecord[], contexts: ContextLabel[], date: string, cfg: Config): ResponseSignal {
  const recentFrom = addDays(date, -cfg.responseRecentDays);
  const usualFrom = addDays(date, -cfg.responseUsualDays);
  const explained = (d: string) => contexts.some((c) => contextKind(c.type) === "explains_sensors" && contextActive(c, d, cfg));
  let nRecent = 0;
  let missedRecent = 0;
  let nUsual = 0;
  let missedUsual = 0;
  for (const c of checkins) {
    const d = dateOfTimestamp(c.scheduledAt);
    if (d >= date || d < usualFrom || explained(d)) continue;
    const missed = c.answeredAt === null ? 1 : 0;
    if (d >= recentFrom) {
      nRecent++;
      missedRecent += missed;
    } else {
      nUsual++;
      missedUsual += missed;
    }
  }
  // The usual share, pulled slightly towards one half so that a short perfect record does
  // not make a single miss look extreme.
  const usualMiss = (missedUsual + 1) / (nUsual + 2);
  const base = { nRecent, missedRecent, nUsual, missedUsual, usualMiss: round3(usualMiss) };
  if (nUsual < cfg.responseMinUsual || nRecent < cfg.responseMinRecent) return { status: "collecting", ...base, p: null };
  const p = binomialUpperTail(missedRecent, nRecent, usualMiss);
  const fewer = missedRecent >= cfg.responseMinMissed && missedRecent / nRecent - usualMiss >= cfg.responseMinRise && p < cfg.responseAlpha;
  return { status: fewer ? "fewer_answers" : "usual", ...base, p: round3(p) };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
