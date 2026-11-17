# Baseline

**Hybrid, privacy-first relapse prevention for depression.**
Entry for #BuildHybridAI 2026 (Firebase AI Logic hybrid inference). Deadline: **30 November 2026, 2 PM PT**.

> Your phone notices your daily rhythm shifting before you do. Baseline turns your own
> description of how a relapse starts into measurement rules, watches for exactly those
> signs, and asks a validated question at the right moment. Your raw data never leaves
> your phone.

Baseline is a wellbeing and self-insight tool. It is not a medical device and never gives
a diagnosis or treatment advice.

## Run it

Requirements: Node 22, npm 10. For the on-device model: Chrome desktop 139+ (see below).

```bash
npm install
```
```bash
npm run dev -w apps/web
```

Open http://localhost:5173 and follow onboarding. The **time machine** bar at the bottom
moves Sam's simulated days: `+1 day`, `▶ Play` (pauses when something needs you; tick
"Answer with Sam's script" to let it run to day 150), `Jump to…` holiday / first change /
PHQ-9, an Online/Offline switch, and the model status.

```bash
npm test
```
```bash
npm run build
```
```bash
npm run test:rules
```
```bash
npm run eval
```

- **On-device model (Gemini Nano):** in Chrome set `chrome://flags/#optimization-guide-on-device-model`
  to "Enabled BypassPerfRequirement" and `chrome://flags/#prompt-api-for-gemini-nano` to
  "Enabled", restart, then Settings → "Download on-device model". Without it every private
  task uses a non-model fallback and the app stays fully usable.
- **Cloud (Gemini, Firestore):** create a Firebase project and fill `apps/web/.env.local`
  from `apps/web/.env.example` (`docs/FIREBASE_SETUP.md`). Without it the app runs entirely
  on the device. Deploy: `npm run build && firebase deploy --only firestore:rules,hosting`.

## What is simulated and what is real

| Simulated | Real |
|---|---|
| Sam's sensor data (steps, rest, walking pace, places) for 150 days, from a seeded generator (`docs/08`) | The detection engine, check-ins, questionnaires, the safety flow |
| Sam's scripted answers, offered with "Use scripted answer" | Every model call (Gemini Nano on-device, Gemini in the cloud) and its ledger entry |
| | Weekly uploads to Firestore, share links, the clinician report |

## Privacy in one table

| Data | Where it goes |
|---|---|
| Your words: plan, notes, check-in text, speech, photos of a plan, questions you ask (S3) | Only to the on-device model. With no on-device model, a non-model fallback is used. Never to a server. |
| Single values: a check-in's reasons, a questionnaire total (S2) | On-device model; the cloud model only with your consent and when no on-device model exists |
| Weekly summaries (S1) | Firestore and the cloud model, only after consent and a preview of the exact JSON |

Every model call is in the privacy ledger (Privacy tab) with where it ran and the exact
payload of anything that left the device, plus a log of every network request.
Routing is decided in one place, `packages/engine/src/routing.ts`.

## Limitations

- The detection thresholds are untested on real relapses; the replay persona is synthetic.
- Step-based rest is a rough proxy for sleep.
- Without an Apple Watch or location permission, only the activity, rhythm and sleep-proxy
  domains are available (iOS).
- English only.
- The on-device model can misread a plan or a context; the quote check and user
  confirmation catch invented entries but not every missed one.
- Once a change is detected the reference is frozen; a lasting harmless change can keep the
  state "changed" until it returns (`docs/DECISIONS.md`, M2).
- Model quality (task G and H accuracy, latency) has not been measured with Gemini Nano yet;
  see `docs/10_EVALUATION.md`.
- The iOS app is not built yet.

## Evaluation

Numbers and how they were produced: `docs/10_EVALUATION.md`. In short: the engine passes all
tests; on 50 stable synthetic people it flags 2.6 days per 100; the persona's gradual change
is caught after a median of 7 days (slow version: 12); confirming a holiday removes all
holiday alarms; with consent off nothing leaves the browser.

## What is in this repository

| Path | What it is |
|---|---|
| `AGENTS.md` | Rules for the build. |
| `docs/01_PRODUCT.md` … `docs/10_EVALUATION.md` | The specification |
| `docs/DECISIONS.md` | Every choice made where the spec was open |
| `docs/PLATFORM_NOTES.md` | Platform facts, verified and not |
| `packages/engine` | The deterministic engine (TypeScript, no I/O), with golden fixtures for iOS |
| `apps/web` | The web app (Vite, React, Dexie, Firebase JS SDK) |
| `shared/` | Schemas, prompts, questionnaires, safety data, config |
| `firebase/` | Firestore rules and their tests, Remote Config template |
| `eval/` | Evaluation sets, scripts and results |

## Platforms

| Platform | Role | Sensors |
|---|---|---|
| **Web (Chrome)** | Full product on a simulated person, plus the clinician report. Judges can test it without any hardware. | Simulated (`docs/08_DEMO_REPLAY.md`) |
| **iOS** | The real product on the user's own data. | HealthKit, CoreLocation, optional Screen Time |

Both run the same detection engine (`packages/engine`, TypeScript). Android is not built.

## Core pattern

*Sensors measure → code computes → the baseline decides when → a validated question
measures → the LLM explains.* The LLM never changes a validated item and never computes a
clinical score.
