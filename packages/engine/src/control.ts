import type { Config } from "./types";

export interface ControlState {
  S: number;
  C: number;
  elevated: boolean;
}

/** UCL = μ0 + L·σ0·sqrt(λ/(2−λ)) (docs/04 §5.2). */
export function controlLimit(mu0: number, sigma0: number, cfg: Config): number {
  return mu0 + cfg.ewmaL * sigma0 * Math.sqrt(cfg.ewmaLambda / (2 - cfg.ewmaLambda));
}

/**
 * One step of the EWMA and the CUSUM. On an insufficient day (D null) everything is frozen
 * (docs/04 §5.3).
 */
export function updateControl(prev: ControlState, D: number | null, mu0: number, sigma0: number, cfg: Config): ControlState {
  if (D === null) return { ...prev };
  const sigma = Math.max(sigma0, cfg.sigmaFloor);
  const S = cfg.ewmaLambda * D + (1 - cfg.ewmaLambda) * prev.S;
  const C = Math.max(0, prev.C + (D - mu0) / sigma - cfg.cusumK);
  return { S, C, elevated: S > controlLimit(mu0, sigma, cfg) || C > cfg.cusumH };
}
