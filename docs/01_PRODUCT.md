# 01 · Product

## 1. One sentence

Hearth helps people who have had a depressive episode notice the early signs of a
relapse: it compares their daily behaviour with their own normal pattern and, when it
changes, asks a validated question and shows them their own plan.

## 2. User

An adult in remission after a depressive episode, who wants to prevent a relapse alone or
with a clinician. The product digitises the *relapse prevention plan* (Dutch:
*signaleringsplan*) that clinicians already write with patients.

## 3. Platforms

| | Web (Chrome desktop) | iOS |
|---|---|---|
| Purpose | Full product running on a simulated person; clinician report. This is what judges test. | Real product on the user's own data. |
| Sensors | Simulated `DayRaw` records from the replay generator | HealthKit, CoreLocation, optional Screen Time |
| On-device model | Gemini Nano via Chrome Prompt API, through Firebase AI Logic | Apple Foundation Models, through Firebase AI Logic |
| Cloud model | Gemini through Firebase AI Logic | Gemini through Firebase AI Logic |
| Engine | `packages/engine` imported directly | Same engine bundle run in JavaScriptCore |

If iOS cannot be finished, the web app alone is a valid submission (the rules require at
least one platform).

## 4. Screens

Both apps have the same screens. Ids are used in code and in the build plan.

| Id | Screen | Purpose |
|---|---|---|
| `onboarding` | Welcome, consent, permissions | Explain what is measured, the on-device promise, false positives. Ask sensor permissions (iOS). Cloud consent is a separate, optional toggle. |
| `plan_setup` | "How does a dip start for you? What helps?" | User speaks or types. On-device model returns rule cards and action cards with quotes (task G). User confirms each card. |
| `baseline_phq` | First PHQ-9 | Establishes the user's remission reference score. |
| `home` | Today | State badge (`Learning your pattern`, `Steady`, `Changed`), personal signals with sparklines, next check-in, "why" link. |
| `checkin` | Momentary check-in | LLM-written intro (task A), 3 momentary items, personal items, optional free text or speech. |
| `context_confirm` | "Are you on holiday until Sunday?" | Confirms a context label found by task H. One tap. |
| `questionnaire` | PHQ-2, PHQ-9 | Items verbatim, one per page. |
| `result` | After a questionnaire | Score, change from own reference, plain-language explanation (task C), next step. |
| `my_plan` | The user's plan | Shown automatically when state is `ELEVATED`: "You said this helps: …" in the user's own words. Editable. |
| `safety` | Support resources | Crisis line, call button, trusted contact, own safety plan. Offline. |
| `trends` | Charts | Deviation index with control limit, per-domain contributions, questionnaire scores, context periods shaded. |
| `audit` | "Is this working for you?" | Self-audit: mood at triggered vs random check-ins (`docs/04_DETECTION.md` §9). |
| `ledger` | Privacy ledger | Every inference: task, where it ran, what was sent. |
| `weekly` | Weekly reflection | Cloud-generated from weekly aggregates (task D). Needs cloud consent. |
| `share` | Share with clinician | Creates a time-limited link to the web report (task E). |
| `settings` | Settings | Sensor switches, cloud consent, trusted contact, delete everything, export. |
| `timemachine` | **Web only.** Replay control | Load persona, step a day, play, jump to event. See `docs/08_DEMO_REPLAY.md`. |
| `report` | **Web only.** Clinician view | Opened from a share link; read-only weekly aggregates and report. |

## 5. Scope and priority

**P0** must work for submission. **P1** is built if P0 is done. **P2** is stretch.

| Pri | Item | Web | iOS |
|---|---|---|---|
| P0 | Engine: features, baseline, index, EWMA/CUSUM, state machine, triggers | ✓ | ✓ |
| P0 | Replay persona and time machine | ✓ | – |
| P0 | Task G: warning signs and helpful actions → rule and action cards, quote check, confirmation | ✓ | ✓ |
| P0 | Check-in with task A intro and 3 momentary items | ✓ | ✓ |
| P0 | Task H: context recognition, confirmation, masking | ✓ | ✓ |
| P0 | PHQ-2 → PHQ-9 with reliable-change rule; `result` with task C | ✓ | ✓ |
| P0 | `my_plan` shown on `ELEVATED` | ✓ | ✓ |
| P0 | Safety flow | ✓ | ✓ |
| P0 | `InferenceRouter` with consent-driven routing, and the privacy ledger | ✓ | ✓ |
| P0 | Weekly aggregation → Firestore (opt-in) → weekly reflection (task D) | ✓ | ✓ |
| P0 | HealthKit backfill (steps, walking speed, sleep) so a real baseline exists on day 1 | – | ✓ |
| P0 | `trends` screen | ✓ | ✓ |
| P1 | Task B: diary markers from free text, shown as a trend | ✓ | ✓ |
| P1 | Task K: the model selects which of the user's own actions fit today | ✓ | ✓ |
| P1 | Task P: privacy gateway (on-device model writes a shareable note; user approves) | ✓ | ✓ |
| P1 | Task Q: ask your data (model classifies, code computes, model phrases) | ✓ | ✓ |
| P1 | Task I: spoken check-in pre-fills personal items | ✓ | ✓ |
| P1 | Task G2: scan an existing paper plan | ✓ | ✓ |
| P1 | Share link and clinician report (task E) | ✓ | link only |
| P1 | Self-audit screen | ✓ | ✓ |
| P1 | CoreLocation visits → mobility domain | – | ✓ |
| P1 | Write PHQ-9 and state of mind to HealthKit | – | ✓ |
| P1 | Speech input (on-device speech recognition) | ✓ | ✓ |
| P2 | Screen Time thresholds → phone domain incl. `communication_time` | – | ✓ |
| P2 | GAD-2 after PHQ-2 (PHQ-4) | ✓ | ✓ |
| P2 | WHO-5 every two weeks | ✓ | ✓ |
| P2 | Day length as a covariate; menstrual-cycle context label | ✓ | ✓ |

### Why some parts of the original concept are not built

| Dropped | Reason |
|---|---|
| Android | No Android device available for development or testing. |
| AirPods head motion | Works only during active sessions, evidence is one pilot with 21 people, and it needs its own UI. High cost, weak signal. |
| Critical slowing down | Needs weeks of dense mood ratings before it shows anything, was never allowed to trigger, and its within-person evidence is disputed. It adds a chart, not a capability. |
| Lomb-Scargle circadian movement | Needs a week of continuous GPS. iOS gives sparse visits, not continuous fixes. Replaced by `routine_regularity` (`docs/03_FEATURES.md`), which captures the same idea from visits. |
| Clinician chat | Multi-turn cloud chat is the most ordinary use of an LLM and does not show hybrid inference. The report itself stays. |
| Gait from raw accelerometer | Not needed: on iOS the phone already writes walking speed to HealthKit. Gait is **kept** as the `walking_speed` feature at almost no cost. |
| WHO-5 | Not cut for scientific reasons. It is a second questionnaire flow that adds little to the demo. The questionnaire engine is data-driven, so it is a P2 JSON file. |
| C-SSRS | Unsupervised suicide-risk scoring adds clinical liability. The safety flow shows resources and the user's own safety plan instead. |

## 6. Key flows

### 6.1 First run
`onboarding` → `plan_setup` (task G, confirm cards) → `baseline_phq` → `home`.
On iOS, HealthKit history is backfilled during onboarding, so the state is usually `MONITOR`
immediately instead of `WARM_UP`.

### 6.2 A normal day
The daily update runs (`docs/04_DETECTION.md` §8). Roughly one day in three a random
check-in is scheduled. The user answers three items in under 20 seconds.

### 6.3 A change
1. Index crosses the limit → state `ELEVATED`.
2. Check-in is scheduled with the top contributing signals as the reason. Task A writes the intro.
3. User answers. Free text goes through task H (context) and task B (markers, P1), on-device.
4. If a context is found and confirmed, the affected signals are masked and the state may return to `MONITOR`.
5. If the change persists (`docs/04_DETECTION.md` §7), PHQ-2 is offered; if positive, PHQ-9.
6. `result` shows the score, the change from the user's own reference and a plain explanation.
7. `my_plan` shows the actions the user wrote for this situation.
8. If the PHQ-9 flags, the app suggests sharing the report with their clinician.

### 6.4 Safety
PHQ-9 item 9 above 0, a crisis flag from task B, or a keyword match in any free text opens
`safety` immediately (`docs/06_QUESTIONNAIRES_SAFETY.md` §4).

## 7. Copy rules

- Plain, warm, short. Second person.
- Never: "depressed", "relapse detected", "diagnosis", "risk score", "you should".
- Always available on a check-in: "Not today", "Why am I being asked?".
- No streaks, no guilt, no notifications between 23:00 and 08:00.
- Onboarding states plainly: "Sometimes I'll ask when nothing is wrong. That's fine."
- Every screen with model-written text shows a small badge: `on-device` or `cloud`.
