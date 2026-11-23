# Decisions

Choices made where a spec was ambiguous (AGENTS.md §1.4). Newest milestones at the bottom.

## M0 / M1

- **Workspace layout.** npm workspaces `packages/*` and `apps/web`. The web app imports the
  engine source through an alias (`@hearth/engine` → `packages/engine/src`), so the web
  build does not depend on a prior engine build; `npm run build` still builds both.
- **Engine bundle.** `tsup` writes ESM (`dist/index.js`, Ajv external) and one IIFE
  (`dist/engine.js`, Ajv bundled, global `HearthEngine`) for JavaScriptCore.
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

## M7

- **Consent starts the cloud.** App Check, anonymous sign-in and Firestore are initialised
  only when cloud consent is turned on (R4: before that the app makes no request at all,
  checked in a browser with a configured project). Turning consent off signs out.
- **Remote Config** is fetched in the background after consent and never blocks sign-in or
  uploads. The web replay keeps the bundled engine config (docs/07 §5); only prompt version
  labels are taken from it.
- **Weekly upload.** After an ISO week ends (the Sunday is processed) the aggregate is built
  and, with consent and the network switch on, uploaded to `users/{uid}/weeks/{isoWeek}`.
  The first time, an `upload_preview` item shows the exact JSON; nothing is sent until the
  user confirms, then all pending weeks are sent. Uploads are recorded in the network log.
- **Task D** runs when the `weekly` screen opens: online with consent it is
  `PREFER_IN_CLOUD` (full, 12 weeks); offline with an on-device model it is the lite variant
  on the last 2 weeks; otherwise the template with the numbers. The result is stored in
  `reports` and, with consent, in `users/{uid}/reports`.
- **Share and report** (P1, built because `result` and `my_plan` link to them): a share is a
  snapshot in `shares/{id}` with a 128-bit random id and a 7-day expiry; task E (cloud only)
  adds an overview, otherwise the clinician sees the table only. The `report` screen reads
  the share without signing in.
- **Rules test** runs on the Firestore emulator (`npm run test:rules`), which
  `firebase-tools` downloads on first use.
- **Not done here: deploying.** Creating the Firebase project, deploying the rules and
  publishing to Hosting need the owner's Google account (`docs/FIREBASE_SETUP.md`). The
  whole cloud flow was tested against the Auth and Firestore emulators instead.

## M11 (early): task G evaluation harness

- `eval/task_g.json` holds 20 invented plan descriptions with a hand-made expected mapping,
  including a prompt-injection case, a plan with no measurable signs, a phone-only plan and
  a terse one. Phone-domain signs are expected to become check-in questions only, because
  `cfg.phone.enabled` is false.
- The hidden screen `#/eval_g` (Settings → "Test the plan reader") runs them through the
  real router (on-device only), scores accepted rules exactly on feature and direction
  (place labels match leniently, "swimming" ~ "swimming pool"), and reports precision,
  recall and the share of raw model rules rejected by the quote check, with every raw
  output downloadable. The router gained an evaluation-only `onRaw` hook for this.
- It could not be run with Gemini Nano in the build container: the model download host is
  blocked by the network policy. It has to be run in a real Chrome.

## M10 (web)

- **Speech input** uses only Chrome's on-device recognition (`processLocally`); audio is S3.
  The availability check runs when the microphone is tapped, never on page load (it crashes
  the tab in headless Chromium). Without on-device recognition the button explains and hides.
- **Task K** runs on `my_plan` during a change when there are at least two actions; the
  model returns ids only and the user's own text is shown above the full list.
- **Task P** works on the latest finished week. The note is shown in an editable box, the
  PII check runs again on the edited text, and an approved note marks the week for
  re-upload. "Remove this note" takes it out again.
- **Task Q.** The question is raw free text, so the classifying call is S3 (on-device only),
  although docs/05 lists Q as S2: rule R3 wins. The phrasing call sees only the computed
  facts (S2). Facts come from `askFacts` in the engine; without a phrasing model the answer
  is a template from the same facts. The box is hidden when there is no on-device model.
- **Task B chart** on `trends`: the four markers per note, labelled as never used to decide
  anything (R6).
- **Task I** prefills only the personal items from the check-in's free text (typed or
  spoken); the answers are visible and editable before saving (R1).
- **Task G2** sends the photo to the on-device model as image input with a transcription
  prompt (`shared/prompts/G2.md`, schema `G2`) and appends the text to the plan box for
  correction before task G runs. The photo is kept only in memory.
- **Not built:** the iOS items (10, 11) and the P2 items (GAD-2, WHO-5, day length,
  Screen Time). GAD-2 and WHO-5 need their official wording checked before adding JSON.

## M11 (web)

- **Evaluation scripts** live in `eval/` (`npm run eval` for the engine and text metrics,
  `eval/privacy.cjs` for the browser privacy run). Results are in `eval/results/` and in
  `docs/10_EVALUATION.md`. Model-dependent metrics (7, 8 labels, 11, 12) run on the hidden
  `#/eval_g` screen in Chrome and are still open.
- **Date resolver fixes from metric 8:** "a few days" / "a couple of days" are durations; a
  start hint "on <weekday>" without "since"/"ago" takes the nearer occurrence; a "since …"
  start never gets an end from the same phrase.
- **Crisis keywords extended** with seven phrasing families the first run missed ("wish I
  wasn't alive", "won't wake up", "no point in living", "reason to live", "disappear for
  good", "all my pills"/"overdose", "nobody would miss me"). False positives only show the
  support screen. The reported 20/20 is therefore on the set used to extend the list.
- **Copy review** removed the word "diagnosis" from the clinician report header and
  "diagnose" from onboarding.
- **Accessibility:** all text colour pairs are at least 4.5:1 (lowest: muted text on the
  warm card, 4.9:1); every control is at least 44 px high; every input has a label.

## Polish: Hearth

- **Name.** The product is now **Hearth** (packages `@hearth/engine`, `@hearth/web`, iOS bundle
  global `HearthEngine`, local database `hearth`, emulator project `demo-hearth`). The word
  "baseline" stays where it is the technical term (personal baseline, `baselineWindowDays`,
  screen id `baseline_phq`, docs/04 title).
- **Look.** White and magenta (`#c2187e`, 5.6:1 on white; deep `#7a0f55`; tint `#fdf0f7`).
  Status colours stay separate from the brand colour (steady green, changed amber, help red).
  Headings in Syne, body in Outfit, both bundled from `@fontsource-variable/*`: a font CDN
  would be a request before consent (R4). One spacing scale (4/8/12/16/24/32/48 px).
- **Landing page** at `#/` (the site root): what it does, how it works, the routing in plain
  words, three measured numbers from `docs/10`, what it is not, the US crisis line, and
  "Try the demo". In-page links scroll instead of changing the hash, which is the router.
- **Crisis line default is the US** (988, emergency 911); `crisis_lines.json` gained an
  `emergency` number per country. The country stays changeable in Settings.
- **Charts** start at the first day with a usual range (earlier days are scored against a
  reference still being built), legends show labels only, PHQ-9 labels no longer overlap the
  axis, and the smoothed line is magenta.
- **Logo and hero image** come from the owner's artwork: the magenta pinwheel is the logo
  (made transparent and cropped: `apps/web/src/assets/hearth-logo.png`, plus
  `public/favicon.png` and `public/apple-touch-icon.png`), and the watercolour flower is the
  landing hero background (`hero-flower.webp` with a JPEG fallback). The brand magenta is now
  the logo's own colour, `#ca026a` (5.6:1 on white). On narrow screens the flower becomes a
  band above the headline that fades into white.
- **Landing page sections** use the owner's two other watercolour flowers as section
  backgrounds (text on the empty side of each image; faded on narrow screens). Every point is
  shown with a real screen of the web app (`apps/web/src/assets/shots/*.webp`, captured from
  the running app with the demo bar hidden and a stand-in on-device model) in a phone-shaped
  frame. There are no iOS screens because the iOS app is not built yet. Rows reveal on
  scroll, phones slide in and float gently, the flowers slowly breathe, numbers count up;
  everything is static for `prefers-reduced-motion`.

## Landing flowers: vertical framing

- Retained the original layout, Syne/Outfit typography, colours and side-entering
  watercolour backgrounds. The earlier standalone flower/Inter redesign was reverted
  at the owner's request and was never pushed.
- Extended the original hero artwork downward to complete its lower petals, keeping
  the intentional top and right crops. The extended 1369 × 1149 canvas is rendered at
  the original 1672/941 display-width ratio; the larger canvas does not shrink the
  flower. A transparent layer lets the lower petals overlap below the desktop hero.
  On mobile the flower keeps its original display width and the copy moves down to
  leave room for the extended petals. Text and links stay above the decoration.
  The divider under the hero is removed so the petals flow into the next section.
- Section backgrounds retain their original rendered scale. On desktop, extend section
  height to fit the full width-sized image and its existing 1.06 scale animation, with
  24 px of vertical space on either side. On mobile, extend each section to at least
  its full original background height plus 48 px, retaining its original scale.
  Artwork stays on its original side; flowers are not shrunk to fit shorter sections.
- The completed hero uses lossless WebP with a transparent PNG fallback to preserve
  paint texture and avoid an opaque rectangle covering the following section.
- Swapped the how-it-works and privacy backgrounds, along with their copy alignment,
  so each heading stays on the image's open side.

## Phone backdrops

- Phone backdrops use the left and right petals of the Hearth mark, with smooth
  continuous curves and the original magenta colour. Left-hand phones use the left
  petal; right-hand phones use the right petal, including both phones in a pair.
- The larger petals are up to 470 px wide, versus the earlier 402 px accent.
  Phone dimensions and captions stay unchanged; the decoration does not intercept
  clicks or appear in the accessibility tree. Narrow layouts cap the width to avoid clipping.

## Landing preview and privacy presentation

- Replaced the generic hero status card with an interactive plan/signals preview.
  The plan uses the engine's verified Sam fixture; signal charts use seven days of
  the seeded persona, `computeFeatures`, and the app's existing labels, value
  formatting and `Sparkline`. Signals are computed only when their view is opened.
  The preview is labelled as demo data and links into the real plan setup and app.
- Reduced only the hero flower by 15%, retaining the top/right crops and the lower
  petal overlap. Mobile copy spacing follows the smaller illustration.
- Regenerated the two section flowers with finer watercolour texture, then applied
  FSRCNN 2× super-resolution to deliver 3344 × 1882 WebP assets at quality 96.
  Generation returned 1672 × 941; the final pixel dimensions come from the separate
  super-resolution step. The original display size and side placement stay fixed.
- Privacy explanations use open numbered rows, typographic headings and thin
  dividers instead of rounded cards. Their wording and privacy guarantees stay intact.
- The final demo invitation uses a dense bed of open watercolour blooms across the
  entire background. A plum overlay, white text and a white button keep it readable;
  there is no white background or card behind the copy. The artwork uses loose wet
  brush strokes, translucent washes, bleeding pigment and soft unfinished edges.

## Plan setup: personal signs plus research-based signs

- The research-based signals (activity, rhythm, rest, mobility) always run, with or without a
  plan. The plan only sets directions, names places, adds check-in questions and actions,
  and weighs its signs double within their own domain.
- **The first question** is now "When things start to slip, what do you, or the people close
  to you, notice first?", because others often notice early signs first.
- **Suggested signs.** Under the question, chips list early signs that research links to
  harder periods: eight measurable ones (rest much longer or shorter, bedtime later,
  irregular sleep, moving less, home more, fewer places, days losing their structure) and
  three that become check-in questions (pulling back from people, dropping enjoyable things,
  irregular meals). Ticked chips become cards directly, without a model, and the card says
  "Suggested sign you ticked" instead of quoting the user. A feature the model already found
  is not repeated. The no-model form uses the same list plus gym and work visits.
- **"I don't know my signs yet"** saves no signs and continues; the note under it suggests
  adding signs later, ideally with a GP or therapist.
- **Landing page copy** was corrected to match the app: the plan opens and the check-in
  comes first, the questionnaire only if the change continues; a confirmed holiday sets aside
  location signals only; weekly summaries are stored in the user's private cloud space; the
  holiday numbers are across 20 simulated people. "diagnosis" was removed from the footer.

## Compact plan introduction

- The how-it-works introduction is about 25% shorter on desktop, with less vertical
  padding on mobile. Its flower retains its display scale; a longer, transparent
  stem continues below the introduction into the next feature instead of being clipped.
- `flower-plan-long.webp` extends the original left flower downward without changing
  its bloom or leaves. The privacy flower and other section layouts are unchanged.
- Hero preview views share a grid cell and both reserve their natural height. The
  inactive view is hidden visually and from assistive technology. Switching between
  the plan and signals no longer changes the hero's size or the flower's framing;
  signal calculations still run only when requested.

## iPhone mockup proportions

- Phone bodies use the iPhone 18 Pro's 71.9:150 width-to-height ratio from
  [Apple's specifications](https://www.apple.com/iphone-18-pro/specs/). At 290 px
  wide, the frame is about 605 px high, replacing the previous 634 px frame.
- Screenshots fit inside the screen with `object-fit: contain`, keeping their
  original proportions and full content. The camera area stays above the app;
  captions and decorative petals remain outside the sized phone body.

## Continuous privacy introduction

- The privacy heading and its three routing explanations share one white floral
  section, with the copy beside the flower on desktop and lighter artwork on mobile.
- Regenerate the original right-hand lily with a genuinely transparent background,
  preserving its shape, watercolour style, scale and side position. Remove the paper
  rectangle and the CSS edge mask so there is no image background to form a seam.
- Use three short paragraphs with sentence-case headings. Remove the numbers,
  uppercase labels and divider lines; retain the on-device-only promise for words,
  consent for cloud processing, and the preview and offline summary explanation.

## Mobile hero and navigation

- Below 861 px, remove the flower's reserved space above the hero copy. The copy
  starts 24 px below the navigation; the interactive preview follows it with a
  24 px gap. A large, light flower fades into white behind the text. Its size is
  independent of the preview, so tab changes cannot change its framing.
- Replace the mobile navigation's single demo button with a native disclosure
  containing How it works, Privacy and Try the demo. It closes on link selection,
  Escape or focus leaving it; Escape returns focus to the toggle. Desktop keeps
  the existing navigation and flower framing.
- Use the requested headline on all screen sizes: “When your days start to drift,
  Hearth notices, and reminds you what helps.”

## Remaining mobile landing sections

- At widths below 861 px, give section copy at least 32 px of space from each
  screen edge. Remove the ledger and support sections' nested horizontal padding,
  keep phones centred at their existing size and ratio, and use consistent spacing
  between each explanation and its screenshot. Preserve the existing product copy.
- Fade the plan and privacy flowers behind their introductions. The long plan stem
  and the desktop flower composition keep their existing desktop geometry.
- Keep both Today and Trends accessible in a native horizontal scroll region with
  scroll snapping, a descriptive label, keyboard focus and a short swipe hint. The
  desktop pair retains its original overlap. No duplicated phones or carousel library.
- Show evaluation numbers beside their explanations on mobile, keep the support
  telephone links at least 44 px tall, and reduce the finale's excess vertical space.

## Immediate landing page

- Remove the flower-opening video introduction at the user's request. The landing
  page is visible immediately, without a playback gate, reveal delay, scroll lock
  or session-storage check. Remove its component, styles, media and dedicated tests.

## Science in landing navigation

- The app's Science tab already links to `#/science`, but the landing page has its
  own navigation. Add Science to both its desktop links and mobile dropdown so
  visitors can reach the existing research page without starting the demo.

## Public Science page (`#/science`)

- Science is a public website page, with the landing page's shared navigation and
  footer. It has no demo tabs, replay controls, on-device banner or onboarding gate.
  Preserve its existing `#/science` address, citations and research content.
- It shows the research behind each signal, the engine's formulas
  with values read from the engine's `defaultConfig` (not copied), the evaluation results from
  `docs/10_EVALUATION.md` and the sources. Results are static text dated 2026-11-17.
- The demo shell is loaded lazily, and only mounts its data loader after a visitor
  enters a demo route. Reading the homepage or Science does not initialise a persona
  or open the local demo database. Pending initialisation cannot redirect visitors
  back into the demo after they leave its shell.
- Shared site links return from Science to the homepage's How it works and Privacy
  sections via `#/?section=…`. Science uses an open article layout, a subtle existing
  flower in the heading and responsive reading widths.
- The research findings use the studies' own terms ("depression", "insomnia"). R9 is about
  what the UI says about the user; the screen never applies these words to the user, and a
  test checks for that. The banned-word list stays in force for model output.
- Sources whose DOI could not be checked from the build container link to a PubMed search
  instead of a guessed DOI.
- "Signals we could add next" (HRV, resting heart rate, daylight, loneliness) are described
  as not implemented.

## Heart rate variability and resting heart rate; Sam's watch (2026-11-17)

- New domain `body` (shown as "Heart") with `hrv` (dir `-`) and `resting_hr` (dir `+`), both
  `day` features from a new optional `DayRaw.heart`. Optional so stored data and the iOS
  bridge stay valid without it. Floors: 3 ms and 1 bpm. Valid ranges 5–300 ms and 30–130 bpm.
- `ill` masks `body` as well (illness raises resting heart rate and lowers HRV). Holiday and
  travel do not; alcohol and jet lag affect it, but the spec masks only what a label clearly
  explains.
- Personal rules may use `hrv` and `resting_hr` (G schema and prompt), only when the person
  names their heart rate.
- Sam wears a watch at night: sleep intervals, overnight HRV (48 ms, ×e^(0.15·N)) and resting
  heart rate (58 ± 1.6 bpm). During the decline HRV falls up to 18 % and resting heart rate
  rises up to 3.5 bpm. These sizes are assumptions in the direction of the literature, not
  estimates. No exam-week effect on the heart: a first run with one (HRV −5 %, +1 bpm) moved
  the first change into the exam week for more seeds, and the persona's exam week is meant as
  a mild stressor that should not alarm. A separate random stream keeps steps and places
  identical to before.
- With a watch, rest features use `healthkit` sleep, so contributor phrases now say "sleep"
  (docs/03 §4 allowed this; the phrase function now receives `restSource`). On the 1 night in
  25 without the watch, rest falls back to steps and usually has too few same-source
  reference days to count.
- Acceptance point "rest and gym among the contributors" (docs/08 §2.3) now looks at the first
  3 days of the change instead of only the first day. Contributors are the top 3 of one day,
  and with more signals the order shifts by a day. Measured both ways: 10/20 seeds on the
  first day only (same with or without the watch), 16/20 over 3 days.
- Seed 1's first change moves from day 110 to day 109 (reasons: later sleep time, higher
  resting heart rate; the gym follows on day 110). The demo video was re-timed to day 109.

## Onboarding wording (2026-11-18)

- docs/01 asks the onboarding to say plainly that Hearth will sometimes ask when nothing is
  wrong. The heading is now "It takes your holidays into account" (friendlier, at the user's
  request); the body still says "Now and then it may still ask when nothing is wrong, and
  that's fine", so the honesty requirement is kept.


## M8 (iOS, 2026-11-18)

- **Deployment target iOS 26.0 for now, not 27.** PLATFORM_NOTES §2 asks for iOS 27 / Xcode 27
  (the `LanguageModel` protocol that `ai.geminiLanguageModel(name:)` plugs into). The build Mac
  has Xcode 26.1 (iOS SDK 26.1) and the owner's iPhone runs iOS 26.4.1. The owner chose to start
  with Xcode 26: everything that does not need the iOS 27 SDK is built now (engine bridge,
  storage, collectors, screens, the on-device model through Apple's `SystemLanguageModel`),
  and the target is raised to 27 when the cloud model is added.
- **No Firebase Apple SDK yet.** It is only needed for the cloud model, which needs iOS 27, and
  for consent-based sync, which needs `GoogleService-Info.plist` (not present). Like the web
  build without a Firebase config, the iOS build is local-only: cloud consent is shown as not
  available and every cloud route falls back.
- **Project file.** `apps/ios/Hearth.xcodeproj` is written by hand with folder-synchronised
  groups (Xcode 16+ format): every file under `Hearth/` and `HearthTests/` belongs to its target
  without being listed. No project generator is needed.
- **Bundled resources at build time** (`apps/ios/scripts/copy-resources.sh`): the engine bundle
  `packages/engine/dist/engine.js` (rebuilt with npm when it is missing or older than the engine
  source or `shared/`), `shared/` as a folder, and the Syne and Outfit fonts from
  `node_modules/@fontsource-variable` (the same files as the web app; CoreText reads WOFF2
  directly). The test target gets `packages/engine/test/fixtures/*.json`. Nothing is copied
  into the repository twice.
- **Bundle id** `com.thomasdevving.hearth`, signed with the owner's personal team.
- **SwiftData rows keep the engine's JSON.** Each collection of docs/07 §2 is one `@Model`
  (`DayRaw`, `DayRecord`, `EngineState`, `PlanRule`, `CheckinRecord`, `LedgerEntry`, …) with
  its key as a column and the record as the engine's own JSON, field names as in docs/07 §1.
  Records go back into the engine byte for byte, and fields Swift does not model (for example
  the optional `heart`) are never lost in a Swift round trip. Swift structs with the same
  field names decode them for the screens (`Engine/EngineTypes.swift`, tested against the
  fixtures).
- **HealthKit mapping** (docs/03 §1): steps as 96 sums per local day from a 15-minute
  statistics collection, rounded to whole steps; a day without any step statistics is `null`.
  Walking speed and resting heart rate are daily averages. Sleep: every asleep sample
  (`allAsleepValues`; "in bed" is not sleep) that overlaps the night window of a date
  (21:00 the day before to 12:00), unclipped; the engine finds the main period. HRV: the mean
  of SDNN samples starting inside the longest merged asleep interval of that night (gaps
  under 60 min merged, as in docs/03 §4), else between 00:00 and 06:00.
- **A day is scored once it is over.** Today's partial data would look like a quiet day, so
  `dailyUpdate` runs up to yesterday, and only for days whose HealthKit read happened after the
  day ended (`DayRaw.complete`). Later reads refresh the last three days' raws so late watch
  syncs are picked up before those days are scored.
- **Backfill actions are dropped.** On the first launch every backfilled day is scored in
  order, but actions are only turned into inbox items for the most recent day (yesterday).
  Check-ins "scheduled" months ago were never shown, and storing them as unanswered would
  count as ignored prompts and halve future check-in chances.
- **Visits** (`LocationCollector`, P1 brought forward because the owner asked for it): only
  completed `CLVisit`s (with a departure) are stored, in the `visits` of every `day_raw` date
  they overlap. HealthKit refreshes keep them.
- **Debug demo data.** Debug builds launched with `-HearthDemo YES` fill 120 days of generated
  raws instead of HealthKit, to check the screens in the Simulator (which has no Health
  history). Not in release builds.

## M9 (iOS, 2026-11-18)

- **On-device structured output** uses `DynamicGenerationSchema` built from the task's JSON
  Schema in `shared/schemas` (object, array with `maxItems`, string enums, integer ranges,
  boolean) instead of one hand-written `@Generable` type per task (docs/05 §3 suggests those).
  One converter keeps the schema files the single source; a test converts all 13. The model's
  `GeneratedContent.jsonString` then goes through the engine's `parseJsonLoose` and
  `verifyTask`, as on the web (R8).
- **Router order per mode.** `ONLY_ON_DEVICE` → device; `PREFER_ON_DEVICE` → device, then
  cloud; `PREFER_IN_CLOUD` → cloud, then device (lite); `ONLY_IN_CLOUD` → cloud. Two rounds
  (one retry), every attempt a ledger entry. S3 removes the cloud from the plan in code as
  well, whatever routing returned. Calls are serialised like the web router.
- **Cloud not available in this build.** `CloudModel.isConfigured` is false (no Firebase SDK,
  no plist), so `online` is false for routing: S2 tasks with consent would fall back like
  offline, S1 tasks (D) fall back to `no_consent` because consent cannot be given. Weekly
  aggregates are still built locally; nothing is uploaded. Cloud consent in onboarding and
  settings is shown and disabled ("Not available in this build"), as on the web without a
  Firebase config.
- **Task A, C, D, G, H, B are wired; P1 tasks I, K, G2, P, Q and speech input are not yet**
  on iOS. Their fallbacks are what the screens show (all actions on `my_plan`, tapping the
  personal answers).
- **Place rules** are named with "I'm here now" (one location fix) or a place Hearth has
  already learned from visits, then `pickPlace` in the engine. A place rule without a place
  is not saved (DECISIONS M6).
- **Notifications.** One local notification per due check-in or questionnaire, at the first
  minute outside 23:00–08:00. The text never says why the check-in came (docs/04 §7.1).
- **Background refresh** (`BGAppRefreshTask`, earliest 04:00) runs the same daily loop.
  With file protection `complete` it only gets data while the phone is unlocked; the update
  on every app open covers the rest.
- **Share links and the clinician report** are not on iOS (P1, and they need Firebase). The
  result page suggests bringing the result to the GP instead of "Share a summary".
- **Days in each state** on `trends` lists the last 120 scored days per state, for
  docs/10 metric 13.

## "What helped me last time" (2026-11-18)

- A note is attached to a sign by the user's own words (`PlanRule.quote` / `PersonalItem.quote`),
  not by id, so it survives editing the plan. Sam's persona has one note from an earlier hard
  week (`SAM_HELPED_NOTE`), seeded when the persona loads.
- Recall needs the person's confirmation: task R only proposes a sign (with a quote from their
  text); the note appears after "Yes, that's it". Sensors alone never bring a note back.
  Without a model, chips with the user's own signs appear (only when notes exist).
- R and T are S3 (they read the person's own words) and run on-device only.
- Voice notes stay in IndexedDB as blobs. "Export everything" serialises the table, where a
  Blob becomes `{}`, so audio is not exported.
- The "what helped?" prompt on Today appears once after a hard stretch ends (state back to
  MONITOR, a changed day in the last 14 days); "Not now" closes it for that stretch.

## Findings from the first run with Gemini Nano (2026-11-19)

- **Quote check tolerates dropped words.** Nano quoted "I stop replying to messages" for "I also
  stop replying to messages"; the strict substring check removed the card. `findQuoteSpan` now
  first tries the old substring rule, then accepts the quote if all its words appear in the
  user's text in the same order with at most 2 extra words in between, and stores the user's
  own span as the quote. Invented words still fail. docs/05 §5.1 is read this way from now on.
- **Add a sign in your own words** on the cards screen, for a sign the model missed. It becomes a
  check-in question with the user's words as its quote (no model, so no quote check).
- **Notes follow the sign when the wording differs a little** (one wording contains the other).
- **Crisis flag (task B).** Prompt v2 keeps "when unsure, choose possible" for thoughts of death or
  self-harm, and says that low mood, avoiding people and phrases like "dead tired" alone are not
  crisis. Sensitivity on real crisis wording is unchanged by intent; the keyword check runs
  first anyway. New metric 9b measures false positives on everyday texts (`#/eval_g`).
- **`possible` shows support in place** (owner's decision, 2026-11-19): docs/06 §4.4. `explicit`,
  keyword hits, PHQ-9 item 9 and the button keep the full screen. To review with a clinician.
- **Prompt G v2.** Every sign mentioned becomes exactly one entry (no merging or skipping);
  quotes are copied word for word, including small words like "also"; category hints for
  common signs (bed later → rest_midpoint, skipping the gym → place_visits, …) and one worked
  example whose wording does not occur in `eval/task_g.json`. The category hints are general,
  but they do touch signs in the evaluation set, so metric 7 is not fully blind to them.
- **Plan output is checked entry by entry.** A malformed entry, an unknown feature, extra fields
  or one entry over the schema's maximum drop only that entry (counted in "left out"), not the
  whole plan. Output that is not an object at all is still invalid (form fallback).
- **Many ways of writing, tested** (`packages/engine/test/planInputs.test.ts`, 29 cases): lists,
  a partner's words, second person, curly quotes, emoji and slang, typos, negations, invented
  signs and actions, illegal directions, phone signs while off, duplicates, diagnostic words,
  four check-in questions, malformed entries, injection, long text, Dutch, stitched quotes.
  Two bugs found and fixed: a negation in an earlier list item blocked the next sign, and a
  quote could match across a comma to an earlier word ("stop cooking, stop showering").
- **Evaluation set G grows to 35 cases** with the same kinds of writing, for the real model.


## UX walkthrough of the web demo (2026-11-21)

A full pass through the demo as a judge would take it (landing → onboarding → plan → PHQ-9 →
day-by-day → jumps → check-in → context → plan → questionnaires → ledger → settings → safety),
in Chrome without Gemini Nano, so every model task showed its fallback. Changes:

- **The time machine never seems dead.** "+1 day" and Play used to do nothing while a check-in
  or questionnaire was open. They now say what is waiting and how to continue (answer it,
  "Not today", or "Answer with Sam's script"). Jumps open what they stopped on: the plan for
  "First change", the questionnaire for the questionnaire jump (renamed from "PHQ-9", since it
  stops at the PHQ-2), Today for the holiday note.
- **Demo guidance:** onboarding names Sam on step 1; Today shows a demo tip during the two
  learning weeks; "Use Sam's words" moved from the bottom of plan setup to the top.
- **Plan by hand keeps the user's words in sight** ("You wrote …", with "Edit my text") and
  every plan view starts at the top of the page.
- **Plainer words:** `rest_midpoint` is "Middle of your night" (it is the midpoint, which read
  as a bedtime); plural signs take plural verbs ("Visits to the gym go down"); a place-visit
  count says "in 7 days"; weeks are named by their Monday ("the week of 28 Sept") instead of
  "2026-W40"; ledger rows say in words what the data class means; the no-model badge reads
  "fixed text" instead of "template".
- **Trends:** the signal list now draws the 8-week line it always promised; domain lines are
  7-day means on a scale that fits them; context bands and labels are clipped to the chart.
- **Context without a model:** the one-tap picker reads "until Sunday" / "since Tuesday" from
  the note with the engine's own `resolveDateHint` (code, not a model), so the period is right
  without Gemini Nano.
- **Fewer dead ends:** task I's "Fill in my questions" is hidden when there is no on-device
  model; check-in answers use functional state updates so fast taps are never lost; the
  result page no longer repeats the total and change in its fallback text, and the baseline
  result says it is the user's own reference.
- **Text 988:** the US line gains `"sms": "988"` in `shared/safety/crisis_lines.json` (988
  takes texts; the landing page already said so) and the safety screen shows a "Text 988"
  button. iOS ignores the extra field until it adds the button.

## Firebase Hosting (2026-11-21)

- The live demo moves from Vercel to **Firebase Hosting** (`hearth-9de01.web.app`), as
  AGENTS.md §5 asks: app, AI Logic, App Check, Auth and Firestore now live in one Firebase
  project. The video's QR code and script point to the new address. `vercel.json` is kept
  for the old address.
- Cloud consent that cannot reach the cloud now says so in Settings and onboarding instead of
  failing silently; the choice is kept and Hearth keeps working on the device.
- **Task D input in plain words.** The weekly reflection gets each week through
  `readableWeek` (labels.ts): the same numbers and nothing more (S1), but with the app's own
  words instead of field names and ISO weeks, plus the number of weeks from code. Prompt D is v3.
  Task E (clinician report) still gets the raw aggregates; to do.
- **Rejected model output is logged with its reason only** (`output rejected (unknown_number;
  finish STOP; …)`, and the numbers that were not in the input), never the text, so problems
  can be found without exposing the user's words.
- **Task E (clinician overview) in plain words too.** It gets `readableWeek(w, "clinician")`
  ("Middle of the night", not "your") and the watched signs as plain sentences, never quotes.
  Input keys are plain English ("number of weeks", "feeling down (out of 7)") because the model
  repeats keys verbatim. Prompts: D v4, E v2.
- **The old Vercel address redirects** to https://hearth-9de01.web.app with the same path, so
  links and the QR code in the first video keep working.

## Call a friend (2026-11-22)

- **"My people"**: one to three people (name, phone, optional "good for", and a message in
  the user's own words), stored locally only (S3, Dexie table `people`, version 3). The old
  single trusted contact becomes the first person on upgrade.
- The **Call a friend** card shows on the support screen (offline), on Today while the state
  is ELEVATED or CONFIRMED, and on the plan. "Call" opens the phone; "Message" opens Messages
  with the text filled in (`sms:<n>?&body=`). Hearth never calls or sends anything itself
  (docs/06 §4.3); no model is involved.
- Names of the user's people are blocked in shared weekly notes like place labels.
- Inspired by the Virtual Hope Box's "Call a friend" and by the Dutch depression guideline's
  advice to involve people close to the person in the relapse prevention plan.
- Demo: Sam has "My sister" and "Maya", with fictional 555-01xx numbers.

## Provable privacy (2026-11-22)

- **Content-Security-Policy on Firebase Hosting.** `connect-src` allows only the app itself and
  the nine Firebase/reCAPTCHA origins the app needs (`apps/web/src/privacy/policy.ts`, the single
  list). The browser refuses every other destination before a request leaves, whatever the code
  tries. `script-src` keeps `'unsafe-eval'` because Ajv compiles the output schemas (R8);
  precompiling them would allow removing it. Also `object-src 'none'`, `frame-ancestors 'none'`,
  `Referrer-Policy: no-referrer`. A test checks that firebase.json matches the list exactly.
- **"Don't take our word for it"** on the Privacy screen: Hearth tries to send a harmless test
  string (no user data) to another website and shows the browser's block. Verified on the live
  site: blocked by `connect-src`, while Gemini, Firestore and App Check keep working.

## Plan for the GP and FHIR export (2026-11-22)

- **"For your GP or clinician"** on the plan screen. The Dutch depression guideline asks that the
  relapse prevention plan is known to the GP; until now Hearth only shared weekly numbers.
- **My plan on one page** (`#/plan_print`): signs, check-in questions, what helps, people (names
  only), own safety plan, the last four questionnaires and the crisis line. The browser prints it
  or saves a PDF; the app chrome is hidden in print.
- **FHIR R4 export** (`apps/web/src/export/fhir.ts`): a `collection` Bundle with an empty Patient
  (no identity; the clinician matches it), a CarePlan (signs as notes, what helps as activities,
  in the person's words), and per PHQ-2/PHQ-9 a QuestionnaireResponse (LOINC panel 44249-1 /
  55757-9, item codes 44250-9…, answers LA6568-5…LA6571-9, item texts verbatim, R1) plus an
  Observation with the total (44261-6 / 55758-7). The people the user listed are not included.
  Built and saved on the device; Hearth sends nothing. LOINC codes to be re-checked against
  loinc.org before real clinical use.

### GP page as a clinical document (2026-11-23)

- **Layout by phase**, as in GGZ signaleringsplannen (GGZ Delfland, the GMAP model crisis plan,
  zib Signalering): rows Stable / Early signs / Crisis, columns Signs / What I do / What others
  can do. Above it a short header block (name and date of birth left blank to write by hand,
  date) as in primary-care letters (NHG HASP: envelope, then the core), and a "Current status"
  section: since when Hearth noticed a change, the engine's own phrases for what changed, and
  the latest questionnaire. All numbers come from the engine (`export/gpSummary.ts`, R2).
- **Arial**, not the app's fonts: NHS identity guidance names Arial for letters and reports, and
  it is on every computer, so no font has to load. 10.5 pt body, A4 with `@page`. Fits one page
  for the demo person; very long plans can still run over.
- **Wording**: first person throughout ("middle of my night"), the PHQ-2 note gives the cut-off
  from config, the PHQ-9 note the standard range name. "Written in my own words" was removed;
  the footer says that quoted text is the patient's own. The footer also says when the sensor
  data is simulated.
- **Not a letter from a clinician.** Letters between the therapist and the GP are written by
  them (NHG guideline on information exchange GP–GGZ); this page is what the patient chooses to
  bring. The clinician report with weekly numbers stays on the share link (task E).

## Smaller step, what came first, and an interactive "Why?" (2026-11-23)

- **Smaller step for a hard day.** Each action in the plan can get the user's own smaller
  version ("Make it smaller" on Your plan; `PlanAction.smaller`). "Too much today?" shows it and
  "I'll do this instead" records the choice for that day in `action_choices` (Dexie v4, S3, on
  the device). Hearth then says, by counting, "Last time (date) you chose the smaller step". No
  model writes or picks the smaller step; it is not asked for during plan setup, so the first
  run stays as short as before. The GP page lists it under "What I do". If-then plans with a
  fallback are a known relapse-prevention technique (implementation intentions).
- **What came first** (`signalOnset` in `packages/engine/src/explain.ts`). For the latest changed
  stretch (ELEVATED or CONFIRMED, ongoing or finished) it finds, per signal, the first day of a
  sustained move away from the usual range: `r ≥ onsetRiskMin` (1) on `onsetSustainDays` (2) of
  three days in a row, searched from `onsetLookbackDays` (28) before the stretch. The new keys
  are in `shared/config/defaults.json` and the Remote Config template. Your plan shows the order,
  "N days before Hearth noticed", the user's own quote for their signs, and for other signals
  "Watch for this too", which adds a rule only with a quote the user types. Signs that did not
  move are listed without judgement.
- **Interactive "Why?"** (`#/why?feature=…`, from the phrases under Why? on Today and from What
  came first). Three steps: the signal against its usual range (`usualRangeSeries`: the same
  reference set, day type and median ± 1.4826·MAD + floor that scoring used, with only the
  questionnaires known on that day, so a later PHQ-9 does not redraw the past; a test checks the
  band against the engine's stored z-scores), one day that did not count (`whyTimeline`: the day
  furthest above the limit while the trend stayed under it) and the day the trend crossed. All
  numbers from the engine (R2); no model; non-diagnostic wording (R9).
- **iOS: Why? only.** `WhyView` (`Route.why(feature)`, from the phrases under Why? on Today)
  calls `usualRangeSeries` and `whyTimeline` through JavaScriptCore and draws the same three
  steps with Swift Charts; the index chart is shared with Trends (`IndexChart`). Smaller step
  and what came first are web only for now. Debug: `-HearthDemoChange YES` (with `-HearthDemo`)
  drifts the last two weeks of demo data so the Changed state can be checked in the Simulator.

## Landing: pinned walkthroughs, tilted iPhone frame and a drift card in the hero (2026-11-23)

- **Phones as pinned walkthroughs** (`apps/web/src/screens/Workflow.tsx`, after the "Workflow"
  section on viddyscribe.com). Three sections replace the alternating feature rows: how it works
  (plan, usual days, check-in, Why?, holiday), when a change starts (plan, what helped, my people,
  GP page) and privacy (ledger with "Test it", support screen). While a section scrolls past it
  stays pinned; each step opens in turn, a line under it fills, and one phone swaps its screen.
  Clicking a step scrolls to it. Below 861 px wide or 621 px high it is a plain list with a
  phone per step. `.landing` uses `overflow-x: clip`, because `hidden` breaks `position: sticky`.
- **Screens for features since 18 Nov**: Why?, what helped last time with a drafted text, my
  people, the GP page and the privacy test. All eleven screenshots were captured again from the
  running app (390×844 at 600×1298, demo bar and banner hidden, stand-in on-device model).
- **The plan flower's stem** continues into the first walkthrough: the intro clips its own copy
  at its bottom edge and the pinned stage draws the rest at the same size and offset
  (`--plan-intro-h`, measured with a ResizeObserver), so the stem stays until the section ends.
- **iPhone 17 Pro-style frame** in CSS (titanium rim, side buttons, Dynamic Island, status bar,
  glass), tilted with a flat perspective transform towards the copy. No `preserve-3d`: in a 3D
  context Chrome repainted the swapped screen late and the Dynamic Island fought with the
  coplanar body. The edge is two layers behind the body, shifted to the far side.
- **Plain headings**: whole sentences instead of short fragments with full stops and commas.
  The "How it works" intro links to the Science page.
- **Hero drift card** (`screens/HeroDrift.tsx`) replaces the plan/signals tabs. Three moments
  play in turn ("Hearth learns your usual activity", the drift, the check-in), with a pause button, a pause while out
  of view, and the final state at once for reduced motion. The example is sleep, noted in a small caption under the chart: Sam's middle of
  the night against Sam's usual range for the 21 days up to the day Hearth noticed. The numbers
  come from `usualRangeSeries` and `whyTimeline` over the real app loop (the Why? screen's
  functions), stored in `src/assets/hero-drift.json` because the landing page runs no app loop;
  `test/heroDrift.test.ts` recomputes them and fails if they differ.

## App UX pass from a strict walk-through on an iPhone-sized screen (2026-11-23)

- **More room for the app.** The demo banner moved into the demo bar (a one-line notice that
  event messages replace); the header and tabs are tighter; the bar can fold to one thin line
  (remembered per browser) and the page reserves exactly its height (`--tm-height`, measured).
- **One back pattern**: a small "‹ Back" above the title (`Screen` in `ui/kit.tsx`, with an
  optional label, e.g. "‹ Today" on Why?), so titles keep the full width.
- **Hover only with a real pointer** (`@media (hover: hover)`): after a tap on a phone the next
  button no longer stays tinted, which looked like a chosen answer in the PHQ-2 and check-in.
- **Long screens fold.** Plan keeps For today, Also on your list and Call a friend open; What
  came first, For your GP, What helped before and Your signs and questions start closed with a
  short hint (`Fold`). The ledger shows the latest six calls with "Show all", and a readable
  date and time (the technical line is in the tooltip).
- **Signal rows** give the name and quote the full width (value and line on the right) and say
  "Not enough days yet" instead of a lone dash.
- **Disabled buttons are grey**, not a pale magenta, and Make cards and the check-in's Save say
  what is missing.
- **Demo shortcuts are dashed** and labelled "Demo:" (Sam's answers, Sam's note, Sam's cards).
- **Plain words**: "+1 h 1 min" instead of "+1 h 01" (engine phrase; golden fixtures
  regenerated, which also adds the `onset*` config keys to their inputs), "activity in shorter
  bursts" for fragmentation, "standard text" for template output, a weekly sentence in words
  instead of the raw index, "change" on chart axes, no "task G" or "not available in this
  build" wording; the onboarding hides the cloud option when no Firebase project is configured.
- **Smaller fixes**: links in a row get space or stack, clickable cards show a chevron, Call and
  Message keep one size everywhere (the support screen's crisis-call style no longer reaches
  them), deleting your data has its own section away from "I need help now", and the landing's
  Science link is a text link.

## First run: animated intro, one short onboarding, shorter text (2026-11-23)

- **Intro**: the Hearth mark blooms open, then the name, the slogan "Notice when your days start
  to drift." and "Start with Hearth". No header, tabs or demo bar on these two screens.
- **One onboarding screen** replaces three pages: three illustrated rows (your usual band, a
  drift out of it, your plan) and one way forward, "Set up my plan". Privacy, the ledger and
  what Hearth is not are behind "Learn more about privacy" on the same screen; the cloud option
  appears there only when a Firebase project is configured.
- **Plan setup**: one line of intro; "Make cards" is now "Turn into my plan", with one line on
  what it does; "Skip for now" and "fill it in by hand" sit in one sentence under a rule.
- **Text under headings** is one short sentence where it can be (starting point, plan cards,
  trends, Why?, people, share, weekly, privacy test, call a friend, what came first).
- **Explanations are plain text**, not tinted boxes: the demo hints, the privacy test, the
  plan note and the holiday line. Boxes stay for things you act on.
- The jury-video capture script and the plan-setup test use the new button names.

## Landing: a short FAQ (2026-11-23)

- After looking at how MindDoc, Daylio, Bearable, How We Feel, Wysa, Headspace and Oura build
  their homepages. The evaluation numbers were tried straight under the hero and moved back to
  their place after the privacy walkthrough at the owner's request.
- A short FAQ ("Before you start") before the final call to action: data, medical device,
  crisis, smartwatch, how long before it notices, trying it without your own data. Answers
  follow the README and the docs; plain rows with a +/– and no boxes.

## iOS: Firebase AI Logic linked (2026-11-23)

- The iOS app links the Firebase Apple SDK 13.2 (FirebaseAILogic, FirebaseAppCheck,
  FirebaseCore) through Swift Package Manager and builds with Xcode 27 (Swift 6.4).
- `CloudModel` uses `FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)`
  and `geminiLanguageModel(name:)` inside Apple's `LanguageModelSession`, with the same
  `DynamicGenerationSchema` as the on-device model, so both sides share one converter and the
  engine's `verifyTask`. The model name matches the web default (`gemini-3.5-flash`);
  `HearthGeminiModel` in Info.plist overrides it.
- `geminiLanguageModel` needs iOS 27; the deployment target stays iOS 26.0 and the cloud is
  off below 27 (`#available`), so nothing changes for iOS 26 users.
- Firebase starts only when `GoogleService-Info.plist` is in the bundle (git-ignored, R10).
  App Check: the debug provider in debug builds and the Simulator, DeviceCheck in release.
- The consent switch in Settings is live when the cloud is configured; S3 still never reaches
  the cloud (the router removes the cloud from the plan for S3 whatever routing says).

## iOS: the last web features (2026-11-23)

- **Ask your data (task Q)** sits at the end of Trends, as on the web, and is hidden without an
  on-device model. `Q_classify` runs on the device only (S3); a second check keeps only the
  three enums; `askFacts` in the engine computes every number; `Q_phrase` sees the facts only
  and passes the number check, else the engine's `askTemplate` answer is shown.
- **Weekly reflection (task D)** follows the web's routing: no consent → the plain summary
  written by code; consent → Gemini, short version on the device when the cloud is not
  reachable. Before any cloud call the screen shows "What would be shared" with the exact text
  (instructions and weeks), and the router refuses the cloud for S1 unless it is handed
  exactly that approved text (`approvedCloudPayload`). "Write it on this device instead" never
  uses the cloud. iOS has no weekly upload yet, so the web's "Shared" column is left out.
- **Weekly note (task P)** as on the web: on-device suggestion, engine `piiCheck` (also against
  place labels and the names in My people) on the edited text before it is stored in the
  week's aggregate.
- **Context confirm** now asks the web's question per type ("Are you on holiday until …?"),
  lets the dates be changed and explains what confirming does for that kind of context.
- **Science** page is linked from Settings → About Hearth (the web links it from its public
  site, which the app does not have).
