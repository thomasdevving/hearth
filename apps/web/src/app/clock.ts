// "Today" always comes from the time machine, never from the system clock (docs/08 §3).
let today = "2026-06-18";
export function setToday(d: string): void {
  today = d;
}
export function getToday(): string {
  return today;
}
/** A timestamp on the simulated day with the given local time (minutes after midnight). */
export function stampAt(date: string, minute: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00+01:00`;
}
/** Now on the simulated day: the simulated date with the real time of day, for ordering. */
export function nowStamp(): string {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  const s = String(d.getSeconds()).padStart(2, "0");
  return stampAt(today, m).replace(":00+01:00", `:${s}+01:00`);
}
