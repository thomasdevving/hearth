// docs/05 §5.2 number check, §5.4 banned words, task P PII check.
import banned from "../../../../shared/safety/banned_output_words.json";

export const BANNED_WORDS: string[] = banned.words;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The banned words or phrases found in `text` (case-insensitive, whole words). */
export function bannedWordsIn(text: string, words: string[] = BANNED_WORDS): string[] {
  const t = text.normalize("NFKC").replace(/[‘’]/g, "'");
  return words.filter((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w).replace(/ /g, "\\s+")}($|[^\\p{L}\\p{N}])`, "iu").test(t));
}

export function hasBannedWords(text: string, words: string[] = BANNED_WORDS): boolean {
  return bannedWordsIn(text, words).length > 0;
}

/** All numbers written with digits in a text. Thousands separators ("8,500") are joined. */
export function extractNumbers(text: string): number[] {
  const t = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  return (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Every number in an input object: numeric values, and digits inside string values. */
export function collectNumbers(facts: unknown, out: number[] = []): number[] {
  if (typeof facts === "number" && Number.isFinite(facts)) out.push(facts);
  else if (typeof facts === "string") out.push(...extractNumbers(facts));
  else if (Array.isArray(facts)) facts.forEach((f) => collectNumbers(f, out));
  else if (facts && typeof facts === "object") Object.values(facts).forEach((f) => collectNumbers(f, out));
  return out;
}

function decimals(s: string): number {
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * docs/05 §5.2: every number in `text` must equal a number in `facts`, either exactly or
 * after rounding the fact to the number of decimals written (so 0.47 may be written 0.5).
 * Negative facts also allow their absolute value ("1.2 lower").
 */
export function numberCheck(text: string, facts: unknown): { ok: boolean; unknown: number[] } {
  const known = collectNumbers(facts).flatMap((n) => (n < 0 ? [n, -n] : [n]));
  const t = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const written = t.match(/\d+(?:\.\d+)?/g) ?? [];
  const unknown: number[] = [];
  for (const w of written) {
    const v = Number(w);
    const d = decimals(w);
    const f = 10 ** d;
    const ok = known.some((k) => Math.abs(k - v) < 1e-9 || Math.abs(Math.round(k * f) / f - v) < 1e-9);
    if (!ok) unknown.push(v);
  }
  return { ok: unknown.length === 0, unknown };
}

const FIRST_PERSON = new Set(["I", "I'm", "I've", "I'd", "I'll", "I’m", "I’ve", "I’d", "I’ll"]);

/**
 * Task P PII check: reject a note that contains a digit, an "@", a capitalised word that is
 * not sentence-initial (other than "I"), any place label, or the trusted contact's name.
 */
export function piiCheck(note: string, opts: { placeLabels?: string[]; contactName?: string | null } = {}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (/\d/.test(note)) reasons.push("digit");
  if (note.includes("@")) reasons.push("at_sign");
  const tokens = note.match(/[\p{L}][\p{L}'’-]*|[.!?]+/gu) ?? [];
  let sentenceStart = true;
  for (const tok of tokens) {
    if (/^[.!?]+$/.test(tok)) {
      sentenceStart = true;
      continue;
    }
    if (!sentenceStart && /^\p{Lu}/u.test(tok) && !FIRST_PERSON.has(tok)) {
      reasons.push(`capitalised:${tok}`);
    }
    sentenceStart = false;
  }
  const lower = ` ${note.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  for (const label of opts.placeLabels ?? []) {
    const l = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (l && lower.includes(` ${l} `)) reasons.push(`place:${label}`);
  }
  if (opts.contactName) {
    for (const part of opts.contactName.toLowerCase().split(/[^\p{L}]+/u).filter((p) => p.length >= 2)) {
      if (lower.includes(` ${part} `)) reasons.push("contact_name");
    }
  }
  return { ok: reasons.length === 0, reasons };
}
