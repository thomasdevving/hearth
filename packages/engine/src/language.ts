// docs/03 §7: deterministic language features. Display and reflection only (rule R6).
import type { LanguageFeatures } from "./types";

const FPS = new Set(["i", "me", "my", "mine", "myself"]);
const OTH = new Set(["you", "your", "he", "she", "they", "we", "us", "them"]);
/** Al-Mosaiwi & Johnstone, 19 words. */
export const ABSOLUTIST = new Set([
  "absolutely", "all", "always", "complete", "completely", "constant", "constantly", "definitely", "entire", "ever",
  "every", "everyone", "everything", "full", "must", "never", "nothing", "totally", "whole",
]);

export function languageFeatures(text: string | null | undefined): LanguageFeatures | null {
  if (!text) return null;
  const tokens = text.normalize("NFKC").toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const W = tokens.length;
  if (W < 20) return null;
  const c = (set: Set<string>) => tokens.filter((t) => set.has(t)).length / W;
  const fps = c(FPS);
  const oth = c(OTH);
  const abs = c(ABSOLUTIST);
  return { W, FPS: fps, OTH: oth, ABS: abs, SF: fps / (fps + oth + 1e-6) };
}
