# 07 · Data model

## 1. Engine types (`packages/engine/src/types.ts`)

`DayRaw`, `Visit`, `Interval`, `PhoneBuckets`, `FeatureDay`: `docs/03_FEATURES.md`.
`DailyUpdateInput`, `DailyUpdateOutput`, `Action`: `docs/04_DETECTION.md` §8.
`RouteRequest`, `RouteDecision`: `docs/05_LLM_TASKS.md` §2.
`QuestionnaireResult`: `docs/06_QUESTIONNAIRES_SAFETY.md` §3.5.

```ts
type FeatureId = string            // catalogue ids, or "place_visits:<placeId>"
type Domain = "activity" | "rhythm" | "sleep" | "mobility" | "phone"
type State = "WARM_UP" | "MONITOR" | "ELEVATED" | "CONFIRMED"
type TaskId = "G" | "G2" | "H" | "I" | "A" | "B" | "C" | "K" | "Q" | "P" | "D" | "E"
type QuestionnaireId = "PHQ2" | "PHQ9" | "GAD2" | "WHO5"

interface Contributor { feature: FeatureId; r: number; phrase: string }   // phrase built by code

interface DayRecord {
  date: string
  features: FeatureDay
  z: Record<FeatureId, number | null>
  r: Record<FeatureId, number | null>
  domainScores: Partial<Record<Domain, number>>
  maskedDomains: Domain[]
  D: number | null
  D_daily: number | null
  P: number | null
  S: number
  C: number
  UCL: number | null
  mu0: number | null
  sigma0: number | null
  elevated: boolean
  contributors: Contributor[]
  state: State
}

interface EngineState {
  state: State
  S: number
  C: number
  mu0: number | null
  sigma0: number | null
  mu0Daily: number | null
  sigma0Daily: number | null
  daysNotElevated: number
  anchor: { date: string; stats: Record<FeatureId, { median: number; scale: number }> } | null
  lastDriftCheck: string | null
  places: Place[]
  homePlaceId: string | null
  ignoredStreak: number
  rngState: number                 // seeded PRNG state
  lastProcessedDate: string | null
}

interface Place { id: string; lat: number; lon: number; minutes: number; label: string | null }

interface PlanRule { id: string; feature: FeatureId; direction: "higher" | "lower" | "later" | "earlier" | "less_regular"; placeId: string | null; quote: string; active: boolean }
interface PersonalItem { id: string; question: string; quote: string; active: boolean }
interface PlanAction { id: string; text: string; quote: string; active: boolean }

interface ContextLabel { id: string; type: string; kind: "explains_sensors" | "stressor"; start: string; end: string; quote: string | null; source: "model" | "manual"; confirmed: boolean }

interface CheckinRecord {
  id: string
  scheduledAt: string
  answeredAt: string | null        // null = ignored
  kind: "triggered" | "random" | "fixed"
  reasons: Contributor[]
  answers: { mood_low?: number; enjoyment?: number; energy?: number; company?: string }
  personalAnswers: Record<string, "yes" | "partly" | "no">
  hasFreeText: boolean
}

interface QuestionnaireRecord { id: string; instrument: QuestionnaireId; takenAt: string; answers: number[]; result: QuestionnaireResult }

interface DiaryMarkers { negative_affect: number; anhedonic_language: number; social_withdrawal: number; hopelessness: number; sleep_complaint: boolean; themes: string[]; crisis: "none" | "possible" | "explicit" }
```

## 2. Local store

Logical collections. Web: Dexie tables. iOS: SwiftData models with file protection
`complete`. Everything in this section stays on the device.

| # | Collection | Key | Contents | Class | Retention |
|---|---|---|---|---|---|
| 2.1 | `day_raw` | date | `DayRaw` | S3 | `rawRetentionDays`; visits are deleted after 35 days once places and features exist |
| 2.2 | `day_records` | date | `DayRecord` | S2 | kept |
| 2.3 | `engine_state` | singleton | `EngineState` | S3 (contains places) | kept |
| 2.4 | `plan_source` | singleton | the user's plan text | S3 | until edited or deleted |
| 2.5 | `plan_rules`, `personal_items`, `plan_actions` | id | confirmed cards | S3 | kept |
| 2.6 | `contexts` | id | `ContextLabel` | S3 | kept |
| 2.7 | `checkins` | id | `CheckinRecord` | S2 | kept |
| 2.8 | `diary` | checkin id | free text, `DiaryMarkers`, `LanguageFeatures` | S3 | text deleted after 30 days, markers kept |
| 2.9 | `ledger` | id | see below | — | kept |
| 2.10 | `questionnaires` | id | `QuestionnaireRecord` | S2 | kept |
| 2.11 | `safety_plan`, `trusted_contact` | singleton | free text, name, phone | S3 | until deleted |
| 2.12 | `safety_events` | id | timestamp, entry point | S2 | kept, never uploaded |
| 2.13 | `settings` | singleton | consent flags, sensor switches, country, schedule mode | — | kept |
| 2.14 | `week_aggregates` | isoWeek | `WeekAggregate`, `uploaded` flag | S1 | kept |

### Ledger entry
```ts
interface LedgerEntry {
  id: string
  at: string
  task: TaskId
  promptVersion: string
  dataClass: "S1" | "S2" | "S3"
  decision: RouteDecision
  ranOn: "on_device" | "cloud" | "none"
  outcome: "ok" | "invalid_output" | "error" | "fallback"
  attempts: number
  latencyMs: number | null
  bytesSent: number                // 0 when on-device
  payloadSent: string | null       // exact request body for cloud calls; null when on-device
}
```
The `ledger` screen lists entries newest first, with a filter "left this device". Tapping a
cloud entry shows `payloadSent` in full.

`settings.cloudConsent` defaults to `false`. "Delete everything" clears every collection,
deletes the user's Firestore documents and shares, and signs out the anonymous user.

## 3. Weekly aggregate (the only thing that is uploaded)

Built by `aggregateWeek` on the first app open after an ISO week ends.

```ts
interface WeekAggregate {
  isoWeek: string                       // "2026-W47"
  daysWithData: number
  indexMean: number | null              // mean D
  daysElevated: number
  domainMeans: Partial<Record<Domain, number>>
  topContributors: FeatureId[]          // catalogue ids only; place ids replaced by "place_visits"
  ema: { n: number; mood_low: number | null; enjoyment: number | null; energy: number | null }
  phq2: number | null
  phq9: number | null
  phq9Flagged: boolean | null
  contexts: string[]                    // context types only, no dates or quotes
  markerMeans: { negative_affect: number; anhedonic_language: number; social_withdrawal: number; hopelessness: number } | null
  note: { themes: string[]; text: string } | null   // only if approved through task P
}
```
It contains no dates finer than the week, no free text except an approved note, no
locations, no place labels and no names.

Upload happens only if `cloudConsent` is true. The first upload shows the exact JSON and
asks for confirmation.

## 4. Firestore

```
users/{uid}/weeks/{isoWeek}      WeekAggregate
users/{uid}/reports/{reportId}   { kind: "weekly" | "clinician", createdAt, body, model, promptVersion }
shares/{shareId}                 { ownerUid, createdAt, expiresAt, weeks: WeekAggregate[], report: object | null }
```
- `uid` is a Firebase Anonymous Auth uid.
- A share is a **snapshot** copied into `shares/{shareId}` so the clinician view needs no
  access to the user's documents. `shareId` is 128 bits of randomness; default expiry 7 days.
- Rules: `firebase/firestore.rules`. App Check is enforced on Firestore and AI Logic.

## 5. Config

`Config` has exactly the keys of `shared/config/defaults.json`. Loading order: bundled
defaults → Remote Config values (same keys, `firebase/remoteconfig.template.json`) →
validation (types and sane ranges; an invalid value falls back to its default). The web
replay always uses the bundled defaults so that it is reproducible.
