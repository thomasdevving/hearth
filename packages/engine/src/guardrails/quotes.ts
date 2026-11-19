// docs/05 §5.1 Quote verification.

/** Lowercase, Unicode NFKC, every run of non-alphanumeric characters → one space, trim. */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Extra words of the source allowed between the quote's words, in total ("I also stop" for "I stop"). */
export const QUOTE_GAP = 2;

function words(text: string): { w: string; start: number; end: number }[] {
  const out: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(WORD)) out.push({ w: m[0].normalize("NFKC").toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  return out;
}

/**
 * The exact span of the user's text that a model's quote refers to, or null. Every word of the
 * quote must appear in the source in the same order; at most QUOTE_GAP extra source words may
 * sit between them in total. The span returned is the user's own wording, so a card always
 * shows what they actually wrote.
 */
export function findQuoteSpan(quote: string | null | undefined, sourceText: string): string | null {
  if (typeof quote !== "string") return null;
  const q = normalizeForQuote(quote);
  if (q.length < 3) return null;
  // The quote as given is in the text (ignoring case and punctuation): keep it as it is.
  if (` ${normalizeForQuote(sourceText)} `.includes(q)) return quote.trim();
  const qw = q.split(" ");
  const sw = words(sourceText);
  for (let i = 0; i < sw.length; i++) {
    if (sw[i].w !== qw[0]) continue;
    let j = i;
    let k = 1;
    let gaps = 0;
    while (k < qw.length && gaps <= QUOTE_GAP) {
      j++;
      if (j >= sw.length) break;
      if (sw[j].w === qw[k]) k++;
      else gaps++;
    }
    if (k === qw.length && gaps <= QUOTE_GAP) return sourceText.slice(sw[i].start, sw[j].end);
  }
  return null;
}

/** A quote is valid when it has at least 3 characters and findQuoteSpan finds it in the source. */
export function verifyQuote(quote: string | null | undefined, sourceText: string): boolean {
  return findQuoteSpan(quote, sourceText) !== null;
}
