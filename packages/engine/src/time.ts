// Calendar helpers. Nothing here reads the system clock or the system time zone:
// days are "YYYY-MM-DD" strings and timestamps are read as the wall-clock time they state.

const DAY_MS = 86400000;

/** Days since 1970-01-01 for a "YYYY-MM-DD" string. */
export function dayIndex(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dateFromIndex(idx: number): string {
  const dt = new Date(idx * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${m}-${d}`;
}

export function addDays(date: string, n: number): string {
  return dateFromIndex(dayIndex(date) + n);
}

/** b − a in days. */
export function daysBetween(a: string, b: string): number {
  return dayIndex(b) - dayIndex(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return (((dayIndex(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function dayTypeOf(date: string): "weekday" | "weekend" {
  const w = weekdayOf(date);
  return w === 0 || w === 6 ? "weekend" : "weekday";
}

/**
 * Wall-clock minutes since 1970-01-01T00:00 local, read from the digits of an ISO
 * timestamp. The UTC offset is ignored on purpose: features are defined on local time.
 */
export function localMinutes(iso: string): number {
  const h = Number(iso.slice(11, 13)) || 0;
  const mi = Number(iso.slice(14, 16)) || 0;
  const s = Number(iso.slice(17, 19)) || 0;
  return dayIndex(iso.slice(0, 10)) * 1440 + h * 60 + mi + s / 60;
}

/** Local calendar date of an ISO timestamp. */
export function dateOfTimestamp(iso: string): string {
  return iso.slice(0, 10);
}

/** Build an ISO timestamp with offset from local wall-clock minutes since the epoch. */
export function isoFromLocalMinutes(min: number, offset = "+00:00"): string {
  const whole = Math.round(min);
  const idx = Math.floor(whole / 1440);
  const rest = whole - idx * 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `${dateFromIndex(idx)}T${hh}:${mm}:00${offset}`;
}

/** ISO-8601 week label, e.g. "2026-W47". */
export function isoWeekOf(date: string): string {
  const idx = dayIndex(date);
  const wd = (weekdayOf(date) + 6) % 7; // Monday = 0
  const thursday = idx - wd + 3;
  const year = Number(dateFromIndex(thursday).slice(0, 4));
  const jan1 = dayIndex(`${year}-01-01`);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The seven dates (Monday to Sunday) of an ISO week label. */
export function datesOfIsoWeek(isoWeek: string): string[] {
  const year = Number(isoWeek.slice(0, 4));
  const week = Number(isoWeek.slice(6));
  const jan4 = `${year}-01-04`;
  const jan4Idx = dayIndex(jan4);
  const mondayW1 = jan4Idx - ((weekdayOf(jan4) + 6) % 7);
  const monday = mondayW1 + (week - 1) * 7;
  return Array.from({ length: 7 }, (_, i) => dateFromIndex(monday + i));
}
