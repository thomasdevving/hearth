// All shared types. Names follow docs/03, docs/04, docs/05, docs/06, docs/07 exactly.

// ---------- docs/03 §1: raw input ----------
export interface Interval {
  start: string; // ISO timestamp with offset
  end: string;
}
export interface Visit {
  arrive: string;
  depart: string;
  lat: number;
  lon: number;
}
export interface PhoneBuckets {
  screen: number | null;
  night: number | null;
  communication: number | null;
}
export interface DayRaw {
  date: string; // "YYYY-MM-DD", local
  stepBins15: number[] | null; // 96 values
  walkingSpeed: number | null; // m/s
  sleep: Interval[] | null; // night ENDING on this date
  visits: Visit[] | null; // visits overlapping this date
  phone: PhoneBuckets | null; // P2
}

// ---------- docs/07 §1 ----------
export type FeatureId = string; // catalogue ids, or "place_visits:<placeId>"
export type Domain = "activity" | "rhythm" | "sleep" | "mobility" | "phone";
export type State = "WARM_UP" | "MONITOR" | "ELEVATED" | "CONFIRMED";
export type TaskId = "G" | "G2" | "H" | "I" | "A" | "B" | "C" | "K" | "Q" | "P" | "D" | "E";
export type QuestionnaireId = "PHQ2" | "PHQ9" | "GAD2" | "WHO5";
export type DayType = "weekday" | "weekend";
export type DataClass = "S1" | "S2" | "S3";

// ---------- docs/03 §8 ----------
export interface FeatureDay {
  date: string;
  dayType: DayType;
  values: Record<FeatureId, number | null>;
  restSource: "healthkit" | "steps" | null;
}

export interface Contributor {
  feature: FeatureId;
  r: number;
  phrase: string; // built by code
}

export interface DayRecord {
  date: string;
  features: FeatureDay;
  z: Record<FeatureId, number | null>;
  r: Record<FeatureId, number | null>;
  domainScores: Partial<Record<Domain, number>>;
  maskedDomains: Domain[];
  D: number | null;
  D_daily: number | null;
  P: number | null;
  S: number;
  C: number;
  UCL: number | null;
  mu0: number | null;
  sigma0: number | null;
  elevated: boolean;
  contributors: Contributor[];
  state: State;
}

export interface Place {
  id: string;
  lat: number;
  lon: number;
  minutes: number;
  label: string | null;
}

export interface EngineState {
  state: State;
  S: number;
  C: number;
  mu0: number | null;
  sigma0: number | null;
  mu0Daily: number | null;
  sigma0Daily: number | null;
  daysNotElevated: number;
  anchor: { date: string; stats: Record<FeatureId, { median: number; scale: number }> } | null;
  lastDriftCheck: string | null;
  places: Place[];
  homePlaceId: string | null;
  ignoredStreak: number;
  rngState: number; // seeded PRNG state
  lastProcessedDate: string | null;
}

export type RuleDirection = "higher" | "lower" | "later" | "earlier" | "less_regular";

export interface PlanRule {
  id: string;
  feature: FeatureId;
  direction: RuleDirection;
  placeId: string | null;
  quote: string;
  active: boolean;
}
export interface PersonalItem {
  id: string;
  question: string;
  quote: string;
  active: boolean;
}
export interface PlanAction {
  id: string;
  text: string;
  quote: string;
  active: boolean;
}

export type ContextKind = "explains_sensors" | "stressor";
export interface ContextLabel {
  id: string;
  type: string;
  kind: ContextKind;
  start: string;
  end: string;
  quote: string | null;
  source: "model" | "manual";
  confirmed: boolean;
}

export type PersonalAnswer = "yes" | "partly" | "no";

export interface CheckinRecord {
  id: string;
  scheduledAt: string;
  answeredAt: string | null; // null = ignored
  kind: "triggered" | "random" | "fixed";
  reasons: Contributor[];
  answers: { mood_low?: number; enjoyment?: number; energy?: number; company?: string };
  personalAnswers: Record<string, PersonalAnswer>;
  hasFreeText: boolean;
}

// ---------- docs/06 §3.5 ----------
export interface QuestionnaireResult {
  id: QuestionnaireId;
  total: number;
  band: string | null; // PHQ-9 only
  positive: boolean; // PHQ-2
  flagged: boolean; // PHQ-9
  changeFromReference: number | null;
  safetyItemPositive: boolean; // PHQ-9 item 9 > 0
  nextStep: "none" | "offer_phq9" | "show_plan_and_share" | "safety";
}
export interface PhqReference {
  remissionScore: number | null;
}
export interface QuestionnaireRecord {
  id: string;
  instrument: QuestionnaireId;
  takenAt: string;
  answers: number[];
  result: QuestionnaireResult;
}

export interface DiaryMarkers {
  negative_affect: number;
  anhedonic_language: number;
  social_withdrawal: number;
  hopelessness: number;
  sleep_complaint: boolean;
  themes: string[];
  crisis: "none" | "possible" | "explicit";
}

export interface LanguageFeatures {
  W: number;
  FPS: number;
  OTH: number;
  ABS: number;
  SF: number;
}

// ---------- docs/04 §8 ----------
export interface DailyUpdateInput {
  date: string;
  raws: DayRaw[]; // at least the last 64 days
  history: DayRecord[]; // stored results of previous days
  state: EngineState; // returned by the previous call
  rules: PlanRule[]; // confirmed personal rules
  contexts: ContextLabel[]; // confirmed labels
  checkins: CheckinRecord[]; // last 14 days
  questionnaires: QuestionnaireRecord[];
  cfg: Config;
}
export interface DailyUpdateOutput {
  record: DayRecord;
  state: EngineState;
  actions: Action[];
}
export type Action =
  | { type: "schedule_checkin"; kind: "triggered" | "random"; reasons: Contributor[] }
  | { type: "offer_questionnaire"; id: "PHQ2" | "PHQ9"; reason: "persistent" | "momentary" | "drift" | "interval" }
  | { type: "show_plan" }
  | { type: "context_expired"; contextId: string };

// ---------- docs/05 §2 ----------
export interface RouteRequest {
  dataClass: DataClass;
  cloudConsent: boolean;
  onDeviceAvailable: boolean;
  online: boolean;
  prefersCloud: boolean; // task needs long output or long context
  hasLiteVariant: boolean; // task has a short on-device version
}
export type InferenceModeName = "ONLY_ON_DEVICE" | "PREFER_ON_DEVICE" | "PREFER_IN_CLOUD" | "ONLY_IN_CLOUD";
export type RouteDecision =
  | { run: "model"; mode: InferenceModeName; variant: "full" | "lite" }
  | { run: "fallback"; reason: "no_model" | "no_consent" | "offline" };

// ---------- docs/07 §2.9 ----------
export interface LedgerEntry {
  id: string;
  at: string;
  task: TaskId;
  promptVersion: string;
  dataClass: DataClass;
  decision: RouteDecision;
  ranOn: "on_device" | "cloud" | "none";
  outcome: "ok" | "invalid_output" | "error" | "fallback";
  attempts: number;
  latencyMs: number | null;
  bytesSent: number; // 0 when on-device
  payloadSent: string | null; // exact request body for cloud calls; null when on-device
}

// ---------- docs/07 §3 ----------
export interface WeekAggregate {
  isoWeek: string; // "2026-W47"
  daysWithData: number;
  indexMean: number | null; // mean D
  daysElevated: number;
  domainMeans: Partial<Record<Domain, number>>;
  topContributors: FeatureId[]; // catalogue ids only
  ema: { n: number; mood_low: number | null; enjoyment: number | null; energy: number | null };
  phq2: number | null;
  phq9: number | null;
  phq9Flagged: boolean | null;
  contexts: string[]; // context types only
  markerMeans: { negative_affect: number; anhedonic_language: number; social_withdrawal: number; hopelessness: number } | null;
  note: { themes: string[]; text: string } | null; // only if approved through task P
}
export interface WeekInput {
  isoWeek: string;
  records: DayRecord[];
  checkins: CheckinRecord[];
  questionnaires: QuestionnaireRecord[];
  contexts: ContextLabel[];
  markers: DiaryMarkers[];
  note: { themes: string[]; text: string } | null;
}

// ---------- docs/04 §9 ----------
export interface AuditResult {
  status: "collecting" | "informative" | "not_informative" | "unclear";
  nTriggered: number;
  nRandom: number;
  delta: number | null;
  p: number | null;
}

// ---------- check-in completion (docs/02 §4, docs/04 §7.3, docs/06 §4.1) ----------
export interface CheckinInput {
  record: CheckinRecord;
  freeText: string | null;
  recentCheckins: CheckinRecord[]; // answered and ignored, last 14 days, may include `record`
  questionnaires: QuestionnaireRecord[];
  state: State;
  date: string; // local date of the check-in
  cfg: Config;
  keywords?: string[]; // defaults to shared/safety/crisis_keywords.en.json
}
export interface CheckinOutput {
  crisis: boolean; // open the safety flow
  momentaryHigh: boolean; // this check-in meets the momentary rule on its own
  offerPhq2: boolean; // docs/04 §7.3 momentary signals, cooldown respected
  language: LanguageFeatures | null;
  runTasks: TaskId[]; // model tasks to run on the free text (H, B)
}

// ---------- task G / H verified outputs ----------
export interface VerifiedRule {
  feature: string;
  direction: RuleDirection;
  place_label: string | null;
  quote: string;
}
export interface VerifiedPlan {
  rules: VerifiedRule[];
  personal_checkin_items: { question: string; quote: string }[];
  actions: { text: string; quote: string }[];
  dropped: number; // entries removed by the guardrails
  valid: boolean; // false when the raw output failed schema validation
}
export interface VerifiedContext {
  type: string;
  kind: ContextKind;
  start: string;
  end: string;
  quote: string;
  confidence: "low" | "medium" | "high";
  startResolved: boolean;
  endResolved: boolean;
}

// ---------- docs/08 §2 ----------
export type Scenario = "default" | "slow" | "safety" | "stable";
export type ScriptEvent =
  | { date: string; type: "plan_text"; text: string; expected?: unknown; places?: Record<string, string> }
  | {
      date: string;
      type: "checkin_answer";
      answers: { mood_low: number; enjoyment: number; energy: number; company: string };
      personal: Record<string, PersonalAnswer>; // keyed by the item's question text
      freeText: string | null;
      expectedContext?: unknown; // a correct task H output for `freeText`
    }
  | { date: string; type: "questionnaire_answers"; instrument: "PHQ2" | "PHQ9"; answers: number[] }
  | { date: string; type: "ignore_checkin" };

export interface PersonaPlace {
  label: string;
  lat: number;
  lon: number;
}
export interface ReplayData {
  startDate: string;
  raws: DayRaw[]; // one per day
  script: ScriptEvent[]; // what the persona "does" in the app
  places: PersonaPlace[]; // the persona's named places, for place picking in the demo
  phases: { name: string; fromDay: number; toDay: number }[]; // 1-based day numbers
}

// ---------- docs/07 §5 ----------
export interface Config {
  baselineWindowDays: number;
  minReferenceDays: number;
  minSameDayType: number;
  minDomains: number;
  personalWeight: number;
  sigmaFloor: number;
  ewmaLambda: number;
  ewmaL: number;
  cusumK: number;
  cusumH: number;
  recoveryDays: number;
  persistDays: number;
  persistWindow: number;
  driftThreshold: number;
  contextMaxDays: number;
  ctxMinConf: "low" | "medium" | "high";
  randomCheckinProb: number;
  stressCheckinProb: number;
  maxCheckinsPerDay: number;
  maxCheckinsPerWeek: number;
  ignoredBeforeBackoff: number;
  quietHours: string;
  emaHigh: number;
  emaLow: number;
  phq2Cutoff: number;
  phq2CooldownDays: number;
  phq9Cutoff: number;
  phq9ReliableChange: number;
  phq9IntervalDays: number;
  auditWindowDays: number;
  auditMinPerGroup: number;
  auditMinForNegative: number;
  fixedScheduleDays: number;
  activeHourSteps: number;
  minDailySteps: number;
  placeRadiusM: number;
  minKnownMinutes: number;
  backfillDays: number;
  rawRetentionDays: number;
  phone: { enabled: boolean; thresholds: number[] };
  featureFloors: Record<string, number>;
  promptVersions: Record<string, string>;
}
