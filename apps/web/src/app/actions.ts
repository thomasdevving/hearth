// What the user does, in one place, used by the screens and by the time machine's auto mode.
import {
  applyQuestionnaireResult,
  CONTEXT_TABLE,
  dateOfTimestamp,
  detectCrisis,
  languageFeatures,
  onCheckinCompleted,
  remissionScore,
  scoreQuestionnaire,
  verifyContext,
  resolveDateHint,
  verifyPlan,
  pickPlace,
  addDays,
  type CheckinRecord,
  type ContextLabel,
  type DiaryMarkers,
  type PersonalAnswer,
  type QuestionnaireRecord,
  type VerifiedContext,
  type VerifiedPlan,
} from "@hearth/engine";
import { db, getSingleton, newId, putSingleton, updateSettings, getSettings, type InboxItem } from "../store/db";
import { addInbox, closeInbox, cfg, getEngineState, openInbox, resumeAfterNote, currentReplay, processDay, getMeta } from "./runtime";
import { getToday, nowStamp, stampAt } from "./clock";
import { emitChange, navigate } from "./events";
import { router } from "../inference";

// ---------- safety (docs/06 §4) ----------
export async function openSafety(entry: "phq9_item9" | "keyword" | "model_crisis" | "button"): Promise<void> {
  await db.safety_events.put({ id: newId("safety"), at: nowStamp(), entry });
  safetyListeners.forEach((l) => l());
  navigate("safety");
}
const safetyListeners = new Set<() => void>();
export function onSafety(l: () => void): () => void {
  safetyListeners.add(l);
  return () => safetyListeners.delete(l);
}

// ---------- free text: crisis keywords, task H, task B ----------
export interface TextOptions {
  date: string;
  diaryId: string;
  auto?: boolean; // the time machine is answering for the persona
  expectedContext?: unknown; // the persona's scripted reading of the text
}

/** Returns true when the safety flow was opened. */
export async function processFreeText(text: string, opts: TextOptions): Promise<boolean> {
  // Keyword check first, independent of any model (docs/05 §5.3).
  const crisis = detectCrisis(text);
  await db.diary.put({ id: opts.diaryId, date: opts.date, text, markers: null, markersSource: "none", language: languageFeatures(text) });
  if (crisis) {
    await openSafety("keyword");
    return true;
  }

  // Task H: context (S3, on-device only).
  const h = await router().run<VerifiedContext | null>("H", { text }, { sourceText: text, verify: { sourceText: text, today: opts.date, cfg } });
  const found: VerifiedContext | null = h.ok ? h.value : null;
  const ranOn = h.ok ? h.ranOn : "none";
  let scripted: VerifiedContext | null = null;
  if (opts.expectedContext !== undefined) scripted = verifyContext(opts.expectedContext, text, opts.date, cfg);
  if (opts.auto) {
    // The persona confirms what the model found if it matches their own reading; otherwise
    // they pick it in the one-tap picker.
    const pick = found && scripted && found.type === scripted.type ? found : scripted;
    if (pick) await confirmContextLabel(toLabel(pick, h.ok && pick === found ? "model" : "manual"));
  } else if (found) {
    await addInbox({ date: opts.date, type: "context_confirm", context: toLabel(found, "model", false), sourceText: text, ranOn });
  } else if (!h.ok) {
    // No model: the one-tap context picker (docs/05 §3).
    await addInbox({ date: opts.date, type: "context_confirm", context: emptyLabel(opts.date, text), sourceText: text, ranOn: "none" });
  }

  // Task B: diary markers (S3, P1). Display only (R6).
  const b = await router().run<DiaryMarkers>("B", { text }, { sourceText: text });
  if (b.ok) {
    const entry = await db.diary.get(opts.diaryId);
    if (entry) await db.diary.put({ ...entry, markers: b.value, markersSource: b.ranOn });
    if (b.value.crisis === "explicit") {
      await openSafety("model_crisis");
      return true;
    }
    if (b.value.crisis === "possible") {
      // docs/06 §4.4: support in place, not a full-screen takeover; the resources are always shown.
      await db.safety_events.put({ id: newId("safety"), at: nowStamp(), entry: "model_possible" });
      if (!(await openInbox()).some((i) => i.type === "support")) await addInbox({ date: opts.date, type: "support" });
    }
  }
  emitChange();
  return false;
}

function toLabel(v: VerifiedContext, source: "model" | "manual", confirmed = true): ContextLabel {
  return { id: newId("ctx"), type: v.type, kind: v.kind, start: v.start, end: v.end, quote: v.quote, source, confirmed };
}
/**
 * The one-tap picker without a model. The period is still read from the note, in code, with
 * the engine's own date resolver: "until Sunday" ends on Sunday, "since Tuesday" starts on
 * Tuesday. Without such a phrase: today plus 6 days.
 */
function emptyLabel(date: string, text = ""): ContextLabel {
  const startHint = text.match(/\bsince\s+(?:last\s+)?[a-z0-9]+/i)?.[0] ?? null;
  const endHint = text.match(/\b(?:until|till|through|back on)\s+(?:next\s+|this\s+)?[a-z0-9]+(?:\s+(?:week|weekend))?/i)?.[0] ?? null;
  const start = resolveDateHint(startHint, date, "start") ?? date;
  const resolvedEnd = resolveDateHint(endHint, date, "end", start);
  const end = resolvedEnd && resolvedEnd >= start ? resolvedEnd : addDays(start, 6);
  return { id: newId("ctx"), type: "", kind: "explains_sensors", start, end, quote: null, source: "manual", confirmed: false };
}

export async function confirmContextLabel(label: ContextLabel, inboxId?: string): Promise<void> {
  const kind = CONTEXT_TABLE[label.type]?.kind ?? label.kind;
  await db.contexts.put({ ...label, kind, confirmed: true });
  if (inboxId) {
    await closeInbox(inboxId, "done");
    await resumeAfterNote(); // a day waiting for this confirmation is processed now
  }
  emitChange();
}
export async function rejectContext(inboxId: string): Promise<void> {
  await closeInbox(inboxId, "dismissed");
  await resumeAfterNote();
  emitChange();
}

/** A note written outside a check-in (docs/DECISIONS.md, M3). */
export async function submitNote(text: string, opts: { auto?: boolean; expectedContext?: unknown; inboxId?: string } = {}): Promise<boolean> {
  const date = getToday();
  if (opts.inboxId) await closeInbox(opts.inboxId, "done");
  const safety = text.trim() ? await processFreeText(text, { date, diaryId: newId("note"), auto: opts.auto, expectedContext: opts.expectedContext }) : false;
  await resumeAfterNote();
  emitChange();
  return safety;
}
export async function skipNote(inboxId: string): Promise<void> {
  await closeInbox(inboxId, "dismissed");
  await resumeAfterNote();
  emitChange();
}

// ---------- check-ins ----------
export interface CheckinAnswers {
  answers: { mood_low: number; enjoyment: number; energy: number; company: string };
  personal: Record<string, PersonalAnswer>; // by personal item id
  freeText: string | null;
}

export async function completeCheckin(checkinId: string, a: CheckinAnswers, opts: { auto?: boolean; expectedContext?: unknown } = {}): Promise<{ safety: boolean; offerPhq2: boolean; support: boolean }> {
  const rec = await db.checkins.get(checkinId);
  if (!rec) throw new Error("unknown check-in");
  const date = dateOfTimestamp(rec.scheduledAt);
  const text = a.freeText && a.freeText.trim() ? a.freeText.trim() : null;
  const updated: CheckinRecord = { ...rec, answeredAt: stampAt(date, 18 * 60 + 5), answers: { ...a.answers }, personalAnswers: { ...a.personal }, hasFreeText: !!text };
  await db.checkins.put(updated);
  for (const item of await openInbox()) if (item.type === "checkin" && item.checkinId === checkinId) await closeInbox(item.id, "done");
  const state = await getEngineState();
  const since = addDays(date, -14);
  const out = onCheckinCompleted({
    record: updated,
    freeText: text,
    recentCheckins: (await db.checkins.toArray()).filter((c) => dateOfTimestamp(c.scheduledAt) > since),
    questionnaires: await db.questionnaires.toArray(),
    state: state?.state ?? "WARM_UP",
    date,
    cfg,
  });
  let safety = false;
  if (out.crisis) {
    await db.diary.put({ id: checkinId, date, text, markers: null, markersSource: "none", language: out.language });
    await openSafety("keyword");
    safety = true;
  } else if (text) {
    safety = await processFreeText(text, { date, diaryId: checkinId, auto: opts.auto, expectedContext: opts.expectedContext });
  }
  if (out.offerPhq2 && !(await openInbox()).some((i) => i.type === "questionnaire")) {
    await addInbox({ date, type: "questionnaire", instrument: "PHQ2", reason: "momentary" });
  }
  emitChange();
  return { safety, offerPhq2: out.offerPhq2, support: (await openInbox()).some((i) => i.type === "support") };
}

/** "Not today": the check-in counts as ignored. */
export async function skipCheckin(checkinId: string): Promise<void> {
  for (const item of await openInbox()) if (item.type === "checkin" && item.checkinId === checkinId) await closeInbox(item.id, "dismissed");
  emitChange();
}

// ---------- questionnaires ----------
export async function submitQuestionnaire(instrument: "PHQ2" | "PHQ9", answers: number[], opts: { baseline?: boolean } = {}): Promise<QuestionnaireRecord> {
  const date = getToday();
  const qs = await db.questionnaires.toArray();
  const result = scoreQuestionnaire(instrument, answers, remissionScore(qs, date), cfg);
  const rec: QuestionnaireRecord = { id: newId("q"), instrument, takenAt: opts.baseline ? stampAt(date, 9 * 60) : stampAt(date, 19 * 60 + qs.length % 50), answers, result };
  await db.questionnaires.put(rec);
  const state = await getEngineState();
  if (state) await putSingleton(db.engine_state, applyQuestionnaireResult(state, result));
  for (const item of await openInbox()) if (item.type === "questionnaire" && item.instrument === instrument) await closeInbox(item.id, "done");
  // A positive PHQ-2 leads to the PHQ-9, unless one was taken in the last week.
  const recent9 = qs.some((q) => q.instrument === "PHQ9" && addDays(dateOfTimestamp(q.takenAt), cfg.phq2CooldownDays) > date);
  if (instrument === "PHQ2" && result.positive && !recent9) await addInbox({ date, type: "questionnaire", instrument: "PHQ9", reason: "persistent" });
  emitChange();
  if (result.safetyItemPositive) await openSafety("phq9_item9");
  return rec;
}

export async function dismissQuestionnaire(instrument: "PHQ2" | "PHQ9"): Promise<void> {
  for (const item of await openInbox()) if (item.type === "questionnaire" && item.instrument === instrument) await closeInbox(item.id, "dismissed");
  emitChange();
}

// ---------- plan (task G) ----------
export interface CardChoice<T> {
  card: T;
  accepted: boolean;
}

export async function savePlan(source: { warning: string; helps: string }, plan: VerifiedPlan, choices: { rules: boolean[]; items: boolean[]; actions: boolean[] }, placePicks: Record<number, { lat: number; lon: number } | null>): Promise<void> {
  await putSingleton(db.plan_source, source);
  let state = await getEngineState();
  await db.plan_rules.clear();
  await db.personal_items.clear();
  await db.plan_actions.clear();
  for (let i = 0; i < plan.rules.length; i++) {
    if (!choices.rules[i]) continue;
    const r = plan.rules[i];
    let placeId: string | null = null;
    if (r.feature === "place_visits") {
      const pick = placePicks[i];
      if (!pick || !state) continue;
      const res = pickPlace(state, r.place_label ?? "place", pick.lat, pick.lon, cfg);
      state = res.state;
      placeId = res.placeId;
    }
    await db.plan_rules.put({ id: newId("rule"), feature: r.feature, direction: r.direction, placeId, quote: r.quote, active: true });
  }
  if (state) await putSingleton(db.engine_state, state);
  for (let i = 0; i < plan.personal_checkin_items.length; i++) {
    if (!choices.items[i]) continue;
    const it = plan.personal_checkin_items[i];
    await db.personal_items.put({ id: newId("item"), question: it.question, quote: it.quote, active: true });
  }
  for (let i = 0; i < plan.actions.length; i++) {
    if (!choices.actions[i]) continue;
    const a = plan.actions[i];
    await db.plan_actions.put({ id: newId("action"), text: a.text, quote: a.quote, active: true });
  }
  await updateSettings({ planDone: true });
  emitChange();
}

// ---------- onboarding, auto mode ----------
export async function finishOnboardingDay(): Promise<void> {
  const s = await getSettings();
  if (!s.onboarded) await updateSettings({ onboarded: true });
  const meta = await getMeta();
  const state = await getEngineState();
  if (meta && state && state.lastProcessedDate === null) await processDay(meta.today);
  emitChange();
}

/** The persona goes through onboarding with the scripted plan and baseline PHQ-9. */
export async function autoOnboard(): Promise<void> {
  const data = await currentReplay();
  if (!data) return;
  const s = await getSettings();
  if (!s.planDone) {
    const ev = data.script.find((e) => e.type === "plan_text");
    if (ev && ev.type === "plan_text") {
      const plan = verifyPlan(ev.expected, ev.text, cfg);
      const picks: Record<number, { lat: number; lon: number } | null> = {};
      plan.rules.forEach((r, i) => {
        const label = r.place_label ? (ev.places?.[r.place_label] ?? r.place_label) : null;
        const p = label ? data.places.find((x) => x.label === label) : null;
        picks[i] = p ? { lat: p.lat, lon: p.lon } : null;
      });
      await savePlan({ warning: ev.text, helps: "" }, plan, { rules: plan.rules.map(() => true), items: plan.personal_checkin_items.map(() => true), actions: plan.actions.map(() => true) }, picks);
    }
  }
  if (!(await getSettings()).baselineDone) {
    const ev = data.script.find((e) => e.type === "questionnaire_answers" && e.instrument === "PHQ9");
    if (ev && ev.type === "questionnaire_answers") await submitQuestionnaire("PHQ9", ev.answers, { baseline: true });
    await updateSettings({ baselineDone: true });
  }
  await finishOnboardingDay();
}

/** Answer an inbox item with the persona's script (time machine auto mode). */
export async function autoAnswer(item: InboxItem): Promise<void> {
  const data = await currentReplay();
  if (!data || item.status !== "open") return;
  const { scriptedCheckin, scriptedQuestionnaire } = await import("@hearth/engine");
  if (item.type === "checkin") {
    const ev = scriptedCheckin(data.script, item.date);
    if (!ev || ev.type === "ignore_checkin") return skipCheckin(item.checkinId);
    const items = await db.personal_items.toArray();
    const personal = Object.fromEntries(items.map((it) => [it.id, ev.personal[it.question] ?? "yes"]));
    const meta = await getMeta();
    // A scripted text already entered as that day's note is not repeated.
    const text = ev.freeText && !meta?.notesHandled.includes(item.date) ? ev.freeText : null;
    await completeCheckin(item.checkinId, { answers: ev.answers, personal, freeText: text }, { auto: true, expectedContext: ev.expectedContext });
  } else if (item.type === "questionnaire") {
    const answers = scriptedQuestionnaire(data.script, item.instrument, item.date);
    if (!answers) return dismissQuestionnaire(item.instrument);
    await submitQuestionnaire(item.instrument, answers);
  } else if (item.type === "context_confirm") {
    if (item.context.type) await confirmContextLabel(item.context, item.id);
    else await rejectContext(item.id);
  } else if (item.type === "note") {
    await submitNote(item.text, { auto: true, expectedContext: item.expectedContext, inboxId: item.id });
  } else if (item.type === "context_expired") {
    await closeInbox(item.id, "done");
  }
}

export async function getSafetyPlan() {
  return getSingleton(db.safety_plan);
}
