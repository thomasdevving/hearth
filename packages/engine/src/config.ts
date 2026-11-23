import defaults from "../../../shared/config/defaults.json";
import type { Config } from "./types";

export const defaultConfig: Config = Object.freeze(JSON.parse(JSON.stringify(defaults))) as Config;

type Check = (v: unknown) => boolean;
const num = (lo: number, hi: number): Check => (v) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (lo: number, hi: number): Check => (v) => num(lo, hi)(v) && Number.isInteger(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Types and sane ranges for every key (docs/07 §5). An invalid value falls back to its default.
const checks: Record<keyof Config, Check> = {
  baselineWindowDays: int(7, 365),
  minReferenceDays: int(3, 120),
  minSameDayType: int(1, 60),
  minDomains: int(1, 5),
  personalWeight: num(0.1, 10),
  sigmaFloor: num(0.001, 5),
  ewmaLambda: num(0.01, 1),
  ewmaL: num(0.5, 10),
  cusumK: num(0, 5),
  cusumH: num(0.5, 50),
  recoveryDays: int(1, 30),
  persistDays: int(1, 30),
  persistWindow: int(1, 30),
  driftThreshold: num(0.1, 10),
  contextMaxDays: int(1, 90),
  ctxMinConf: (v) => v === "low" || v === "medium" || v === "high",
  randomCheckinProb: num(0, 1),
  stressCheckinProb: num(0, 1),
  maxCheckinsPerDay: int(0, 10),
  maxCheckinsPerWeek: int(0, 70),
  ignoredBeforeBackoff: int(1, 50),
  quietHours: (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(v),
  emaHigh: num(1, 7),
  emaLow: num(1, 7),
  phq2Cutoff: int(1, 6),
  phq2CooldownDays: int(0, 90),
  phq9Cutoff: int(1, 27),
  phq9ReliableChange: int(1, 27),
  phq9IntervalDays: int(1, 180),
  auditWindowDays: int(7, 730),
  auditMinPerGroup: int(2, 200),
  auditMinForNegative: int(2, 400),
  fixedScheduleDays: int(1, 30),
  activeHourSteps: num(1, 10000),
  minDailySteps: num(0, 20000),
  placeRadiusM: num(10, 5000),
  minKnownMinutes: num(0, 1440),
  backfillDays: int(0, 730),
  rawRetentionDays: int(1, 3650),
  onsetLookbackDays: int(7, 120),
  onsetRiskMin: num(0.1, 4),
  onsetSustainDays: int(1, 3),
  phone: (v) =>
    isRecord(v) &&
    typeof v.enabled === "boolean" &&
    Array.isArray(v.thresholds) &&
    v.thresholds.length > 0 &&
    v.thresholds.every((t) => typeof t === "number" && Number.isFinite(t) && t >= 0),
  featureFloors: (v) => isRecord(v),
  promptVersions: (v) => isRecord(v) && Object.values(v).every((x) => typeof x === "string"),
};

export interface ConfigLoadResult {
  config: Config;
  rejected: string[]; // keys whose override was invalid or unknown
}

/**
 * Bundled defaults → overrides (Remote Config) → validation. Unknown keys are ignored.
 * `featureFloors` and `promptVersions` are merged key by key.
 */
export function loadConfigWithReport(overrides?: unknown): ConfigLoadResult {
  const config = JSON.parse(JSON.stringify(defaults)) as Config;
  const rejected: string[] = [];
  if (!isRecord(overrides)) return { config, rejected: overrides == null ? [] : ["<root>"] };
  const target = config as unknown as Record<string, unknown>;
  for (const [key, raw] of Object.entries(overrides)) {
    if (!(key in checks)) {
      rejected.push(key);
      continue;
    }
    const k = key as keyof Config;
    if (!checks[k](raw)) {
      rejected.push(key);
      continue;
    }
    if (k === "featureFloors") {
      for (const [f, val] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof val === "number" && Number.isFinite(val) && val >= 0) config.featureFloors[f] = val;
        else rejected.push(`featureFloors.${f}`);
      }
    } else if (k === "promptVersions") {
      Object.assign(config.promptVersions, raw);
    } else {
      target[k] = JSON.parse(JSON.stringify(raw));
    }
  }
  return { config, rejected };
}

export function loadConfig(overrides?: unknown): Config {
  return loadConfigWithReport(overrides).config;
}
