import type { Config, ContextKind, ContextLabel, Domain } from "./types";
import { addDays } from "./time";

/** docs/04 §6. */
export const CONTEXT_TABLE: Record<string, { kind: ContextKind; masks: Domain[] }> = {
  holiday: { kind: "explains_sensors", masks: ["mobility", "phone"] },
  travel: { kind: "explains_sensors", masks: ["mobility", "phone"] },
  visitors: { kind: "explains_sensors", masks: ["mobility"] },
  ill: { kind: "explains_sensors", masks: ["activity", "mobility", "rhythm", "sleep", "body"] },
  moving: { kind: "explains_sensors", masks: ["mobility"] },
  exams: { kind: "stressor", masks: [] },
  new_job: { kind: "stressor", masks: [] },
  loss: { kind: "stressor", masks: [] },
  other_stress: { kind: "stressor", masks: [] },
};

export const CONTEXT_TYPES = Object.keys(CONTEXT_TABLE);

export function contextKind(type: string): ContextKind | null {
  return CONTEXT_TABLE[type]?.kind ?? null;
}

/** A label that explains sensors lasts at most cfg.contextMaxDays. */
export function effectiveEnd(ctx: ContextLabel, cfg: Config): string {
  if (contextKind(ctx.type) !== "explains_sensors") return ctx.end;
  const cap = addDays(ctx.start, cfg.contextMaxDays - 1);
  return ctx.end < cap ? ctx.end : cap;
}

export function contextActive(ctx: ContextLabel, date: string, cfg: Config): boolean {
  return ctx.confirmed && CONTEXT_TABLE[ctx.type] !== undefined && ctx.start <= date && date <= effectiveEnd(ctx, cfg);
}

/** Domains masked on `date` by confirmed labels. Stressors never mask. */
export function maskedDomains(date: string, contexts: ContextLabel[], cfg: Config): Domain[] {
  const out = new Set<Domain>();
  for (const ctx of contexts) {
    if (!contextActive(ctx, date, cfg)) continue;
    for (const d of CONTEXT_TABLE[ctx.type].masks) out.add(d);
  }
  return (["activity", "rhythm", "sleep", "body", "mobility", "phone"] as Domain[]).filter((d) => out.has(d));
}

export function stressorActive(date: string, contexts: ContextLabel[], cfg: Config): boolean {
  return contexts.some((c) => contextActive(c, date, cfg) && CONTEXT_TABLE[c.type].kind === "stressor");
}

/** Last day of the most recent finished `moving` label before `date`; mobility history up to it is dropped. */
export function mobilityRestart(date: string, contexts: ContextLabel[], cfg: Config): string | null {
  let latest: string | null = null;
  for (const c of contexts) {
    if (!c.confirmed || c.type !== "moving") continue;
    const end = effectiveEnd(c, cfg);
    if (end < date && (latest === null || end > latest)) latest = end;
  }
  return latest;
}
