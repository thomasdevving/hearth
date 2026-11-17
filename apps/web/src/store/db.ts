// The local store (docs/07 §2) on IndexedDB. Everything here stays on this device.
import Dexie, { type Table } from "dexie";
import type {
  CheckinRecord,
  ContextLabel,
  DayRaw,
  DayRecord,
  DiaryMarkers,
  EngineState,
  LanguageFeatures,
  LedgerEntry,
  PersonalItem,
  PlanAction,
  PlanRule,
  QuestionnaireRecord,
  Scenario,
  WeekAggregate,
  Action,
  Contributor,
} from "@hearth/engine";

export interface Singleton<T> {
  key: "singleton";
  value: T;
}

export interface DiaryEntry {
  id: string; // check-in id, or "note-<n>" for a note written outside a check-in
  date: string;
  text: string | null; // deleted after 30 days, markers kept
  markers: DiaryMarkers | null;
  markersSource: "on_device" | "cloud" | "none";
  language: LanguageFeatures | null;
}

export interface SafetyEvent {
  id: string;
  at: string;
  entry: "phq9_item9" | "keyword" | "model_crisis" | "button";
}

export interface Settings {
  cloudConsent: boolean;
  onDeviceEnabled: boolean; // lets the user (or a judge) switch the on-device model off
  online: boolean; // the time machine's network switch
  country: string;
  scheduleMode: "triggered" | "fixed";
  sensors: { steps: boolean; walkingSpeed: boolean; sleep: boolean; visits: boolean; phone: boolean };
  onboarded: boolean;
  planDone: boolean;
  baselineDone: boolean;
  firstUploadConfirmed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cloudConsent: false,
  onDeviceEnabled: true,
  online: true,
  country: "US",
  scheduleMode: "triggered",
  sensors: { steps: true, walkingSpeed: true, sleep: true, visits: true, phone: false },
  onboarded: false,
  planDone: false,
  baselineDone: false,
  firstUploadConfirmed: false,
};

export interface ReplayMeta {
  scenario: Scenario;
  seed: number;
  startDate: string;
  today: string; // the simulated "today": the last day whose data has been processed
  dayNumber: number; // 1-based
  notesHandled: string[]; // dates whose scripted note has been handled
}

/** Something the app has to show the user: the engine's actions, made concrete. */
export type InboxItem = {
  id: string;
  date: string;
  status: "open" | "done" | "dismissed";
} & (
  | { type: "checkin"; checkinId: string; kind: "triggered" | "random" | "fixed"; reasons: Contributor[] }
  | { type: "questionnaire"; instrument: "PHQ2" | "PHQ9"; reason: string }
  | { type: "context_confirm"; context: ContextLabel; sourceText: string; ranOn: "on_device" | "cloud" | "none" }
  | { type: "context_expired"; contextId: string }
  | { type: "show_plan" }
  | { type: "note"; text: string; expectedContext: unknown }
  | { type: "upload_preview"; isoWeek: string }
);

export interface WeekRow {
  isoWeek: string;
  aggregate: WeekAggregate;
  uploaded: boolean;
}

export interface ReportRow {
  id: string;
  kind: "weekly" | "clinician";
  createdAt: string;
  body: unknown;
  model: "on_device" | "cloud" | "template";
  promptVersion: string;
  variant: "full" | "lite" | null;
}

export interface NetworkLogEntry {
  id?: number;
  at: string;
  url: string;
  method: string;
  bytes: number;
  task: string | null;
}

export class HearthDB extends Dexie {
  day_raw!: Table<DayRaw, string>;
  day_records!: Table<DayRecord, string>;
  engine_state!: Table<Singleton<EngineState>, string>;
  plan_source!: Table<Singleton<{ warning: string; helps: string }>, string>;
  plan_rules!: Table<PlanRule, string>;
  personal_items!: Table<PersonalItem, string>;
  plan_actions!: Table<PlanAction, string>;
  contexts!: Table<ContextLabel, string>;
  checkins!: Table<CheckinRecord, string>;
  diary!: Table<DiaryEntry, string>;
  ledger!: Table<LedgerEntry, string>;
  questionnaires!: Table<QuestionnaireRecord, string>;
  safety_plan!: Table<Singleton<{ warningSigns: string; helps: string; whoToCall: string }>, string>;
  trusted_contact!: Table<Singleton<{ name: string; phone: string }>, string>;
  safety_events!: Table<SafetyEvent, string>;
  settings!: Table<Singleton<Settings>, string>;
  week_aggregates!: Table<WeekRow, string>;
  // App-side tables (not part of the shared logical store).
  inbox!: Table<InboxItem, string>;
  replay!: Table<Singleton<ReplayMeta>, string>;
  reports!: Table<ReportRow, string>;
  network_log!: Table<NetworkLogEntry, number>;
  day_actions!: Table<{ date: string; actions: Action[] }, string>;

  constructor(name = "hearth") {
    super(name);
    this.version(1).stores({
      day_raw: "date",
      day_records: "date",
      engine_state: "key",
      plan_source: "key",
      plan_rules: "id",
      personal_items: "id",
      plan_actions: "id",
      contexts: "id",
      checkins: "id, scheduledAt",
      diary: "id, date",
      ledger: "id, at",
      questionnaires: "id, takenAt",
      safety_plan: "key",
      trusted_contact: "key",
      safety_events: "id",
      settings: "key",
      week_aggregates: "isoWeek",
      inbox: "id, date, status",
      replay: "key",
      reports: "id, createdAt",
      network_log: "++id, at",
      day_actions: "date",
    });
  }
}

export const db = new HearthDB();

export async function getSingleton<T>(table: Table<Singleton<T>, string>): Promise<T | null> {
  return (await table.get("singleton"))?.value ?? null;
}
export async function putSingleton<T>(table: Table<Singleton<T>, string>, value: T): Promise<void> {
  await table.put({ key: "singleton", value });
}

export async function getSettings(): Promise<Settings> {
  const s = await getSingleton(db.settings);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), sensors: { ...DEFAULT_SETTINGS.sensors, ...(s?.sensors ?? {}) } };
}
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await putSingleton(db.settings, next);
  return next;
}

/** "Delete everything" (docs/07 §2): clears every collection on this device. */
export async function clearAll(keep: { settings?: boolean; ledger?: boolean } = {}): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) {
      if (keep.settings && t.name === "settings") continue;
      if (keep.ledger && (t.name === "ledger" || t.name === "network_log")) continue;
      await t.clear();
    }
  });
}

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}
