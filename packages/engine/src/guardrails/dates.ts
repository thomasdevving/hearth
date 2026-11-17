// docs/05 task H: relative date phrases are resolved in code, never by the model.
import type { Config, ContextKind } from "../types";
import { addDays, dayIndex, weekdayOf } from "../time";

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, couple: 2, few: 3,
};

export type HintRole = "start" | "end";

function norm(hint: string): string {
  return hint.normalize("NFKC").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** Most recent `wd` on or before `date`. */
function onOrBefore(date: string, wd: number): string {
  return addDays(date, -((weekdayOf(date) - wd + 7) % 7));
}
/** Next `wd` on or after `date`. */
function onOrAfter(date: string, wd: number): string {
  return addDays(date, (wd - weekdayOf(date) + 7) % 7);
}

function daysBetweenAbs(a: string, b: string): number {
  return Math.abs(dayIndex(a) - dayIndex(b));
}

function count(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

/**
 * Resolve one hint ("since Tuesday", "until Sunday", "this week", "3 days ago", "for a week")
 * to a date. `anchor` is the resolved start, used by durations in an end hint.
 * Returns null when the phrase is not understood or is "unknown".
 */
export function resolveDateHint(hint: string | null | undefined, today: string, role: HintRole, anchor?: string): string | null {
  if (!hint) return null;
  const h = norm(hint);
  if (h === "" || h === "unknown" || h === "none") return null;
  const words = h.split(" ");

  if (/\b(today|tonight|now|right now|this morning|this evening)\b/.test(h)) return today;
  if (/\byesterday\b/.test(h)) return addDays(today, -1);
  if (/\btomorrow\b/.test(h)) return addDays(today, 1);

  // "3 days ago", "a week ago", "two weeks ago"
  let m = h.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|couple|few)(?: of)? (day|days|week|weeks) ago\b/);
  if (m) {
    const n = count(m[1]) ?? 1;
    return addDays(today, -n * (m[2].startsWith("week") ? 7 : 1));
  }
  // "in 3 days", "for a week", "for two weeks", "for the next 5 days"
  m = h.match(/\b(in|for|for the next|next) (?:a |an )?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|couple|few)(?: of)? (day|days|week|weeks|night|nights)\b/);
  if (m) {
    const n = count(m[2]) ?? 1;
    const days = n * (m[3].startsWith("week") ? 7 : 1);
    if (m[1] === "in") return addDays(today, days);
    return role === "end" ? addDays(anchor ?? today, days - 1) : (anchor ?? today);
  }

  if (/\bthis weekend\b/.test(h)) {
    const sat = onOrAfter(mondayOf(today), 6);
    return role === "start" ? (today > sat ? today : sat) : addDays(sat, 1);
  }
  if (/\b(the|last) weekend\b/.test(h)) return onOrBefore(today, 6);
  if (/\bthis week\b/.test(h)) return role === "start" ? mondayOf(today) : addDays(mondayOf(today), 6);
  if (/\bnext week\b/.test(h)) return role === "start" ? addDays(mondayOf(today), 7) : addDays(mondayOf(today), 13);
  if (/\blast week\b/.test(h)) return role === "start" ? addDays(mondayOf(today), -7) : addDays(mondayOf(today), -1);
  if (/\b(this|the) month\b/.test(h) && role === "end") return null;

  // A weekday, with or without a preposition.
  const wdWord = words.find((w) => w in WEEKDAYS);
  if (wdWord !== undefined) {
    const wd = WEEKDAYS[wdWord];
    if (/\bnext\b/.test(h)) return addDays(today, ((wd - weekdayOf(today) + 6) % 7) + 1);
    if (/\blast\b/.test(h)) return addDays(today, -(((weekdayOf(today) - wd + 6) % 7) + 1));
    if (role === "end") return onOrAfter(today, wd);
    if (/\b(since|ago|started|began)\b/.test(h)) return onOrBefore(today, wd);
    // "on Friday", "from Friday": the nearer occurrence (ties: the past one). The user sees and
    // can change the dates before confirming.
    const back = onOrBefore(today, wd);
    const ahead = onOrAfter(today, wd);
    return daysBetweenAbs(ahead, today) < daysBetweenAbs(back, today) ? ahead : back;
  }

  // "until the 24th", "since the 3rd"
  m = h.match(/\b(\d{1,2})(st|nd|rd|th)\b/);
  if (m) {
    const dom = Number(m[1]);
    if (dom >= 1 && dom <= 31) {
      for (let k = 0; k <= 31; k++) {
        const d = addDays(today, role === "end" ? k : -k);
        if (Number(d.slice(8, 10)) === dom) return d;
      }
    }
  }
  return null;
}

export interface ResolvedPeriod {
  start: string;
  end: string;
  startResolved: boolean;
  endResolved: boolean;
}

/**
 * Start and end of a context from the model's hints. An unresolved start is today; an
 * unresolved end is 6 days after the start (the user can change both before confirming).
 * The end never lies before the start, and the end of a label that explains sensors is
 * capped at cfg.contextMaxDays.
 */
export function resolveContextPeriod(startHint: string | null | undefined, endHint: string | null | undefined, today: string, kind: ContextKind, cfg: Config): ResolvedPeriod {
  const s = resolveDateHint(startHint, today, "start");
  const start = s ?? today;
  let e = resolveDateHint(endHint, today, "end", start);
  // A single phrase such as "this week" or "for 3 days" can carry both ends.
  if (e === null && endHint && norm(endHint) === "unknown" && startHint && !/\b(since|ago|last)\b/.test(norm(startHint))) {
    const fromStart = resolveDateHint(startHint, today, "end", start);
    if (fromStart !== null && fromStart !== start && /week|days|weekend/.test(norm(startHint))) e = fromStart;
  }
  let end = e ?? addDays(start, 6);
  if (dayIndex(end) < dayIndex(start)) end = start;
  if (kind === "explains_sensors") {
    const cap = addDays(start, cfg.contextMaxDays - 1);
    if (end > cap) end = cap;
  }
  return { start, end, startResolved: s !== null, endResolved: e !== null };
}
