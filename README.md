# Baseline

**Hybrid, privacy-first relapse prevention for depression.**
Entry for #BuildHybridAI 2026 (Firebase AI Logic hybrid inference). Deadline: **30 November 2026, 2 PM PT**.

> Your phone notices your daily rhythm shifting before you do. Baseline turns your own
> description of how a relapse starts into measurement rules, watches for exactly those
> signs, and asks a validated question at the right moment. Your raw data never leaves
> your phone.

Baseline is a wellbeing and self-insight tool. It is not a medical device and never gives
a diagnosis or treatment advice.

## What is in this repository

This repository currently contains the **build specification**, not the app. It is written
so that a coding model can build the product milestone by milestone.

| Path | What it is |
|---|---|
| `AGENTS.md` | Rules for the model (or person) doing the build. **Read first.** |
| `docs/01_PRODUCT.md` | Scope, platforms, screens, user flows, priorities |
| `docs/02_ARCHITECTURE.md` | Modules, data flow, directory tree, tech choices |
| `docs/03_FEATURES.md` | Every behavioural feature: source, formula, direction |
| `docs/04_DETECTION.md` | Personal baseline, deviation index, triggers, state machine |
| `docs/05_LLM_TASKS.md` | Every LLM task: input, schema, prompt, routing, guardrails |
| `docs/06_QUESTIONNAIRES_SAFETY.md` | PHQ-2/PHQ-9, momentary items, safety flow |
| `docs/07_DATA_MODEL.md` | Local store, Firestore, security rules, Remote Config |
| `docs/08_DEMO_REPLAY.md` | Synthetic persona and the "time machine" judges will use |
| `docs/09_BUILD_PLAN.md` | Ordered milestones with acceptance criteria |
| `docs/10_EVALUATION.md` | What we measure and report |
| `docs/PLATFORM_NOTES.md` | Platform facts: verified, unverified, must-check |
| `docs/SOURCES.md` | Scientific and technical sources |
| `shared/` | Data files both apps load: schemas, prompts, questionnaires, config |
| `firebase/` | Firestore rules, Remote Config template |

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
