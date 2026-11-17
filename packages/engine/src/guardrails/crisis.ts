// docs/05 §5.3 Crisis detection: runs on every free text, before and independent of any model.
import crisisKeywords from "../../../../shared/safety/crisis_keywords.en.json";
import { normalizeForQuote } from "./quotes";

export const CRISIS_KEYWORDS: string[] = crisisKeywords.phrases;

function loose(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * Case-insensitive substring match of any phrase. Each phrase is tried on the text as typed
 * (curly apostrophes straightened) and with punctuation folded to spaces, so "self-harm",
 * "self harm" and "don’t" all match. A false positive only shows the support screen.
 */
export function detectCrisis(text: string | null | undefined, keywords: string[] = CRISIS_KEYWORDS): boolean {
  if (!text) return false;
  const a = loose(text);
  const b = normalizeForQuote(text);
  return keywords.some((k) => {
    const kl = loose(k).trim();
    const kn = normalizeForQuote(k);
    return (kl.length > 0 && a.includes(kl)) || (kn.length > 0 && b.includes(kn));
  });
}
