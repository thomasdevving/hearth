// docs/08 §2: the replay persona "Sam". Pure and seeded.
import type { DayRaw, PersonaPlace, ReplayData, Scenario, ScriptEvent, Visit } from "../types";
import { gaussian, mulberry32 } from "../stats";
import { addDays, dayIndex, weekdayOf } from "../time";

export const PERSONA_START = "2026-06-18"; // a Thursday, so day 61 and day 96 are Mondays
export const PERSONA_DAYS = 150;

/** Fixed coordinates in one city (Utrecht) and a holiday city (Valencia). */
export const SAM_PLACES: Record<string, PersonaPlace> = {
  home: { label: "home", lat: 52.0907, lon: 5.1214 },
  work: { label: "work", lat: 52.085, lon: 5.17 },
  gym: { label: "gym", lat: 52.1, lon: 5.1 },
  shop: { label: "shop", lat: 52.0935, lon: 5.132 },
  friends: { label: "friends", lat: 52.07, lon: 5.095 },
  park: { label: "park", lat: 52.08, lon: 5.145 },
  hotel: { label: "hotel", lat: 39.4699, lon: -0.3763 },
  beach: { label: "beach", lat: 39.4655, lon: -0.3725 },
  oldtown: { label: "old town", lat: 39.4753, lon: -0.3753 },
  market: { label: "market", lat: 39.4735, lon: -0.3786 },
};

/** The plan text of docs/05 task G, offered on plan_setup on day 1. */
export const SAM_PLAN_TEXT =
  "When things go wrong I keep going to bed later, I skip the gym, I stay inside more and I eat badly. I also stop replying to messages. Calling my sister helps, and so does a walk in the morning.";

/** A correct task G output for SAM_PLAN_TEXT (used by tests and by the scripted demo). */
export const SAM_PLAN_EXPECTED = {
  rules: [
    { feature: "rest_midpoint", direction: "later", place_label: "", quote: "going to bed later" },
    { feature: "place_visits", direction: "lower", place_label: "gym", quote: "I skip the gym" },
    { feature: "home_stay", direction: "higher", place_label: "", quote: "I stay inside more" },
  ],
  personal_checkin_items: [
    { question: "Did you eat well today?", quote: "I eat badly" },
    { question: "Did you reply to messages today?", quote: "stop replying to messages" },
  ],
  actions: [
    { text: "Call my sister", quote: "Calling my sister helps" },
    { text: "A walk in the morning", quote: "a walk in the morning" },
  ],
};

/**
 * "What helped me last time": a note Sam saved after an earlier hard week, before the replay
 * starts. It is attached to Sam's own sign by its words ("stop replying to messages").
 */
export const SAM_HELPED_NOTE = {
  signQuote: "stop replying to messages",
  text: "Calling felt like too much. I texted Maya \u201cwalk tomorrow?\u201d and that was easier.",
  message: "Walk tomorrow?",
  contactName: "Maya",
  savedOn: "2026-02-26",
};

export const SAM_HOLIDAY_TEXT = "I'm in Spain this week, back on Sunday.";
export const SAM_EXAM_TEXT = "Exam week, lots of stress.";

interface Phase {
  name: string;
  fromDay: number;
  toDay: number;
}

interface ScenarioShape {
  days: number;
  holiday: [number, number];
  exams: [number, number];
  decline: [number, number]; // first and last day of the linear decline
  friendsDroppedFrom: number;
  recoveryTo: number; // decline factor reached at the last day (partial recovery)
  phq9Item9: number;
}

function shapeOf(scenario: Scenario): ScenarioShape {
  const base: ScenarioShape = { days: PERSONA_DAYS, holiday: [61, 67], exams: [96, 102], decline: [103, 130], friendsDroppedFrom: 115, recoveryTo: 0.45, phq9Item9: 0 };
  if (scenario === "slow") return { ...base, decline: [71, 130], friendsDroppedFrom: 100 };
  if (scenario === "safety") return { ...base, phq9Item9: 1 };
  if (scenario === "stable") return { ...base, decline: [10000, 10001], friendsDroppedFrom: 10000, exams: [10000, 10001] };
  return base;
}

/** Decline factor 0..1 on day `i`: linear inside the decline, then partial recovery. */
function declineFactor(i: number, s: ScenarioShape): number {
  const [a, b] = s.decline;
  if (i < a) return 0;
  if (i <= b) return (i - a + 1) / (b - a + 1);
  const tail = s.days - b;
  return tail <= 0 ? 1 : 1 - (1 - s.recoveryTo) * Math.min(1, (i - b) / tail);
}

function restFactor(i: number, s: ScenarioShape): number {
  const [a, b] = s.decline;
  if (i < a || i > b) return declineFactor(i, s);
  const len = Math.max(1, Math.round((b - a + 1) * (12 / 28)));
  return Math.min(1, (i - a + 1) / len);
}

/** Central European offset of a local date (summer time from the last Sunday of March to the last Sunday of October). */
function offsetOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const lastSunday = (m: number) => {
    const last = `${y}-${String(m).padStart(2, "0")}-31`;
    return dayIndex(last) - weekdayOf(last);
  };
  const idx = dayIndex(date);
  return idx >= lastSunday(3) && idx < lastSunday(10) ? "+02:00" : "+01:00";
}

export function personaTimestamp(date: string, minute: number): string {
  let d = date;
  let m = Math.round(minute);
  while (m >= 1440) {
    m -= 1440;
    d = addDays(d, 1);
  }
  while (m < 0) {
    m += 1440;
    d = addDays(d, -1);
  }
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${d}T${hh}:${mm}:00${offsetOf(d)}`;
}

interface Segment {
  from: number; // minutes after midnight
  to: number;
  place: string | null; // null = moving
  rate: number; // relative steps per minute
}

const RATE = { home: 1, work: 1.4, commute: 9, gym: 11, shop: 4, friends: 2.2, park: 7, hotel: 1, beach: 3, oldtown: 7, market: 5 } as const;

interface DayPlan {
  wake: number; // minutes after midnight of the date
  bed: number; // this evening, minutes after midnight (can exceed 1440)
  steps: number;
  speed: number;
  segments: Segment[];
}

const q5 = (x: number) => Math.round(x / 5) * 5;

/**
 * Build one day's schedule. Rest: weekday 23:15–07:00, weekend 00:15–08:45 (the evening
 * before a Saturday or Sunday is the late one). Noise per docs/08 §2.1.
 */
function planDay(i: number, date: string, s: ScenarioShape, rand: () => number): DayPlan {
  const g = () => gaussian(rand);
  const wd = weekdayOf(date); // 0 Sun … 6 Sat
  const weekend = wd === 0 || wd === 6;
  const lateEvening = wd === 5 || wd === 6; // Friday and Saturday evenings
  const f = declineFactor(i, s);
  const holiday = i >= s.holiday[0] && i <= s.holiday[1];
  const exams = i >= s.exams[0] && i <= s.exams[1];

  let wake = (weekend ? 525 : 420) + 25 * g();
  let bed = (lateEvening ? 1455 : 1395) + 25 * g();
  let steps = (weekend ? 7000 : 8500) + 1500 * g();
  let speed = (weekend ? 1.3 : 1.32) + 0.04 * g();

  // Decline (docs/08 §2.2): rest midpoint +100 min, steps −35 %, walking speed −0.08 m/s.
  // Sam's first sign is going to bed later (their own plan says so): the rest shift is
  // linear too but reaches its full +100 min after 12 of the 28 days (docs/DECISIONS.md, M3).
  wake += 100 * restFactor(i, s);
  bed += 100 * restFactor(i + 1, s);
  steps *= 1 - 0.35 * f;
  speed -= 0.08 * f;
  if (holiday) {
    wake += 40;
    bed += 40;
    steps = 11000 + 1500 * g();
  }
  if (exams) {
    bed += 25;
    steps *= 0.9;
  }
  wake = q5(Math.max(300, wake));
  bed = q5(Math.min(1560, bed));
  steps = Math.max(1500, steps);

  const seg: Segment[] = [];
  const add = (from: number, to: number, place: string | null, rate: number) => {
    if (to > from) seg.push({ from, to, place, rate });
  };

  if (holiday) {
    // Another city: a quiet week. Long walks along the coast and an afternoon at the beach
    // 600 m from the hotel; no work, no gym. Few places, little spread, mostly at the hotel.
    const out = Math.max(wake + 75, 600);
    add(0, out, "hotel", RATE.hotel);
    add(out, out + 150, null, RATE.commute);
    add(out + 150, out + 270, "beach", RATE.beach);
    add(out + 270, out + 360, null, RATE.commute);
    add(out + 360, 1440, "hotel", RATE.hotel);
    return { wake, bed, steps, speed, segments: seg };
  }

  if (!weekend) {
    // "I stay inside more": the time at the office shrinks linearly (home at lunchtime at the end).
    const gymThreshold = wd === 1 ? 1 / 6 : wd === 3 ? 1 / 2 : wd === 5 ? 5 / 6 : -1; // round(3·(1−f)) visits a week; Monday dropped first
    const goesGym = gymThreshold >= 0 && f < gymThreshold;
    const shop = wd === 2 || wd === 4 || (gymThreshold >= 0 && !goesGym); // a skipped gym visit becomes a quick shop
    const leave = Math.max(wake + 50, q5(505 + 15 * g()));
    const workEnd = q5(1050 - 400 * f + 35 * g());
    add(0, leave, "home", RATE.home);
    add(leave, leave + 25, null, RATE.commute);
    add(leave + 25, workEnd, "work", RATE.work);
    add(workEnd, workEnd + 25, null, RATE.commute);
    let t = workEnd + 25;
    if (goesGym) {
      t = Math.max(t, 1075);
      add(t, t + 15, null, RATE.commute);
      add(t + 15, t + 90, "gym", RATE.gym);
      add(t + 90, t + 105, null, RATE.commute);
      t += 105;
    } else if (shop) {
      t = Math.max(t, 1075);
      add(t, t + 10, null, RATE.commute);
      add(t + 10, t + 45, "shop", RATE.shop);
      add(t + 45, t + 55, null, RATE.commute);
      t += 55;
    }
    add(workEnd + 25, t, "home", RATE.home);
    add(t, 1440, "home", RATE.home);
  } else {
    // Saturday: shop and friends; Sunday: the park, shorter as the change goes on.
    let t = Math.max(wake + 90, 630);
    add(0, t, "home", RATE.home);
    if (wd === 6) {
      add(t, t + 10, null, RATE.commute);
      add(t + 10, t + 55, "shop", RATE.shop);
      add(t + 55, t + 65, null, RATE.commute);
      t += 65;
      if (i < s.friendsDroppedFrom) {
        add(t, 840, "home", RATE.home);
        add(840, 870, null, RATE.commute);
        add(870, 1110, "friends", RATE.friends);
        add(1110, 1140, null, RATE.commute);
        t = 1140;
      }
    } else {
      const park = q5(120 * (1 - 0.75 * f));
      add(t, t + 20, null, RATE.commute);
      add(t + 20, t + 20 + park, "park", RATE.park);
      add(t + 20 + park, t + 40 + park, null, RATE.commute);
      t += 40 + park;
    }
    add(t, 1440, "home", RATE.home);
  }
  return { wake, bed, steps, speed, segments: seg };
}

/** 96 step bins: zero during rest, the rest spread by segment rate with noise, scaled to the day's total. */
function stepBins(plan: DayPlan, prevBed: number, rand: () => number): number[] {
  const restUntil = Math.max(plan.wake, prevBed - 1440);
  const w = new Array(96).fill(0);
  for (let b = 0; b < 96; b++) {
    const lo = b * 15;
    const hi = lo + 15;
    if (hi <= restUntil || lo >= plan.bed) continue;
    let acc = 0;
    for (const s of plan.segments) {
      const a = Math.max(lo, s.from, restUntil);
      const z = Math.min(hi, s.to, plan.bed);
      if (z > a) acc += (z - a) * s.rate;
    }
    w[b] = acc * (0.6 + 0.8 * rand());
  }
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return w;
  return w.map((x) => (x > 0 ? Math.max(1, Math.round((x * plan.steps) / total)) : 0));
}

function visitsOf(date: string, plan: DayPlan): Visit[] {
  const out: Visit[] = [];
  for (const s of plan.segments) {
    if (!s.place) continue;
    const p = SAM_PLACES[s.place];
    out.push({ arrive: personaTimestamp(date, s.from), depart: personaTimestamp(date, s.to), lat: p.lat, lon: p.lon });
  }
  return out;
}

/**
 * Sam wears a watch at night (docs/08 §2.1): asleep from shortly after going to bed until
 * shortly before getting up, sometimes with a brief awakening. About 1 night in 25 the watch
 * is off (charging), and that night has no sleep or heart data.
 */
function sleepOf(date: string, plan: DayPlan, prevBed: number, rand: () => number): DayRaw["sleep"] {
  const prev = addDays(date, -1);
  const start = prevBed + 8 + 17 * rand(); // minutes after midnight of the previous date
  const end = plan.wake + 1440 - 3 - 10 * rand();
  if (end - start < 120) return null;
  if (rand() < 0.5) {
    const at = start + (end - start) * (0.3 + 0.4 * rand());
    const gap = 5 + 15 * rand();
    return [
      { start: personaTimestamp(prev, start), end: personaTimestamp(prev, at) },
      { start: personaTimestamp(prev, at + gap), end: personaTimestamp(prev, end) },
    ];
  }
  return [{ start: personaTimestamp(prev, start), end: personaTimestamp(prev, end) }];
}

/**
 * Overnight heart rate variability (SDNN) and resting heart rate. During the change HRV falls
 * by up to 18 % and resting heart rate rises by up to 3.5 bpm (docs/08 §2.2); exam week adds a
 * little stress. Effect sizes are assumptions in the direction of Kemp 2010 and Siddi 2023.
 */
function heartOf(i: number, s: ScenarioShape, rand: () => number): NonNullable<DayRaw["heart"]> {
  const g = () => gaussian(rand);
  const f = declineFactor(i, s);
  const hrv = 48 * Math.exp(0.15 * g()) * (1 - 0.18 * f);
  const restingHr = 58 + 1.6 * g() + 3.5 * f;
  return { hrv: Math.round(hrv), restingHr: Math.round(restingHr) };
}

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

/** docs/08 §2. */
export function simulatePersona(seed: number, scenario: Scenario = "default"): ReplayData {
  const s = shapeOf(scenario);
  const rand = mulberry32(seed * 7919 + 17);
  const moodRand = mulberry32(seed * 104729 + 3);
  const g = () => gaussian(moodRand);
  const bodyRand = mulberry32(seed * 15485863 + 29); // its own stream: steps and places do not change
  const raws: DayRaw[] = [];
  const script: ScriptEvent[] = [];
  let prevBed = 1395;
  for (let i = 1; i <= s.days; i++) {
    const date = addDays(PERSONA_START, i - 1);
    const plan = planDay(i, date, s, rand);
    const watchWorn = bodyRand() >= 0.04;
    const sleep = sleepOf(date, plan, prevBed, bodyRand);
    const heart = heartOf(i, s, bodyRand);
    raws.push({
      date,
      stepBins15: stepBins(plan, prevBed, rand),
      walkingSpeed: Math.round(plan.speed * 1000) / 1000,
      sleep: watchWorn ? sleep : null,
      visits: visitsOf(date, plan),
      phone: null,
      heart: watchWorn ? heart : null,
    });
    prevBed = plan.bed;

    // What Sam answers if asked today.
    const f = declineFactor(i, s);
    const holiday = i >= s.holiday[0] && i <= s.holiday[1];
    const exams = i >= s.exams[0] && i <= s.exams[1];
    const wd = weekdayOf(date);
    const mood = clampInt(2 + 3 * f + (exams ? 1 : 0) + 0.7 * g(), 1, 7);
    const enjoyment = clampInt(5 - 2.2 * f + (holiday ? 1 : 0) + 0.7 * g(), 1, 7);
    const energy = clampInt(5 - 2 * f + 0.7 * g(), 1, 7);
    const company = holiday ? "Partner or family" : wd === 6 && i < s.friendsDroppedFrom ? "Friends" : wd >= 1 && wd <= 5 && f < 0.5 ? "Colleagues or classmates" : "Alone";
    const eat: "yes" | "partly" | "no" = f > 0.6 ? "no" : f > 0.3 ? "partly" : "yes";
    const reply: "yes" | "partly" | "no" = f > 0.75 ? "no" : f > 0.4 ? "partly" : "yes";
    let freeText: string | null = null;
    let expectedContext: unknown = undefined;
    if (i === s.holiday[0]) {
      freeText = SAM_HOLIDAY_TEXT;
      expectedContext = { context: "holiday", start_hint: "this week", end_hint: "back on Sunday", confidence: "high", quote: "I'm in Spain this week" };
    } else if (i === s.exams[0]) {
      freeText = SAM_EXAM_TEXT;
      expectedContext = { context: "exams", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "Exam week, lots of stress" };
    } else if (f > 0.7 && i % 4 === 0) {
      freeText = "Didn't really feel like going out. Stayed in and watched things most of the evening.";
      expectedContext = { context: "none", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "Stayed in" };
    }
    if (i === 20 || i === 47) {
      script.push({ date, type: "ignore_checkin" });
    } else {
      script.push({
        date,
        type: "checkin_answer",
        answers: { mood_low: mood, enjoyment, energy, company },
        personal: { "Did you eat well today?": eat, "Did you reply to messages today?": reply },
        freeText,
        ...(expectedContext !== undefined ? { expectedContext } : {}),
      });
    }
  }
  const d = (i: number) => addDays(PERSONA_START, i - 1);
  script.unshift(
    { date: d(1), type: "plan_text", text: SAM_PLAN_TEXT, expected: SAM_PLAN_EXPECTED, places: { gym: "gym" } },
    { date: d(1), type: "questionnaire_answers", instrument: "PHQ9", answers: [0, 1, 1, 0, 0, 0, 1, 0, 0] },
    { date: d(1), type: "questionnaire_answers", instrument: "PHQ2", answers: [0, 1] },
  );
  // From the decline onwards: PHQ-2 = 4, PHQ-9 = 13 (docs/08 §2.2); later a partial recovery.
  const lowFrom = s.decline[0];
  script.push(
    { date: d(lowFrom), type: "questionnaire_answers", instrument: "PHQ2", answers: [2, 2] },
    { date: d(lowFrom), type: "questionnaire_answers", instrument: "PHQ9", answers: [2, 2, 2, 2, 1, 1, s.phq9Item9 > 0 ? 1 : 2, 1, s.phq9Item9] },
    { date: d(135), type: "questionnaire_answers", instrument: "PHQ9", answers: [1, 1, 1, 1, 1, 0, 1, 0, 0] },
  );
  script.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const phases: Phase[] = [
    { name: "Stable", fromDay: 1, toDay: s.holiday[0] - 1 },
    { name: "Holiday", fromDay: s.holiday[0], toDay: s.holiday[1] },
    ...(s.exams[0] < s.days ? [{ name: "Stable", fromDay: s.holiday[1] + 1, toDay: s.exams[0] - 1 }, { name: "Exam week", fromDay: s.exams[0], toDay: s.exams[1] }] : []),
    ...(s.decline[0] <= s.days ? [{ name: "Gradual change", fromDay: s.decline[0], toDay: s.decline[1] }, { name: "After", fromDay: s.decline[1] + 1, toDay: s.days }] : [{ name: "Stable", fromDay: s.holiday[1] + 1, toDay: s.days }]),
  ];
  return { startDate: PERSONA_START, raws, script, places: Object.values(SAM_PLACES), phases };
}

/** The persona's scripted questionnaire answers for an instrument on `date` (latest on or before). */
export function scriptedQuestionnaire(script: ScriptEvent[], instrument: "PHQ2" | "PHQ9", date: string): number[] | null {
  let best: number[] | null = null;
  for (const e of script) if (e.type === "questionnaire_answers" && e.instrument === instrument && e.date <= date) best = e.answers;
  return best;
}

/** The persona's scripted check-in event for `date`. */
export function scriptedCheckin(script: ScriptEvent[], date: string): Extract<ScriptEvent, { type: "checkin_answer" | "ignore_checkin" }> | null {
  return (script.find((e) => e.date === date && (e.type === "checkin_answer" || e.type === "ignore_checkin")) as Extract<ScriptEvent, { type: "checkin_answer" | "ignore_checkin" }>) ?? null;
}
