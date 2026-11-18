// The app loop: the time machine feeds the engine one simulated day at a time (docs/08 §3),
// and the engine's actions become items in the inbox that the screens show.
import {
  addDays,
  SAM_HELPED_NOTE,
  dailyUpdate,
  dateOfTimestamp,
  defaultConfig,
  initialState,
  isoWeekOf,
  aggregateWeek,
  datesOfIsoWeek,
  simulatePersona,
  scriptedCheckin,
  type Config,
  type ReplayData,
  type Scenario,
  type CheckinRecord,
  type EngineState,
  type InboxItemType,
} from "./engine-extra";
import { db, getSettings, getSingleton, newId, putSingleton, updateSettings, clearAll, type InboxItem, type ReplayMeta } from "../store/db";
import { setToday, stampAt } from "./clock";
import { emitChange } from "./events";

// The web replay always uses the bundled defaults so that it is reproducible (docs/07 §5).
export const cfg: Config = defaultConfig;

let replayCache: { key: string; data: ReplayData } | null = null;
export function replayData(scenario: Scenario, seed: number): ReplayData {
  const key = `${scenario}:${seed}`;
  if (!replayCache || replayCache.key !== key) replayCache = { key, data: simulatePersona(seed, scenario) };
  return replayCache.data;
}

export async function getMeta(): Promise<ReplayMeta | null> {
  return getSingleton(db.replay);
}
export async function currentReplay(): Promise<ReplayData | null> {
  const m = await getMeta();
  return m ? replayData(m.scenario, m.seed) : null;
}
export async function getEngineState(): Promise<EngineState | null> {
  return getSingleton(db.engine_state);
}

/** Reset the local store and load a persona (docs/08 §3). Consent and model switches are kept. */
export async function loadPersona(scenario: Scenario, seed: number): Promise<void> {
  const data = replayData(scenario, seed);
  const prev = await getSettings();
  await clearAll();
  await updateSettings({ cloudConsent: prev.cloudConsent, onDeviceEnabled: prev.onDeviceEnabled, online: prev.online, onboarded: false, planDone: false, baselineDone: false, firstUploadConfirmed: prev.firstUploadConfirmed });
  await putSingleton(db.replay, { scenario, seed, startDate: data.startDate, today: data.startDate, dayNumber: 1, notesHandled: [] });
  await putSingleton(db.engine_state, initialState(seed));
  // Sam saved one note after an earlier hard week, before the replay starts.
  await db.helped_notes.put({ id: "seed-sam-1", signQuote: SAM_HELPED_NOTE.signQuote, text: SAM_HELPED_NOTE.text, audio: null, message: SAM_HELPED_NOTE.message, contactName: SAM_HELPED_NOTE.contactName, createdAt: SAM_HELPED_NOTE.savedOn, source: "seed", archived: false });
  setToday(data.startDate);
  emitChange();
}

export async function ensureLoaded(): Promise<ReplayMeta> {
  let m = await getMeta();
  if (!m) {
    await loadPersona("default", 1);
    m = (await getMeta()) as ReplayMeta;
  }
  setToday(m.today);
  return m;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewInboxItem = DistributiveOmit<InboxItem, "id" | "status">;

export async function addInbox(item: NewInboxItem): Promise<InboxItem> {
  const full = { ...item, id: newId("inbox"), status: "open" } as InboxItem;
  await db.inbox.put(full);
  return full;
}

export async function openInbox(): Promise<InboxItem[]> {
  return (await db.inbox.where("status").equals("open").toArray()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Items that need the user before time can move on (Play pauses on them). */
export const BLOCKING: InboxItemType[] = ["checkin", "questionnaire", "context_confirm", "note"];

export async function closeInbox(id: string, status: "done" | "dismissed" = "done"): Promise<void> {
  await db.inbox.update(id, { status });
}

export interface DayHooks {
  /** Called for every new inbox item; auto mode answers it with the persona's script. */
  onItem?: (item: InboxItem) => Promise<void>;
  /** The weekly aggregate of a finished ISO week (M7: upload). */
  onWeek?: (isoWeek: string) => Promise<void>;
}

/** Run the engine for one date and turn the actions into inbox items. */
export async function processDay(date: string, hooks: DayHooks = {}): Promise<void> {
  const meta = (await getMeta()) as ReplayMeta;
  const data = replayData(meta.scenario, meta.seed);
  const raw = data.raws.find((r) => r.date === date);
  if (!raw) throw new Error(`no data for ${date}`);
  await db.day_raw.put(raw);
  const state = (await getEngineState()) ?? initialState(meta.seed);
  if (state.lastProcessedDate !== null && state.lastProcessedDate >= date) return;
  const from = addDays(date, -69);
  const raws = await db.day_raw.where("date").between(from, date, true, true).toArray();
  const history = await db.day_records.toArray();
  const settings = await getSettings();
  const since14 = addDays(date, -14);
  const checkins = (await db.checkins.toArray()).filter((c) => dateOfTimestamp(c.scheduledAt) > since14);
  const out = dailyUpdate({
    date,
    raws,
    history,
    state,
    rules: (await db.plan_rules.toArray()).filter((r) => r.active),
    contexts: (await db.contexts.toArray()).filter((c) => c.confirmed),
    checkins,
    questionnaires: await db.questionnaires.toArray(),
    cfg,
  });
  await db.day_records.put(out.record);
  await putSingleton(db.engine_state, out.state);
  await db.day_actions.put({ date, actions: out.actions });

  const created: InboxItem[] = [];
  const fixed = settings.scheduleMode === "fixed";
  for (const a of out.actions) {
    if (a.type === "schedule_checkin") {
      if (fixed) continue; // triggers off: the fixed schedule below replaces them (docs/04 §9)
      const rec: CheckinRecord = { id: newId("checkin"), scheduledAt: stampAt(date, 18 * 60), answeredAt: null, kind: a.kind, reasons: a.reasons, answers: {}, personalAnswers: {}, hasFreeText: false };
      await db.checkins.put(rec);
      created.push(await addInbox({ date, type: "checkin", checkinId: rec.id, kind: a.kind, reasons: a.reasons }));
    } else if (a.type === "offer_questionnaire") {
      const open = (await openInbox()).some((i) => i.type === "questionnaire" && i.instrument === a.id);
      if (!open) created.push(await addInbox({ date, type: "questionnaire", instrument: a.id, reason: a.reason }));
    } else if (a.type === "show_plan") {
      const prev = history.filter((r) => r.date < date).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      const episodeStart = !prev || (prev.state !== "ELEVATED" && prev.state !== "CONFIRMED");
      if (episodeStart) created.push(await addInbox({ date, type: "show_plan" }));
    } else if (a.type === "context_expired") {
      created.push(await addInbox({ date, type: "context_expired", contextId: a.contextId }));
    }
  }
  if (fixed) {
    const n = Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+meta.startDate.slice(0, 4), +meta.startDate.slice(5, 7) - 1, +meta.startDate.slice(8, 10))) / 86400000);
    if (n % cfg.fixedScheduleDays === 0) {
      const rec: CheckinRecord = { id: newId("checkin"), scheduledAt: stampAt(date, 18 * 60), answeredAt: null, kind: "fixed", reasons: [], answers: {}, personalAnswers: {}, hasFreeText: false };
      await db.checkins.put(rec);
      created.push(await addInbox({ date, type: "checkin", checkinId: rec.id, kind: "fixed", reasons: [] }));
    }
  }
  // A finished ISO week (this date is a Sunday) → weekly aggregate (docs/07 §3).
  const week = isoWeekOf(date);
  if (datesOfIsoWeek(week)[6] === date) {
    await buildWeek(week);
    await hooks.onWeek?.(week);
    const { syncWeeks } = await import("../cloud/sync");
    await syncWeeks().catch((e) => console.warn("upload", e));
  }
  emitChange();
  for (const item of created) await hooks.onItem?.(item);
}

export async function buildWeek(isoWeek: string): Promise<void> {
  const dates = datesOfIsoWeek(isoWeek);
  const inWeek = (d: string) => d >= dates[0] && d <= dates[6];
  const diary = (await db.diary.toArray()).filter((d) => inWeek(d.date) && d.markers);
  const existing = await db.week_aggregates.get(isoWeek);
  const aggregate = aggregateWeek({
    isoWeek,
    records: (await db.day_records.toArray()).filter((r) => inWeek(r.date)),
    checkins: await db.checkins.toArray(),
    questionnaires: await db.questionnaires.toArray(),
    contexts: await db.contexts.toArray(),
    markers: diary.map((d) => d.markers!),
    note: existing?.aggregate.note ?? null,
  });
  await db.week_aggregates.put({ isoWeek, aggregate, uploaded: existing?.uploaded ?? false });
}

/** Close the previous day's open items: an unanswered check-in counts as ignored. */
async function closeStale(today: string): Promise<void> {
  for (const item of await openInbox()) {
    if (item.date >= today) continue;
    if (item.type === "checkin" || item.type === "questionnaire" || item.type === "show_plan" || item.type === "context_expired") {
      await closeInbox(item.id, "dismissed");
    }
  }
}

export type StepResult = "ok" | "paused" | "end";

/**
 * The time machine's "+1 day" (docs/08 §3). If today has not been processed yet it is
 * processed; otherwise the next day starts. A scripted note for that day is entered first
 * (docs/DECISIONS.md, M3), then the day's data is processed.
 */
export async function stepDay(hooks: DayHooks & { onNote?: (item: InboxItem) => Promise<boolean> } = {}): Promise<StepResult> {
  const meta = await ensureLoaded();
  const data = replayData(meta.scenario, meta.seed);
  const state = await getEngineState();
  if (!state || state.lastProcessedDate !== meta.today) {
    if ((await openInbox()).some((i) => i.type === "note" || (i.type === "context_confirm" && i.date === meta.today))) return "paused";
    await processDay(meta.today, hooks);
    return "ok";
  }
  const next = addDays(meta.today, 1);
  if (!data.raws.some((r) => r.date === next)) return "end";
  await closeStale(next);
  const nextMeta: ReplayMeta = { ...meta, today: next, dayNumber: meta.dayNumber + 1 };
  await putSingleton(db.replay, nextMeta);
  setToday(next);
  const ev = scriptedCheckin(data.script, next);
  if (ev && ev.type === "checkin_answer" && ev.freeText && !meta.notesHandled.includes(next)) {
    await putSingleton(db.replay, { ...nextMeta, notesHandled: [...nextMeta.notesHandled, next] });
    const item = await addInbox({ date: next, type: "note", text: ev.freeText, expectedContext: ev.expectedContext });
    emitChange();
    const handled = hooks.onNote ? await hooks.onNote(item) : false;
    if (!handled) return "paused";
  }
  await processDay(next, hooks);
  return "ok";
}

/** Called when the day's note has been written or skipped: process the day if it is waiting. */
export async function resumeAfterNote(hooks: DayHooks = {}): Promise<void> {
  const meta = await ensureLoaded();
  const state = await getEngineState();
  const waiting = (await openInbox()).some((i) => i.type === "note" || (i.type === "context_confirm" && i.date === meta.today));
  if (state && state.lastProcessedDate !== meta.today && !waiting) {
    await processDay(meta.today, hooks);
  }
}

export async function isTodayProcessed(): Promise<boolean> {
  const meta = await getMeta();
  const state = await getEngineState();
  return !!meta && !!state && state.lastProcessedDate === meta.today;
}

export { getSettings, updateSettings };
