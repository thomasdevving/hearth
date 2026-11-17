// A headless run of the app loop over replay data, with scripted answers and scripted model
// outputs. Used by the engine tests (docs/08 §2.3) and by the evaluation scripts. The web app
// runs the same loop through its UI with real models.
import type {
  Action,
  CheckinRecord,
  Config,
  ContextLabel,
  DayRecord,
  EngineState,
  PersonalItem,
  PlanAction,
  PlanRule,
  QuestionnaireRecord,
  ReplayData,
} from "../types";
import { defaultConfig } from "../config";
import { dailyUpdate, initialState, applyQuestionnaireResult } from "../state";
import { addDays, dateOfTimestamp } from "../time";
import { verifyContext, verifyPlan } from "../guardrails/verify";
import { scoreQuestionnaire, remissionScore } from "../questionnaires";
import { onCheckinCompleted } from "../checkin";
import { pickPlace } from "../places";
import { personaTimestamp, scriptedCheckin, scriptedQuestionnaire } from "./persona";

export interface HeadlessOptions {
  cfg?: Config;
  seed?: number; // engine PRNG seed
  confirmContexts?: boolean; // the user confirms what task H finds (default true)
  days?: number; // stop after this many days
  withPlan?: boolean; // accept the scripted plan on day 1 (default true)
}

export interface HeadlessDay {
  date: string;
  day: number;
  actions: Action[];
  checkin: CheckinRecord | null;
  questionnaires: QuestionnaireRecord[];
  contextAdded: ContextLabel | null;
  phq2Offered: boolean;
}

export interface HeadlessResult {
  days: HeadlessDay[];
  records: DayRecord[];
  state: EngineState;
  rules: PlanRule[];
  items: PersonalItem[];
  actions: PlanAction[];
  checkins: CheckinRecord[];
  questionnaires: QuestionnaireRecord[];
  contexts: ContextLabel[];
}

export function runHeadless(data: ReplayData, opts: HeadlessOptions = {}): HeadlessResult {
  const cfg = opts.cfg ?? defaultConfig;
  const confirm = opts.confirmContexts ?? true;
  let state = initialState(opts.seed ?? 1);
  let rules: PlanRule[] = [];
  let items: PersonalItem[] = [];
  let planActions: PlanAction[] = [];
  const records: DayRecord[] = [];
  const checkins: CheckinRecord[] = [];
  const questionnaires: QuestionnaireRecord[] = [];
  const contexts: ContextLabel[] = [];
  const days: HeadlessDay[] = [];
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;

  const take = (instrument: "PHQ2" | "PHQ9", date: string, minute: number): QuestionnaireRecord | null => {
    const answers = scriptedQuestionnaire(data.script, instrument, date);
    if (!answers) return null;
    const result = scoreQuestionnaire(instrument, answers, remissionScore(questionnaires, date), cfg);
    const rec: QuestionnaireRecord = { id: id("q"), instrument, takenAt: personaTimestamp(date, minute), answers, result };
    questionnaires.push(rec);
    state = applyQuestionnaireResult(state, result);
    return rec;
  };

  // Day 1, onboarding: plan (task G, scripted output) → baseline PHQ-9.
  const planEvent = data.script.find((e) => e.type === "plan_text");
  if ((opts.withPlan ?? true) && planEvent && planEvent.type === "plan_text") {
    const plan = verifyPlan(planEvent.expected, planEvent.text, cfg);
    for (const r of plan.rules) {
      let placeId: string | null = null;
      if (r.feature === "place_visits" && r.place_label) {
        const label = planEvent.places?.[r.place_label] ?? r.place_label;
        const p = data.places.find((x) => x.label === label);
        if (p) {
          const picked = pickPlace(state, r.place_label, p.lat, p.lon, cfg);
          state = picked.state;
          placeId = picked.placeId;
        }
      }
      rules.push({ id: id("r"), feature: r.feature, direction: r.direction, placeId, quote: r.quote, active: true });
    }
    items = plan.personal_checkin_items.map((x) => ({ id: id("i"), question: x.question, quote: x.quote, active: true }));
    planActions = plan.actions.map((x) => ({ id: id("a"), text: x.text, quote: x.quote, active: true }));
  }
  rules = rules.filter((r) => r.feature !== "place_visits" || r.placeId !== null);
  take("PHQ9", data.startDate, 8 * 60);

  const limit = Math.min(opts.days ?? data.raws.length, data.raws.length);
  for (let i = 0; i < limit; i++) {
    const date = data.raws[i].date;
    // Free text the persona writes during the day is entered before that day's data is
    // processed at night (docs/DECISIONS.md, M3).
    let noteContext: ContextLabel | null = null;
    const noteEv = scriptedCheckin(data.script, date);
    if (noteEv && noteEv.type === "checkin_answer" && noteEv.freeText && noteEv.expectedContext !== undefined) {
      const v = verifyContext(noteEv.expectedContext, noteEv.freeText, date, cfg);
      if (v && confirm) {
        noteContext = { id: id("ctx"), type: v.type, kind: v.kind, start: v.start, end: v.end, quote: v.quote, source: "model", confirmed: true };
        contexts.push(noteContext);
      }
    }
    const out = dailyUpdate({
      date,
      raws: data.raws.slice(Math.max(0, i - 69), i + 1),
      history: records,
      state,
      rules,
      contexts,
      checkins: checkins.filter((c) => dateOfTimestamp(c.scheduledAt) > addDays(date, -14)),
      questionnaires,
      cfg,
    });
    state = out.state;
    records.push(out.record);
    const day: HeadlessDay = { date, day: i + 1, actions: out.actions, checkin: null, questionnaires: [], contextAdded: noteContext, phq2Offered: false };

    for (const a of out.actions) {
      if (a.type === "schedule_checkin") {
        const ev = scriptedCheckin(data.script, date);
        const answered = ev !== null && ev.type === "checkin_answer";
        const rec: CheckinRecord = {
          id: id("c"),
          scheduledAt: personaTimestamp(date, 18 * 60),
          answeredAt: answered ? personaTimestamp(date, 18 * 60 + 5) : null,
          kind: a.kind,
          reasons: a.reasons,
          answers: answered ? { ...ev.answers } : {},
          personalAnswers: answered ? Object.fromEntries(items.map((it) => [it.id, ev.personal[it.question] ?? "yes"])) : {},
          hasFreeText: answered && !!ev.freeText,
        };
        checkins.push(rec);
        day.checkin = rec;
        if (answered) {
          const res = onCheckinCompleted({
            record: rec,
            freeText: ev.freeText,
            recentCheckins: checkins.filter((c) => dateOfTimestamp(c.scheduledAt) > addDays(date, -14)),
            questionnaires,
            state: state.state,
            date,
            cfg,
          });
          if (res.offerPhq2) {
            day.phq2Offered = true;
            const q = take("PHQ2", date, 18 * 60 + 10);
            if (q) day.questionnaires.push(q);
            if (q?.result.positive) {
              const q9 = take("PHQ9", date, 18 * 60 + 15);
              if (q9) day.questionnaires.push(q9);
            }
          }
        }
      } else if (a.type === "offer_questionnaire") {
        if (day.questionnaires.some((q) => q.instrument === a.id)) continue;
        if (a.id === "PHQ2") day.phq2Offered = true;
        const q = take(a.id, date, 19 * 60);
        if (q) day.questionnaires.push(q);
        if (q && a.id === "PHQ2" && q.result.positive) {
          const q9 = take("PHQ9", date, 19 * 60 + 5);
          if (q9) day.questionnaires.push(q9);
        }
      }
    }
    days.push(day);
  }
  return { days, records, state, rules, items, actions: planActions, checkins, questionnaires, contexts };
}
