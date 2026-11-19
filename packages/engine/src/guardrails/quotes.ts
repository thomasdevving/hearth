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

interface Word {
  w: string;
  start: number;
  end: number;
}
function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) out.push({ w: m[0].normalize("NFKC").toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** One typo is tolerated in words of 4 letters or more ("skipp" for "skip"), never in short words. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  // edit distance ≤ 1
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** A sentence or list boundary between two words: a tolerant match never crosses one. */
function boundaryBetween(text: string, from: number, to: number): boolean {
  return /[.!?;\n]/.test(text.slice(from, to));
}

/** Where in the source a quote matches best (fewest extra words): word indexes, or null. */
function matchQuote(quote: string, sw: Word[], text: string): { first: number; last: number } | null {
  const qw = normalizeForQuote(quote).split(" ").filter(Boolean);
  if (qw.length === 0) return null;
  let best: { first: number; last: number; gaps: number } | null = null;
  for (let i = 0; i < sw.length; i++) {
    if (!sameWord(sw[i].w, qw[0])) continue;
    let j = i;
    let k = 1;
    let gaps = 0;
    while (k < qw.length && gaps <= QUOTE_GAP) {
      j++;
      if (j >= sw.length) break;
      if (sameWord(sw[j].w, qw[k])) k++;
      else gaps++;
    }
    if (k !== qw.length || gaps > QUOTE_GAP) continue;
    if (gaps > 0 && boundaryBetween(text, sw[i].start, sw[j].end)) continue;
    if (!best || gaps < best.gaps) best = { first: i, last: j, gaps };
    if (gaps === 0) break;
  }
  return best;
}

/**
 * The exact span of the user's text that a model's quote refers to, or null. Every word of the
 * quote must appear in the source in the same order; at most QUOTE_GAP extra source words may
 * sit between them in total, and a word of 4+ letters may differ by one typo. The span returned
 * is the user's own wording, so a card always shows what they actually wrote.
 */
export function findQuoteSpan(quote: string | null | undefined, sourceText: string): string | null {
  if (typeof quote !== "string") return null;
  const q = normalizeForQuote(quote);
  if (q.length < 3) return null;
  const sw = words(sourceText);
  const m = matchQuote(quote, sw, sourceText);
  if (m) return sourceText.slice(sw[m.first].start, sw[m.last].end);
  // A quote that cuts a word in half but is literally in the text (ignoring case and punctuation).
  if (` ${normalizeForQuote(sourceText)} `.includes(q)) return quote.trim();
  return null;
}

/** A quote is valid when it has at least 3 characters and findQuoteSpan finds it in the source. */
export function verifyQuote(quote: string | null | undefined, sourceText: string): boolean {
  return findQuoteSpan(quote, sourceText) !== null;
}

const NEGATORS = new Set(["not", "never", "no", "cannot", "hardly", "nor"]);
const NT_AUX = new Set(["don", "doesn", "didn", "isn", "aren", "wasn", "weren", "won", "can", "couldn", "wouldn", "shouldn", "haven", "hasn", "hadn", "ain"]);

/**
 * True when the quote leaves out a negation right before it: "I don't sleep less" quoted as
 * "sleep less" says the opposite of what the person wrote. A quote that includes the negation
 * itself ("I don't answer my phone") is fine.
 */
export function quoteDropsNegation(quote: string | null | undefined, sourceText: string): boolean {
  if (typeof quote !== "string") return false;
  const sw = words(sourceText);
  const m = matchQuote(quote, sw, sourceText);
  if (!m) return false;
  const quoteStart = sw[m.first].start;
  for (let back = 1; back <= 2; back++) {
    const p = sw[m.first - back];
    if (!p || boundaryBetween(sourceText, p.end, quoteStart)) break; // only within the same clause
    if (NEGATORS.has(p.w)) return true;
    const aux = sw[m.first - back - 1];
    if (p.w === "t" && aux && NT_AUX.has(aux.w)) return true;
  }
  return false;
}
