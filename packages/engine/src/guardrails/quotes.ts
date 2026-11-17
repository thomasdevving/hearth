// docs/05 §5.1 Quote verification.

/** Lowercase, Unicode NFKC, every run of non-alphanumeric characters → one space, trim. */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A quote is valid when it has at least 3 characters and, normalised, is a substring of the normalised source. */
export function verifyQuote(quote: string | null | undefined, sourceText: string): boolean {
  if (typeof quote !== "string") return false;
  const q = normalizeForQuote(quote);
  if (q.length < 3) return false;
  return ` ${normalizeForQuote(sourceText)} `.includes(q);
}
