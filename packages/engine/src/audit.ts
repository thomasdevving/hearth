import type { AuditResult, CheckinRecord, Config } from "./types";
import { mean, mulberry32 } from "./stats";
import { dayIndex, dateOfTimestamp } from "./time";

/**
 * Self-audit (docs/04 §9): is mood lower at triggered check-ins than at random ones, for
 * this user? The window ends at the most recent check-in. The permutation test is seeded.
 */
export function selfAudit(checkins: CheckinRecord[], cfg: Config, seed = 20261130): AuditResult {
  const answered = checkins.filter((c) => c.answeredAt !== null && typeof c.answers.mood_low === "number");
  if (answered.length === 0) return { status: "collecting", nTriggered: 0, nRandom: 0, delta: null, p: null };
  const latest = Math.max(...answered.map((c) => dayIndex(dateOfTimestamp(c.scheduledAt))));
  const inWindow = answered.filter((c) => latest - dayIndex(dateOfTimestamp(c.scheduledAt)) < cfg.auditWindowDays);
  const mT = inWindow.filter((c) => c.kind === "triggered").map((c) => c.answers.mood_low as number);
  const mR = inWindow.filter((c) => c.kind === "random").map((c) => c.answers.mood_low as number);
  const base = { nTriggered: mT.length, nRandom: mR.length };
  if (mT.length < cfg.auditMinPerGroup || mR.length < cfg.auditMinPerGroup) return { status: "collecting", ...base, delta: null, p: null };

  const delta = (mean(mT) as number) - (mean(mR) as number);
  const pooled = [...mT, ...mR];
  const rand = mulberry32(seed);
  const shuffles = 10000;
  let atLeast = 0;
  const total = pooled.reduce((a, b) => a + b, 0);
  for (let s = 0; s < shuffles; s++) {
    for (let i = pooled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pooled[i];
      pooled[i] = pooled[j];
      pooled[j] = tmp;
    }
    let sumT = 0;
    for (let i = 0; i < mT.length; i++) sumT += pooled[i];
    const d = sumT / mT.length - (total - sumT) / mR.length;
    if (d >= delta - 1e-12) atLeast++;
  }
  const p = (atLeast + 1) / (shuffles + 1);
  let status: AuditResult["status"];
  if (p < 0.1 && delta >= 0.5) status = "informative";
  else if (mT.length >= cfg.auditMinForNegative && mR.length >= cfg.auditMinForNegative) status = "not_informative";
  else status = "unclear";
  return { status, ...base, delta, p };
}
