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

## M2

- **`computeFeatures` context.** The spec signature is `computeFeatures(raws, date, cfg)`.
  An optional fourth argument carries the places, home and rules from `EngineState`;
  without it, places and home are learned from the raws given. `dailyUpdate` passes it.
- **Place learning.** Each visit is clipped to the day being processed, so a visit across
  midnight adds its minutes once per day. Place ids are `p<date>_<n>` and stay unique after
  a `moving` label clears the places.
- **Home.** The place with the most minutes between 00:00 and 06:00 in the 28 days ending
  today, once it has been seen on at least 3 of those nights.
- **Intradaily variability with gaps.** Differences are taken only inside a block of
  consecutive included days, and the divisor is the number of differences actually taken
  (equal to n − 1 when no day is missing).
- **Rest regularity** uses only nights with the same source as today and needs 5 of them.
- **`place_visits`** counts a visit across midnight once and is `null` when fewer than 5 of
  the 7 days have visit data.
- **Leaving `WARM_UP` on day 15.** `docs/08` §2.3 requires `MONITOR` from day 15, but a
  feature is only usable once 14 reference days exist, so no stored `D` exists before day
  15. On the days that still have warm-up days in the window, those days are scored against
  the current reference (in-sample) to obtain μ0 and σ0. Stored records are not changed.
- **μ0, σ0 window.** The most recent `baselineWindowDays` eligible days with an index, the
  same rule as for feature reference sets. They keep their last value if fewer than
  `minReferenceDays` remain.
- **Eligibility uses current labels.** A day is masked for the reference set if its stored
  record says so or if a label confirmed later covers it.
- **Rolling features and masks.** A `roll7` feature of a masked domain stays unusable while
  its 7-day window still contains masked days. Otherwise the days after a holiday would
  alarm on "no gym visits this week".
- **`less_regular`** maps to the catalogue direction of the feature: `+` for
  `rest_regularity`, `-` for `rhythm_stability` (lower stability is the less regular one).
  The spec's literal `+` would point the wrong way for `rhythm_stability`.
- **CONFIRMED is derived from the latest PHQ-9**: flagged → `CONFIRMED`; a later unflagged
  one → `MONITOR` with S reset to μ0 and C to 0. `applyQuestionnaireResult` lets the app
  apply this at once; `dailyUpdate` applies the same rule.
- **A positive PHQ-2 without a PHQ-9** makes `dailyUpdate` offer the PHQ-9 again (reason
  `persistent`) until it is taken.
- **Drift check.** Per feature the shift is `max(0, directed shift)` (absolute value for
  `±` features), from pooled reference medians, averaged per domain.
- **Random draw.** One PRNG draw per processed day, whether or not it is used, so the
  prompt schedule depends only on the seed and the number of days.
- **`show_plan`** is returned on every day whose state is `ELEVATED` or `CONFIRMED`.
- **`context_expired`** is returned once, on the day after a sensor-explaining label ends.
- **Self-audit window** ends at the most recent answered check-in (the function has no
  "today" argument). The permutation seed is a third, optional argument.
- **Known limitation.** While `ELEVATED` the reference is frozen. A lasting but harmless
  change of habits keeps the state `ELEVATED` (with a PHQ-2 at most every 7 days) until the
  index returns to the old range. The spec has no rule to accept a new normal.
- **False alarms.** With the default limits (L 2.5, h 4) the synthetic stable persona has
  about one `ELEVATED` episode per 150 days. This is a property of the configured limits,
  to be reported in M11.
