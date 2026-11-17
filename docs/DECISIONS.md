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

## M0 (completed)

- **Platform facts** were read from the published `firebase` npm package (types and source),
  because the docs host is unreachable from the build container. See `docs/PLATFORM_NOTES.md` §6.
- **No Firebase project yet.** The app runs without one. Without a config, a placeholder
  Firebase app object is created so on-device inference still goes through Firebase AI
  Logic (`ONLY_ON_DEVICE` never contacts a server), and every cloud path is treated as
  unreachable, so routing falls back exactly as it would offline.
- **Web tests** use Vitest with jsdom and `fake-indexeddb`.

## M3

- **Routing gaps.** The table has no row for S2 without an on-device model and without
  consent: it returns `fallback: no_model`. S1 with consent, online and *not* `prefersCloud`
  (no current task) uses `PREFER_ON_DEVICE` when a model exists, else `ONLY_IN_CLOUD`.
- **`verifyTask(task, raw, ctx)`** is the single check every model output passes (R8). It
  calls `verifyPlan`/`verifyContext`/`verifyMarkers` for G/H/B and applies the number check,
  banned words, length limits, id checks (K, I) and the PII check (P) for the others.
  Task A also rejects an intro that asks a question containing a symptom word.
- **Phone rules in task G** are dropped while `cfg.phone.enabled` is false, so "stop replying
  to messages" becomes only the check-in item, as in the docs/05 example.
- **`place_visits` needs a `place_label`**; without one the rule is dropped.
- **Relative dates.** `resolveDateHint` understands today/yesterday/tomorrow, weekdays with
  or without since/until/back on/next/last, this/next/last week, this weekend, "N days ago",
  "in N days", "for N days/weeks" and "the 24th". A start hint that cannot be resolved means
  today; an end hint means start + 6 days. Both are flagged (`startResolved`/`endResolved`)
  so the confirmation screen can say so. A hint that is not in the user's text is ignored.
- **Number check** accepts a number written with fewer decimals than the fact (rounding) and
  the absolute value of a negative fact; thousands separators are joined.
- **Crisis keywords** are matched on the lowercased text with straightened apostrophes and,
  separately, on the quote-normalised text, so hyphen and apostrophe variants match.
- **Remission score** falls back to the first PHQ-9 ever taken when no unflagged PHQ-9 lies
  in the last 180 days.
- **Weekly aggregate rounding**: index and domain means to 2 decimals, check-in means to 1.
  `daysWithData` counts days with at least one feature value. `topContributors` are the
  three catalogue ids that were contributors on most days.
- **Naming a place** (`pickPlace`) labels the nearest learned place within `placeRadiusM` or
  adds a new place with zero minutes, so later visits are assigned to it.
- **Free text outside a check-in.** The replay script has free text on fixed days, but
  check-ins are random. The app therefore lets the user write a short note at any time
  ("Anything different this week?" on `home`), which goes through the same pipeline as
  check-in free text (crisis keywords, task H, task B). In the headless runner and the time
  machine, a day's scripted text is entered during that day, before that day's data is
  processed at night.
- **Persona details** (docs/08 §2.1–2.2): starts Thursday 2026-06-18 so the holiday (61–67)
  and the exam week (96–102) are Monday–Sunday. The holiday is a quiet week between a hotel
  and a beach 600 m away with long walks (more steps, rest 40 min later). The exam week has
  rest 25 min later and 10 % fewer steps. During the decline the office day shrinks
  linearly (home at lunchtime at the end), a skipped gym visit becomes a short shop visit,
  gym visits per week are `round(3·(1−f))` with Monday dropped first, the Sunday park visit
  shortens, and Saturday friends stop from day 115. The `slow` scenario runs the decline
  over days 71–130. The `safety` scenario differs only in PHQ-9 item 9 = 1. A `stable`
  scenario (no exams, no decline) exists for the false-alarm evaluation. Scripted PHQ-2 = 4
  and PHQ-9 = 13 apply from the start of the decline (they are only used when the app offers
  the questionnaire); a PHQ-9 of 6 from day 135 shows the partial recovery.
- **Rest shift leads.** With rest noise of 25 min on start and end and the 15-minute floor,
  a linear +100 min over 28 days is not distinguishable from noise when the other signals
  trip the index (around day 110). Sam's own plan names going to bed later as the first
  sign, so the rest shift is linear but reaches +100 min after 12 of the 28 days. With this,
  every point of docs/08 §2.3 holds for seed 1 (engine test `test/replay.test.ts`).
  Across seeds 1–20 all points hold together for about half the seeds; the misses are
  which three features rank as contributors and three early false alarms. This is reported
  in M11 (docs/10 metric 2), not tuned away.

## M4

- **Routing by screen id** uses the URL hash (`#/checkin?id=…`), so a screen can be linked and
  the browser's back button works. Hosting needs no rewrites for it.
- **Inbox.** The engine's actions become items in an app-side `inbox` table (check-in,
  questionnaire, context confirmation, expired context, plan, note, upload preview).
  `home` lists the open ones. Items of a previous day are closed when the next day starts;
  an unanswered check-in stays `answeredAt: null` (ignored).
- **Time machine semantics.** "Today" is the last processed day. `+1 day` starts the next
  day: a scripted note for that day is offered first, then the day's data is processed and
  the actions appear. Loading a persona leaves day 1 unprocessed until onboarding finishes
  (or `+1 day` is pressed).
- **Play** pauses whenever a check-in, questionnaire, context confirmation or note is open.
  A switch "Answer with Sam's script" lets Play and `+1 day` answer them automatically; with it,
  Play runs from day 1 to day 150 without stopping. **Jump to…** always answers with the
  script and stops at: the holiday note (holiday), the first `ELEVATED` day (first change),
  or the first questionnaire offered after it (PHQ-9).
- **PHQ-2 cooldown includes a PHQ-9.** A PHQ-9 contains both PHQ-2 items, so no PHQ-2 is
  offered within `phq2CooldownDays` of a PHQ-9, and a positive PHQ-2 does not lead to a
  second PHQ-9 in that week (engine `phq2CooldownOver`, app `submitQuestionnaire`).
- **Charts** use uPlot with the validated categorical palette (one fixed colour per domain),
  a legend on every multi-series chart and a table view, because three of the five colours
  are below 3:1 contrast on the surface.

## M5

- **One router call at a time.** Calls are queued so that the request bodies seen by the
  fetch interceptor belong to exactly one ledger entry. `payloadSent` is the body the SDK
  really sent, captured at `fetch`.
- **Fetch guard.** While an `ONLY_ON_DEVICE` call runs, any request to a Gemini endpoint is
  blocked and logged as `BLOCKED`. This caught a real case in tests (the SDK's Node build has
  no on-device adapter and silently used the cloud path); see PLATFORM_NOTES §7.
- **Network log.** Every cross-origin request the app makes is recorded (`network_log`) and
  listed on the `ledger` screen, for docs/10 metric 10.
- **"Can reach the cloud"** = the time machine's network switch is on, `navigator.onLine`,
  and a Firebase project is configured. The router passes that as `online`.
- **On-device schema.** The on-device `responseConstraint` keeps only `type`, `properties`,
  `required`, `enum`, `items`, `additionalProperties`; the cloud gets the full schema. The
  engine validates both (R8).
- **Lite variant (task D).** The on-device system prompt says to write the lite variant, so
  a `PREFER_IN_CLOUD` call that lands on the device produces it; the check uses the lite
  limit whenever the answer came from the device.
- **Ledger entries per attempt.** Each attempt (first try and retry) is its own entry with
  `attempts` 1 or 2; a fallback without a model call is one entry with `attempts: 0`.
- **Settings has an on-device switch** (`onDeviceEnabled`) so the fallbacks can be shown
  in a browser that has the model.
- **Tests use the SDK's browser build** (Vitest alias) with a fake `LanguageModel`, because
  the Node build has no on-device path.

## M6

- **Task G input** is the two answers joined with a newline; quotes are checked against
  that joined text. A crisis phrase in the plan text opens `safety` first.
- **Place picking** on the web lists the persona's own places (not the holiday ones); the
  chosen place is named with `pickPlace`. A place rule without a picked place is not saved.
- **Fallback form for task G** offers a fixed list of measurable signs (rest later, at home
  more, fewer places, gym or work visits down, …) plus free lines for check-in questions
  and actions. In the replay it also offers "Use Sam's confirmed cards".
- **Task A runs only for triggered check-ins** with reasons; random and fixed check-ins use
  their fixed sentences without a model (docs/05 task A). After answering, the user is told
  whether the check-in was random or triggered (never before, docs/04 §7.1).
- **Task H without a model** opens the one-tap picker (`context_confirm` with no type) for
  any free text; "Nothing like that" closes it.
- **A day waits for its confirmation.** When the day's note leads to a context question,
  that day's data is processed only after the user answers it, so a confirmed holiday also
  masks its first day (same order as the headless runner).
- **`my_plan` opens by itself** on the first day of an `ELEVATED`/`CONFIRMED` episode when
  stepping by hand (Play pauses there), and after "Jump to… first change".
- **Context expiry**: "Yes, one more week" adds a new label for the next 7 days.
- **Safety screen** reads only bundled data (`crisis_lines.json`) and local tables; Back is
  enabled after 3 s. The trusted contact and the user's own safety plan are edited from
  `settings` / the safety screen and stay local.
- **Questionnaires show "Use scripted answer"** (time machine) next to the verbatim items;
  the model never writes on those pages (R1).
- **React 19** for the web app (one copy in the workspace).
