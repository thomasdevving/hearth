import type { Config, DayRaw } from "../types";

/** P2 (docs/03 §6). Values are null unless the phone domain is enabled and data exists. */
export function phoneFeatures(raw: DayRaw | undefined, cfg: Config): { screen_time: number | null; night_use: number | null; communication_time: number | null } {
  if (!cfg.phone.enabled || !raw || !raw.phone) return { screen_time: null, night_use: null, communication_time: null };
  const ok = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { screen_time: ok(raw.phone.screen), night_use: ok(raw.phone.night), communication_time: ok(raw.phone.communication) };
}
