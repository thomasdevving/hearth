import type { Action, CheckinRecord, Config, ContextLabel, DayRaw, DayRecord, EngineState, PlanRule, QuestionnaireRecord, Visit } from "../src/types";
import { defaultConfig } from "../src/config";
import { dailyUpdate, initialState } from "../src/state";
import { gaussian, mulberry32 } from "../src/stats";
import { addDays, dayTypeOf } from "../src/time";

// A small synthetic person for the detection tests: fully controlled, no simulator.

export const HOME = { lat: 52.09, lon: 5.12 };
export const WORK = { lat: 52.08, lon: 5.17 };
export const GYM = { lat: 52.1, lon: 5.1 };
export const FAR = { lat: 39.47, lon: -0.37 };

export interface DaySpec {
  steps?: number;
  restStart?: number; // minutes after midnight of the date, negative = previous evening
  restEnd?: number;
  nextRestStart?: number; // this evening, minutes after midnight (default 1380 = 23:00)
  speed?: number | null;
  away?: { lat: number; lon: number; from: number; to: number }[]; // minutes of the day
  place?: { lat: number; lon: number }; // where the nights are spent (default HOME)
  hourWeights?: number[]; // 24 relative weights for awake hours
  noVisits?: boolean;
  noSteps?: boolean;
}

const t = (date: string, min: number) => {
  const d = min >= 1440 ? addDays(date, 1) : date;
  const m = min >= 1440 ? min - 1440 : min;
  return `${d}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}:00+00:00`;
};

export function makeDay(date: string, spec: DaySpec = {}): DayRaw {
  const steps = spec.steps ?? 8000;
  const restEnd = spec.restEnd ?? 420;
  const nextRest = spec.nextRestStart ?? 1380;
  const awake: number[] = [];
  for (let b = 0; b < 96; b++) {
    const mid = b * 15 + 7.5;
    if (mid >= restEnd && mid < nextRest) awake.push(b);
  }
  const weights = awake.map((b) => (spec.hourWeights ? spec.hourWeights[b >> 2] : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const bins = new Array(96).fill(0);
  awake.forEach((b, i) => (bins[b] = Math.max(1, Math.round((steps * weights[i]) / total))));
  const home = spec.place ?? HOME;
  const weekday = dayTypeOf(date) === "weekday";
  const away = spec.away ?? (weekday ? [{ ...WORK, from: 540, to: 1020 }] : []);
  const visits: Visit[] = [];
  let cursor = 0;
  for (const a of [...away].sort((x, y) => x.from - y.from)) {
    if (a.from - 15 > cursor) visits.push({ arrive: t(date, cursor), depart: t(date, a.from - 15), lat: home.lat, lon: home.lon });
    visits.push({ arrive: t(date, a.from), depart: t(date, a.to), lat: a.lat, lon: a.lon });
    cursor = a.to + 15;
  }
  if (cursor < 1440) visits.push({ arrive: t(date, cursor), depart: t(date, 1440), lat: home.lat, lon: home.lon });
  return {
    date,
    stepBins15: spec.noSteps ? null : bins,
    walkingSpeed: spec.speed === undefined ? 1.3 : spec.speed,
    sleep: null,
    visits: spec.noVisits ? null : visits,
    phone: null,
  };
}

/** `n` days from `start` with seeded day-to-day noise; `shape` can change any day. */
export function makeDays(start: string, n: number, seed: number, shape: (dayNumber: number, date: string) => DaySpec = () => ({}), noise = 1): DayRaw[] {
  const rand = mulberry32(seed);
  const g = () => gaussian(rand) * noise;
  const out: DayRaw[] = [];
  let prevNextRest = 1380;
  for (let i = 1; i <= n; i++) {
    const date = addDays(start, i - 1);
    const s = shape(i, date);
    const quant = (x: number) => Math.round(x / 15) * 15;
    const nextRestStart = quant((s.nextRestStart ?? 1380) + 20 * g());
    out.push(
      makeDay(date, {
        ...s,
        steps: Math.max(1000, (s.steps ?? 8000) + 1000 * g()),
        restEnd: quant((s.restEnd ?? 420) + 20 * g()),
        nextRestStart,
        speed: s.speed === null ? null : (s.speed ?? 1.3) + 0.03 * g(),
      }),
    );
    prevNextRest = nextRestStart;
  }
  void prevNextRest;
  return out;
}

export interface RunOptions {
  cfg?: Config;
  seed?: number;
  rules?: PlanRule[];
  contexts?: ContextLabel[];
  questionnaires?: QuestionnaireRecord[];
  answer?: (date: string, kind: string) => CheckinRecord["answers"] | null; // null = ignored
  state?: EngineState;
  /** Days before this date are scored with `learnOnly` (history read at install). */
  learnOnlyBefore?: string;
}
export interface RunResult {
  records: DayRecord[];
  state: EngineState;
  actions: Action[][];
  checkins: CheckinRecord[];
}

/** Call dailyUpdate for every day, oldest first, storing check-ins the way an app would. */
export function runDays(raws: DayRaw[], opts: RunOptions = {}): RunResult {
  const cfg = opts.cfg ?? defaultConfig;
  let state = opts.state ?? initialState(opts.seed ?? 1);
  const records: DayRecord[] = [];
  const actions: Action[][] = [];
  const checkins: CheckinRecord[] = [];
  for (let i = 0; i < raws.length; i++) {
    const date = raws[i].date;
    const out = dailyUpdate({
      date,
      raws: raws.slice(Math.max(0, i - 69), i + 1),
      history: records,
      state,
      rules: opts.rules ?? [],
      contexts: opts.contexts ?? [],
      checkins: checkins.filter((c) => c.scheduledAt.slice(0, 10) > addDays(date, -14)),
      questionnaires: opts.questionnaires ?? [],
      cfg,
      ...(opts.learnOnlyBefore && date < opts.learnOnlyBefore ? { learnOnly: true } : {}),
    });
    state = out.state;
    records.push(out.record);
    actions.push(out.actions);
    for (const a of out.actions) {
      if (a.type !== "schedule_checkin") continue;
      const answers = opts.answer ? opts.answer(date, a.kind) : { mood_low: 2, enjoyment: 5, energy: 5 };
      checkins.push({
        id: `c${checkins.length + 1}`,
        scheduledAt: `${date}T09:00:00+00:00`,
        answeredAt: answers ? `${date}T09:05:00+00:00` : null,
        kind: a.kind,
        reasons: a.reasons,
        answers: answers ?? {},
        personalAnswers: {},
        hasFreeText: false,
      });
    }
  }
  return { records, state, actions, checkins };
}

export const START = "2026-06-18"; // a Thursday
