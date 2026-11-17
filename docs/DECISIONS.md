# Decisions

Choices made where a spec was ambiguous (AGENTS.md §1.4). Newest milestones at the bottom.

## M0 / M1

- **Workspace layout.** npm workspaces `packages/*` and `apps/web`. The web app imports the
  engine source through an alias (`@baseline/engine` → `packages/engine/src`), so the web
  build does not depend on a prior engine build; `npm run build` still builds both.
- **Engine bundle.** `tsup` writes ESM (`dist/index.js`, Ajv external) and one IIFE
  (`dist/engine.js`, Ajv bundled, global `BaselineEngine`) for JavaScriptCore.
- **Timestamps.** The engine reads the wall-clock digits of an ISO timestamp and ignores the
  UTC offset. Features are defined on local time, and this keeps the engine independent of
  the system time zone. A day with a daylight-saving change is off by one hour for
  durations that cross the change.
- **`sd`** is the sample standard deviation (n − 1); one value gives 0, no values give `null`.
  `mean`, `median`, `mad`, `quantile` return `null` on empty input.
- **`quantile`** uses linear interpolation between order statistics (type 7).
- **PRNG.** mulberry32 with an explicit 32-bit integer state (`nextRandom(state)`), so the
  state fits in `EngineState.rngState`.
- **Config validation.** Unknown keys are ignored and reported; `featureFloors` and
  `promptVersions` are merged key by key.
- **Shared data.** The engine imports `shared/**/*.json` at build time and re-exports it, so
  both apps read schemas, questionnaires and safety lists from one place.
