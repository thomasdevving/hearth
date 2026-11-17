// Small statistics helpers. Empty input returns null; nothing throws.

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n − 1). One value → 0. Empty → null. */
export function sd(xs: number[]): number | null {
  if (xs.length === 0) return null;
  if (xs.length === 1) return 0;
  const m = mean(xs) as number;
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Quantile with linear interpolation between order statistics (type 7). */
export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const p = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

export function median(xs: number[]): number | null {
  return quantile(xs, 0.5);
}

/** Median absolute deviation from the median (unscaled). */
export function mad(xs: number[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return median(xs.map((x) => Math.abs(x - m)));
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Great-circle distance in metres. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ----- seeded PRNG (mulberry32) -----
// The state is a plain 32-bit integer so it can be stored in EngineState.

export function seedRng(seed: number): number {
  return seed >>> 0;
}

/** One draw in [0, 1). Returns the value and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Convenience generator with internal state, for the simulator and the self-audit. */
export function mulberry32(seed: number): () => number {
  let state = seedRng(seed);
  return () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
}

/** Standard normal draw (Box–Muller) from a uniform generator. */
export function gaussian(rand: () => number): number {
  let u = rand();
  if (u < 1e-12) u = 1e-12;
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
