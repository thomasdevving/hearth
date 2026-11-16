# Instructions for the builder

You are building **Baseline** from the specification in `docs/`. Follow this file exactly.

## 1. How to work

1. Read `docs/01_PRODUCT.md` and `docs/02_ARCHITECTURE.md` fully before writing code.
2. Work through `docs/09_BUILD_PLAN.md` **in order**, one milestone at a time. Do not start
   a milestone until the previous one meets its acceptance criteria.
3. For each milestone, read the spec documents it lists, build it, run its tests, then tick
   its boxes in `docs/09_BUILD_PLAN.md` and commit.
4. When a spec is ambiguous, choose the simplest option that satisfies the acceptance
   criteria and record the choice in `docs/DECISIONS.md` (create it on first use).
5. When a platform API differs from what the spec assumes, the platform wins. Record what
   you found in `docs/PLATFORM_NOTES.md` and adapt only the adapter layer
   (`InferenceRouter`, collectors). Never change the engine to fit a platform.

## 2. Hard rules (never break these)

| # | Rule |
|---|---|
| R1 | **Validated questionnaire items are shown verbatim** from `shared/questionnaires/*.json`. No LLM output is ever inserted into, or replaces, an item or its answer options. |
| R2 | **The LLM never computes a score, threshold or trigger.** All numbers come from `packages/engine`. |
| R3 | **Class S3 data (raw free text, transcripts, locations) is never sent to any server.** S3 tasks run `ONLY_ON_DEVICE`; if no on-device model exists, use the non-LLM fallback in `docs/05_LLM_TASKS.md`. Never fall back to cloud. |
| R4 | **Nothing leaves the device before the user has given cloud consent**, and every cloud call is written to the privacy ledger with the exact payload. |
| R5 | **All inference goes through `InferenceRouter`.** No direct SDK calls from UI or feature code. |
| R6 | **Language markers never enter the deviation index.** They are display and reflection only. |
| R7 | **The safety flow cannot be masked, snoozed or dismissed** without the support resources being shown. It works offline. |
| R8 | **Every LLM output is validated in code** against its JSON schema, and every `quote` field must pass quote verification, before it is used. Invalid output is discarded and the fallback is used. |
| R9 | **No diagnostic language in the UI.** Say "a change from your usual pattern", never "you are depressed" or "relapse detected". |
| R10 | **No secrets in the repository.** Firebase config comes from untracked files (`.env.local`, `GoogleService-Info.plist`). |

## 3. Engineering conventions

- **Engine first.** `packages/engine` is pure TypeScript: no I/O, no dates from the system
  clock, no randomness except through the seeded PRNG passed in. Every function takes its
  inputs as arguments so it can run in the browser, in Node tests and in JavaScriptCore.
- **Tests.** Every engine function has unit tests (Vitest). Each milestone lists the
  required tests. Do not mark a milestone done with failing or skipped tests.
- **Config, not constants.** Every tunable number is read from the config object described
  in `docs/07_DATA_MODEL.md` §4, with defaults from `shared/config/defaults.json`.
- **Names.** Use the feature ids, state names, task ids and field names from the specs
  exactly. They are shared between the engine, both apps and the schemas.
- **Dates.** Days are local calendar dates as `YYYY-MM-DD` strings. Timestamps are ISO 8601
  with offset. The engine never calls `Date.now()`; "today" is always an argument.
- **Commits.** One commit per finished task or milestone, message `M<n>: <what>`.

## 4. Out of scope (do not build)

Android app, AirPods head motion, critical-slowing-down analysis, clinician chat,
acoustic voice analysis, typing dynamics, C-SSRS scoring, accounts with passwords
(use Firebase Anonymous Auth), push notifications from a server.

## 5. Definition of done for the whole project

- Web app deployed to Firebase Hosting; the replay persona can be run from day 1 to the
  end, and every P0 item in `docs/01_PRODUCT.md` §5 works in Chrome.
- iOS app builds and runs on a physical iPhone with Apple Intelligence; every iOS P0 item
  works on the user's own HealthKit data.
- All engine tests pass. The evaluation numbers in `docs/10_EVALUATION.md` are filled in.
- The privacy ledger shows that S3 tasks ran on-device and lists every cloud payload.
