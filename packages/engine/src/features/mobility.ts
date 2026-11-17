import type { Config, DayRaw, Place, Visit } from "../types";
import { haversine } from "../stats";
import { addDays, dayIndex, dayTypeOf, localMinutes } from "../time";

interface Clipped {
  placeId: string;
  start: number; // minutes after midnight of the day, 0..1440
  end: number;
  lat: number;
  lon: number;
}

/** Nearest place whose centre is within `radius` metres, or null. */
export function nearestPlace(places: Place[], lat: number, lon: number, radius: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = haversine(lat, lon, p.lat, p.lon);
    if (d <= radius && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function clipVisit(v: Visit, date: string): { start: number; end: number } | null {
  const midnight = dayIndex(date) * 1440;
  const s = Math.max(0, localMinutes(v.arrive) - midnight);
  const e = Math.min(1440, localMinutes(v.depart) - midnight);
  return e > s ? { start: s, end: e } : null;
}

/**
 * Learn places from one day's visits (docs/03 §5). Each visit is clipped to the day, so a
 * visit that spans midnight is counted once per day for the minutes inside that day.
 * Returns a new array; the input is not changed.
 */
export function learnPlaces(places: Place[], raw: DayRaw | undefined, cfg: Config): Place[] {
  const out = places.map((p) => ({ ...p }));
  if (!raw || !raw.visits) return out;
  const visits = [...raw.visits].sort((a, b) => localMinutes(a.arrive) - localMinutes(b.arrive));
  let created = 0;
  for (const v of visits) {
    const clip = clipVisit(v, raw.date);
    if (!clip) continue;
    const dur = clip.end - clip.start;
    const p = nearestPlace(out, v.lat, v.lon, cfg.placeRadiusM);
    if (p) {
      const total = p.minutes + dur;
      p.lat = (p.lat * p.minutes + v.lat * dur) / total;
      p.lon = (p.lon * p.minutes + v.lon * dur) / total;
      p.minutes = total;
    } else {
      created++;
      out.push({ id: `p${raw.date.replace(/-/g, "")}_${created}`, lat: v.lat, lon: v.lon, minutes: dur, label: null });
    }
  }
  return out;
}

function clippedVisits(raw: DayRaw | undefined, places: Place[], cfg: Config): Clipped[] | null {
  if (!raw || !raw.visits) return null;
  const out: Clipped[] = [];
  for (const v of raw.visits) {
    const clip = clipVisit(v, raw.date);
    if (!clip) continue;
    const p = nearestPlace(places, v.lat, v.lon, cfg.placeRadiusM);
    // A visit that matches no learned place still counts as a place of its own.
    const placeId = p ? p.id : `?${v.lat.toFixed(3)},${v.lon.toFixed(3)}`;
    out.push({ placeId, start: clip.start, end: clip.end, lat: p ? p.lat : v.lat, lon: p ? p.lon : v.lon });
  }
  return out;
}

/** Home: the place with the most time between 00:00 and 06:00 over the 28 days ending on `date`. */
export function findHome(places: Place[], byDate: Map<string, DayRaw>, date: string, cfg: Config): string | null {
  const minutes = new Map<string, number>();
  const nights = new Map<string, number>();
  for (let k = 0; k < 28; k++) {
    const clips = clippedVisits(byDate.get(addDays(date, -k)), places, cfg);
    if (!clips) continue;
    const seen = new Set<string>();
    for (const c of clips) {
      const overlap = Math.min(c.end, 360) - Math.max(c.start, 0);
      if (overlap <= 0 || c.placeId.startsWith("?")) continue;
      minutes.set(c.placeId, (minutes.get(c.placeId) ?? 0) + overlap);
      seen.add(c.placeId);
    }
    for (const id of seen) nights.set(id, (nights.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestMin = 0;
  for (const [id, m] of [...minutes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (m > bestMin) {
      best = id;
      bestMin = m;
    }
  }
  return best !== null && (nights.get(best) ?? 0) >= 3 ? best : null;
}

/** For each clock hour: the place with the most minutes, or null when under 20 known minutes. */
function hourlyOccupancy(clips: Clipped[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (let h = 0; h < 24; h++) {
    const per = new Map<string, number>();
    let known = 0;
    for (const c of clips) {
      const overlap = Math.min(c.end, (h + 1) * 60) - Math.max(c.start, h * 60);
      if (overlap <= 0) continue;
      per.set(c.placeId, (per.get(c.placeId) ?? 0) + overlap);
      known += overlap;
    }
    if (known < 20) {
      out.push(null);
      continue;
    }
    let best: string | null = null;
    let bestMin = 0;
    for (const [id, m] of [...per.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (m > bestMin) {
        best = id;
        bestMin = m;
      }
    }
    out.push(best);
  }
  return out;
}

export interface MobilityFeatures {
  home_stay: number | null;
  location_entropy: number | null;
  places_visited: number | null;
  location_variance: number | null;
  routine_regularity: number | null;
}

export function mobilityFeatures(byDate: Map<string, DayRaw>, date: string, places: Place[], homePlaceId: string | null, cfg: Config): MobilityFeatures {
  const none: MobilityFeatures = { home_stay: null, location_entropy: null, places_visited: null, location_variance: null, routine_regularity: null };
  const clips = clippedVisits(byDate.get(date), places, cfg);
  if (!clips) return none;

  const perPlace = new Map<string, { t: number; lat: number; lon: number }>();
  let T = 0;
  for (const c of clips) {
    const cur = perPlace.get(c.placeId) ?? { t: 0, lat: c.lat, lon: c.lon };
    cur.t += c.end - c.start;
    perPlace.set(c.placeId, cur);
    T += c.end - c.start;
  }
  if (T < cfg.minKnownMinutes || T <= 0) return none;

  const entries = [...perPlace.values()].filter((e) => e.t > 0);
  const N = entries.length;
  let entropy = 0;
  if (N > 1) {
    for (const e of entries) entropy -= (e.t / T) * Math.log(e.t / T);
    entropy /= Math.log(N);
  }
  let cLat = 0;
  let cLon = 0;
  for (const e of entries) {
    cLat += (e.t / T) * e.lat;
    cLon += (e.t / T) * e.lon;
  }
  let spread = 0;
  for (const e of entries) spread += (e.t / T) * haversine(e.lat, e.lon, cLat, cLon) ** 2;

  const home_stay = homePlaceId === null ? null : (perPlace.get(homePlaceId)?.t ?? 0) / T;

  // Routine regularity against the previous 28 days of the same day type.
  let routine_regularity: number | null = null;
  const type = dayTypeOf(date);
  const prevOcc: (string | null)[][] = [];
  for (let k = 1; k <= 28; k++) {
    const d = addDays(date, -k);
    if (dayTypeOf(d) !== type) continue;
    const pc = clippedVisits(byDate.get(d), places, cfg);
    if (pc) prevOcc.push(hourlyOccupancy(pc));
  }
  if (prevOcc.length >= 7) {
    const todayOcc = hourlyOccupancy(clips);
    let comparable = 0;
    let same = 0;
    for (let h = 0; h < 24; h++) {
      if (todayOcc[h] === null) continue;
      const counts = new Map<string, number>();
      for (const occ of prevOcc) {
        const id = occ[h];
        if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      let usual: string | null = null;
      let usualN = 0;
      for (const [id, n] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (n > usualN) {
          usual = id;
          usualN = n;
        }
      }
      if (usual === null) continue;
      comparable++;
      if (usual === todayOcc[h]) same++;
    }
    if (comparable >= 12) routine_regularity = same / comparable;
  }

  return { home_stay, location_entropy: entropy, places_visited: N, location_variance: Math.log10(1 + spread), routine_regularity };
}

/**
 * Visits of at least 15 minutes to one place in the 7 days ending on `date` (docs/03 §5).
 * A visit that spans midnight is counted once. Null when fewer than 5 of the 7 days have
 * visit data.
 */
export function placeVisits(byDate: Map<string, DayRaw>, date: string, places: Place[], placeId: string, cfg: Config): number | null {
  const target = places.find((p) => p.id === placeId);
  if (!target) return null;
  const seen = new Set<string>();
  let daysWithData = 0;
  for (let k = 0; k < 7; k++) {
    const raw = byDate.get(addDays(date, -k));
    if (!raw || !raw.visits) continue;
    daysWithData++;
    for (const v of raw.visits) {
      if (localMinutes(v.depart) - localMinutes(v.arrive) < 15) continue;
      const p = nearestPlace(places, v.lat, v.lon, cfg.placeRadiusM);
      if (p && p.id === placeId) seen.add(v.arrive);
    }
  }
  return daysWithData >= 5 ? seen.size : null;
}
