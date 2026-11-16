# 02 · Architecture

## 1. Principle

One deterministic engine, two thin apps. Everything that decides something is in
`packages/engine` and is tested in Node. The apps only collect data, show screens, store
state and call models through one router.

```
            ┌────────────────────────── device ───────────────────────────┐
 collectors │  DayRaw ─► features ─► baseline ─► index ─► state/triggers   │
 (iOS) or   │              └────────── packages/engine ────────────┘       │
 replay     │                                   │                          │
 (web)      │   UI ◄── actions (check-in, PHQ-2, show plan, safety) ◄──────┘
            │   UI ──► InferenceRouter ──► on-device model  (S3, S2)       │
            │                 │                                            │
            │            privacy ledger                                    │
            └─────────────────┼────────────────────────────────────────────┘
                              ▼  only with consent, only S1/S2
                   Firebase AI Logic (Gemini) · Firestore weekly aggregates
```

## 2. Repository layout

```
/
├── AGENTS.md
├── README.md
├── docs/                         specifications (this folder)
├── shared/                       data loaded by engine and both apps
│   ├── config/defaults.json      default parameters (mirror of Remote Config)
│   ├── schemas/                  JSON Schemas for every LLM task output
│   ├── prompts/                  system prompts, one file per task
│   ├── questionnaires/           PHQ-2, PHQ-9, momentary items
│   └── safety/                   crisis lines, crisis keywords
├── firebase/
│   ├── firestore.rules
│   └── remoteconfig.template.json
├── packages/
│   └── engine/                   pure TypeScript, no I/O
│       ├── src/
│       │   ├── types.ts          all shared types (docs/07 §1)
│       │   ├── config.ts         load + validate config
│       │   ├── stats.ts          median, MAD, mean, sd, quantile, haversine
│       │   ├── features/         one file per domain (docs/03)
│       │   │   ├── activity.ts  rhythm.ts  sleep.ts  mobility.ts  phone.ts
│       │   │   └── index.ts      computeFeatures(dayRaws, date, cfg)
│       │   ├── baseline.ts       reference set, robust z (docs/04 §2–3)
│       │   ├── index-score.ts    risk direction, domain scores, D (docs/04 §4)
│       │   ├── control.ts        EWMA, CUSUM (docs/04 §5)
│       │   ├── context.ts        context labels → masks (docs/04 §6)
│       │   ├── state.ts          state machine + dailyUpdate (docs/04 §7–8)
│       │   ├── audit.ts          self-audit (docs/04 §9)
│       │   ├── questionnaires.ts scoring, cut-offs, reliable change (docs/06)
│       │   ├── guardrails/
│       │   │   ├── validate.ts   JSON Schema validation
│       │   │   ├── quotes.ts     quote verification
│       │   │   ├── dates.ts      relative date resolution
│       │   │   └── crisis.ts     keyword detection
│       │   ├── routing.ts        routing policy (docs/05 §2)
│       │   ├── aggregate.ts      weekly aggregates (docs/07 §3)
│       │   ├── language.ts       deterministic language features (docs/03 §7)
│       │   ├── simulate/         replay persona generator (docs/08)
│       │   └── index.ts          public API
│       ├── test/                 Vitest, mirrors src/
│       └── package.json
└── apps/
    ├── web/                      Vite + React + TypeScript
    │   └── src/
    │       ├── inference/        InferenceRouter (Firebase JS SDK) + ledger
    │       ├── store/            IndexedDB (Dexie) implementing Store
    │       ├── screens/          one folder per screen id (docs/01 §4)
    │       ├── replay/           time machine
    │       └── firebase.ts
    └── ios/                      SwiftUI app
        └── Baseline/
            ├── Engine/           JavaScriptCore bridge + bundled engine.js
            ├── Collectors/       HealthKitCollector, LocationCollector, ScreenTimeCollector
            ├── Inference/        InferenceRouter (Firebase Apple SDK + FoundationModels) + ledger
            ├── Store/            SwiftData models implementing Store
            ├── Screens/          one folder per screen id
            └── Resources/shared/ copy of /shared (build phase)
```

## 3. Technology choices

| Part | Choice | Notes |
|---|---|---|
| Monorepo | npm workspaces | `packages/engine`, `apps/web` |
| Engine | TypeScript, strict, zero runtime dependencies except a JSON Schema validator (Ajv) | Built with `tsup` to ESM (web) and one IIFE bundle `engine.js` (iOS) |
| Tests | Vitest | `npm test -w packages/engine` |
| Web UI | React + Vite + TypeScript, plain CSS modules | Charts: `uplot` |
| Web storage | IndexedDB via Dexie | Local only |
| Web AI | Firebase JS SDK `firebase/ai` with hybrid inference modes | Chrome desktop with the Prompt API |
| iOS UI | SwiftUI, iOS version per `docs/PLATFORM_NOTES.md` | |
| iOS storage | SwiftData, file protection `complete` | |
| iOS AI | Firebase Apple SDK (`FirebaseAI`) + Apple `FoundationModels` | API names must be checked first, see `docs/PLATFORM_NOTES.md` §2 |
| iOS engine | `JavaScriptCore` running `engine.js`; JSON strings in and out | If this blocks for more than half a day, port the engine to Swift and verify with the golden fixtures (`docs/09_BUILD_PLAN.md` M2) |
| Backend | Firebase: Anonymous Auth, App Check, Firestore, Remote Config, AI Logic, Hosting | No custom server |

## 4. The engine boundary

The engine exposes a small JSON-in / JSON-out API. This is the whole surface the apps use.
Types are defined in `docs/07_DATA_MODEL.md` §1.

```ts
// packages/engine/src/index.ts
computeFeatures(raws: DayRaw[], date: string, cfg: Config): FeatureDay
dailyUpdate(input: DailyUpdateInput): DailyUpdateOutput        // docs/04 §8
scoreQuestionnaire(id: QuestionnaireId, answers: number[], ref: PhqReference, cfg: Config): QuestionnaireResult
onCheckinCompleted(input: CheckinInput): CheckinOutput         // EMA rules, crisis keywords
verifyPlan(raw: unknown, sourceText: string): VerifiedPlan     // task G guardrails
verifyContext(raw: unknown, sourceText: string, today: string): VerifiedContext | null   // task H
verifyMarkers(raw: unknown): DiaryMarkers | null               // task B
route(req: RouteRequest): RouteDecision                        // docs/05 §2
aggregateWeek(input: WeekInput): WeekAggregate                 // docs/07 §3
selfAudit(checkins: CheckinRecord[], cfg: Config): AuditResult // docs/04 §9
languageFeatures(text: string): LanguageFeatures               // docs/03 §7
detectCrisis(text: string, keywords: string[]): boolean
simulatePersona(seed: number, scenario: Scenario): ReplayData  // docs/08
```

Rules for the boundary:
- The engine holds no state between calls. The app passes in the previous `EngineState` and
  stores the returned one.
- The engine never reads the clock or the network.
- iOS calls `Engine.call("dailyUpdate", jsonString) -> jsonString`. Web imports the functions.

## 5. The `InferenceRouter`

One interface, implemented once per platform. Feature code calls only this.

```ts
interface InferenceRouter {
  run<T>(task: TaskId, input: object, sourceText?: string): Promise<TaskResult<T>>
}
type TaskResult<T> =
  | { ok: true;  value: T; ranOn: "on_device" | "cloud"; ledgerId: string }
  | { ok: false; reason: "no_model" | "no_consent" | "invalid_output" | "error"; fallbackUsed: boolean }
```

`run` does, in this order:
1. Look up the task definition (`docs/05_LLM_TASKS.md` §3): sensitivity class, schema, prompt.
2. Call `engine.route(...)` with the class, consent state and on-device availability → mode.
3. If the decision is `fallback`, return `{ ok: false, ... }`; the caller uses the non-LLM fallback.
4. Call the model through Firebase AI Logic with the chosen mode and the structured-output schema.
5. Validate the output with the engine guardrails. Retry once on invalid output, then give up.
6. Write a ledger entry (`docs/07_DATA_MODEL.md` §2.9) in every case, including failures.

## 6. The `Store`

Both apps implement the same logical store (`docs/07_DATA_MODEL.md` §2). All of it is local.
The only data that is ever uploaded is the weekly aggregate, by `apps/*/sync`, after consent.

## 7. Background work (iOS)

| Job | Mechanism | Does |
|---|---|---|
| HealthKit ingestion | `HKObserverQuery` + background delivery, plus a fetch on app open | Appends to `day_raw` |
| Visits | `CLLocationManager.startMonitoringVisits()` | Appends visits to `day_raw` |
| Daily update | `BGAppRefreshTask`, and always on app open for any missed days | Runs `dailyUpdate` for each unprocessed day, schedules a local notification if a check-in is due |
| Check-in prompt | Local notification | Opens `checkin`; the model runs once the app is in the foreground |

The on-device model is only called while the app is in the foreground.

## 8. Deployment

- Web: `npm run build -w apps/web` → Firebase Hosting.
- iOS: run from Xcode on a physical device. TestFlight only if a paid developer account is available.
- App Check: reCAPTCHA Enterprise (web), App Attest (iOS); debug tokens are acceptable for the submission.
