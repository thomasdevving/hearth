# 09 · Build plan

Work top to bottom. Each milestone lists what to read, what to build and how to know it
is done. Tick the boxes as you go. Deadline: **30 November 2026, 2 PM PT**.

| Days (Nov) | Milestones | Result |
|---|---|---|
| 17 | M0, M1 | Repo builds; platform facts checked |
| 18–20 | M2, M3 | Engine complete and tested; replay data |
| 21–23 | M4, M5, M6 | Web app: full loop on the persona with real models |
| 24 | M7 | Cloud: aggregates, reflection, report, hosting |
| 25–27 | M8, M9 | iOS app on real data |
| 28 | M10 | P1 extras, in the order listed |
| 29 | M11 | Evaluation numbers, polish |
| 30 | M12 | Video and submission (morning, Europe time) |

If a milestone runs more than a day late, cut from M10 first, then iOS P1 items. Never cut
tests, the ledger or the safety flow.

---

## M0 · Platform check and scaffolding
Read: `AGENTS.md`, `docs/02_ARCHITECTURE.md`, `docs/PLATFORM_NOTES.md`.

- [x] Open the current Firebase AI Logic hybrid documentation for **web** and **iOS**. Fill
      in every "must check" row of `docs/PLATFORM_NOTES.md` with what the docs say today
      (SDK versions, inference mode enum names, structured output, how to tell which model
      answered, minimum OS and browser versions).
- [x] npm workspaces: root `package.json`, `packages/engine`, `apps/web`. TypeScript strict.
- [x] Vitest runs in `packages/engine` with one passing placeholder test.
- [x] `npm run build` at the root builds the engine (ESM + `dist/engine.js` IIFE) and the web app.
- [ ] Firebase project created; Anonymous Auth, Firestore, Remote Config, AI Logic, App
      Check and Hosting enabled. `apps/web/.env.example` lists the needed keys.
      *(Keys, `firebase.json`, emulator config and `docs/FIREBASE_SETUP.md` are done. Creating
      the project needs the owner's Google account and is left to them; see the setup doc.)*

Done when: `npm test` and `npm run build` succeed from a clean clone.

## M1 · Engine foundations
Read: `docs/07_DATA_MODEL.md` §1, §5.

- [x] `types.ts` with every type in the specs, names unchanged.
- [x] `config.ts`: load defaults, merge overrides, validate.
- [x] `stats.ts`: mean, sd, median, MAD, quantile, clamp, haversine, seeded PRNG (mulberry32).
- [x] `guardrails/validate.ts`: validate an object against a schema in `shared/schemas`.

Done when: unit tests cover each function, including empty and single-element inputs.

## M2 · Features and detection
Read: `docs/03_FEATURES.md`, `docs/04_DETECTION.md`.

- [x] `features/*`: every feature in the catalogue, with the coverage rules.
- [x] `baseline.ts`, `index-score.ts`, `control.ts`, `context.ts`, `state.ts`.
- [x] `dailyUpdate` exactly as in `docs/04_DETECTION.md` §8.
- [x] `audit.ts`.
- [x] Golden fixtures: `packages/engine/test/fixtures/*.json`, each
      `{ fn, input, expectedOutput }`, generated from the passing engine and committed.
      They are the contract for the iOS bridge (and for a Swift port, if ever needed).

Done when: every test in `docs/03` (formulas on hand-computed examples) and `docs/04` §10 passes.

## M3 · Guardrails, questionnaires, routing, simulation
Read: `docs/05_LLM_TASKS.md` §2, §5, §7; `docs/06_QUESTIONNAIRES_SAFETY.md`; `docs/08_DEMO_REPLAY.md`.

- [x] `guardrails/quotes.ts`, `dates.ts`, `crisis.ts`; number check; PII check; banned words.
- [x] `verifyPlan`, `verifyContext`, `verifyMarkers`.
- [x] `routing.ts` with the full table.
- [x] `questionnaires.ts`.
- [x] `aggregate.ts`, `language.ts`.
- [x] `simulate/`: persona "Sam", scenarios `default`, `slow`, `safety`.

Done when: tests in `docs/05` §7 and `docs/06` §5 pass, and an end-to-end test runs the
default scenario day by day with scripted answers and asserts every point of
`docs/08_DEMO_REPLAY.md` §2.3.

## M4 · Web shell, store, time machine
Read: `docs/01_PRODUCT.md`, `docs/07_DATA_MODEL.md` §2, `docs/08_DEMO_REPLAY.md` §3.

- [x] Vite + React app, routing by screen id, simple responsive layout (phone-width column).
- [x] Dexie store with all collections.
- [x] Time machine bar: load persona, `+1 day`, `Play`, `Jump to…`, network switch.
- [x] `home` and `trends` render from `day_records` (index with UCL line, domain
      contributions, context periods shaded, questionnaire markers).

Done when: pressing `Play` from day 1 reaches day 150 with charts updating and no errors,
using scripted answers and template text only (no models yet).

## M5 · Inference router and ledger (web)
Read: `docs/02_ARCHITECTURE.md` §5, `docs/05_LLM_TASKS.md` §2–3, §6.

- [x] `InferenceRouter` for web on the Firebase JS SDK with hybrid modes, structured
      output from `shared/schemas`, prompts from `shared/prompts`.
- [x] On-device availability detection and the "how to enable" banner.
- [x] Every call writes a `LedgerEntry`. `ledger` screen with the "left this device" filter.
- [x] Cloud consent toggle in `settings`; default off.

Done when: with consent off and the network tab open, running tasks G, H and A produces
no request containing user text; the ledger shows them as `on_device`; turning the
on-device model off makes S3 tasks use their fallbacks and still sends nothing.

## M6 · The product loop (web)
Read: `docs/01_PRODUCT.md` §6, `docs/05_LLM_TASKS.md` §4, `docs/06_QUESTIONNAIRES_SAFETY.md`.

- [x] `onboarding`, `plan_setup` with task G cards (accept / reject, place picking from the
      persona's places), fallback form.
- [x] `baseline_phq`, `questionnaire`, `result` with task C.
- [x] `checkin` with task A, momentary items, personal items, free text.
- [x] Task H → `context_confirm` → masking visible on `trends`.
- [x] `my_plan` shown on `ELEVATED` and `CONFIRMED`.
- [x] `safety` with all four entry points.

Done when: a person can go through the whole default scenario by hand and each step in
`docs/01_PRODUCT.md` §6.3 happens; the `safety` scenario opens the safety screen.

## M7 · Cloud
Read: `docs/07_DATA_MODEL.md` §3–4, `docs/05_LLM_TASKS.md` tasks D, E.

- [x] Anonymous sign-in, App Check, Remote Config fetch.
- [x] Weekly aggregate upload with first-time preview and confirmation.
- [x] Task D: lite on-device and full in cloud; `weekly` screen with model badge.
- [ ] Firestore rules deployed; a rules test shows another user cannot read a week document.
      *(Rules test passes on the emulator: `npm run test:rules`. Deploying needs the Firebase project.)*
- [ ] Deployed to Firebase Hosting.
      *(`firebase.json` is ready; deploy with `docs/FIREBASE_SETUP.md` step 10 once the project exists.)*

Done when: the hosted URL works in a fresh Chrome profile, and in offline mode the weekly
reflection still appears as the lite on-device variant.

## M8 · iOS foundation
Read: `docs/02_ARCHITECTURE.md` §3, §7; `docs/03_FEATURES.md` §1; `docs/PLATFORM_NOTES.md`.

- [ ] Xcode project, SwiftUI, Firebase Apple SDK, `shared/` copied into the bundle.
- [ ] `Engine` bridge on JavaScriptCore; a test target runs every golden fixture through it.
- [ ] SwiftData store.
- [ ] `HealthKitCollector`: permissions, 120-day backfill of steps (15-minute bins),
      walking speed and sleep into `day_raw`; observer queries for new data.
- [ ] On first launch, run `dailyUpdate` for every backfilled day in order.
- [ ] `home` and `trends`.

Done when: on a real iPhone the app shows state `MONITOR` and a chart of the user's own
last months within a minute of granting HealthKit access.

## M9 · iOS product loop
- [ ] `InferenceRouter` for iOS (Apple Foundation Models on-device, Gemini in cloud, both
      through Firebase AI Logic) with the same ledger.
- [ ] `plan_setup` (task G), `checkin` (A, H), `questionnaire`, `result` (C), `my_plan`,
      `safety`, `ledger`, `settings`.
- [ ] Daily update on app open and by background refresh; local notification for a due check-in.
- [ ] Cloud consent, weekly aggregate upload, task D.

Done when: in airplane mode, plan setup, a check-in and a PHQ-2 all work and the ledger
shows only on-device entries.

## M10 · P1 extras (in this order; stop when time runs out)
1. [x] Speech input on `plan_setup` and `checkin` (on-device speech recognition). *(web)*
2. [x] Task K: matched own actions on `my_plan`.
3. [x] Task P: privacy gateway note, with preview and approval.
4. [x] Share link and `report` screen with task E.
5. [x] Task Q: ask your data.
6. [x] Task B: diary markers and their trend chart.
7. [x] Task I: spoken check-in pre-filling personal items.
8. [x] Task G2: scan a paper plan.
9. [x] `audit` screen.
10. [ ] iOS: `LocationCollector` (visits, places, home, place picking).
11. [ ] iOS: write PHQ-9 and state of mind to HealthKit.
12. [ ] P2 items from `docs/01_PRODUCT.md` §5.

## M11 · Evaluation and polish
Read: `docs/10_EVALUATION.md`.

- [ ] Run every evaluation and write the numbers into `docs/10_EVALUATION.md`.
      *(Done for metrics 1–6, 8 (code), 9 (keywords), 10. Metrics 7, 8 (labels), 11, 12 need Gemini Nano in Chrome: `#/eval_g`. 13 needs iOS.)*
- [x] Copy review against `docs/01_PRODUCT.md` §7.
- [x] Accessibility: text contrast, tap targets of at least 44 pt, screen-reader labels on controls.
- [x] Landing flowers: preserve original sizing, side backgrounds and typography; complete the hero's lower petals, extend sections vertically, and swap the how/privacy artwork.
- [x] Place a larger smooth logo petal behind every phone, matching its left/right position.
- [x] Interactive app preview in the hero, 15% smaller hero artwork, 2× section flowers, larger petal backdrops, open privacy rows, and a loose watercolour floral finale.
- [x] Compact the plan introduction and let its longer flower stem continue into the next feature.
- [x] Keep the hero layout and background stable when switching app preview views.
- [x] Match every phone frame to iPhone 18 Pro proportions without stretching screenshots.
- [x] Integrate three concise privacy explanations into the floral introduction, with a regenerated transparent flower and no dividers or repeated labels.
- [x] README: how to run, what is simulated, what is real, privacy summary, limitations.

## M12 · Submission
- [ ] Video of at most 3 minutes: one person's story → plan in own words becomes cards
      (on-device badge) → weeks pass, holiday does not alarm → own signals shift → check-in
      → PHQ → own plan shown back → airplane mode still works → ledger shows what left
      the device → weekly reflection from the cloud.
- [ ] Devpost text: how Firebase AI Logic is used (the routing table), features, value.
- [ ] Hosted web URL and public repository link; iOS shown in the video.
