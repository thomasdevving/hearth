# 04 · Baseline, deviation and triggers

Everything here is deterministic code in `packages/engine`. All parameters come from
`Config` (`shared/config/defaults.json`); names in `code font` are config keys.

## 1. Overview

```
FeatureDay ─► reference set ─► robust z ─► risk r ─► domain scores ─► index D
                                                         │
                         context masks ──────────────────┘
D ─► EWMA S, CUSUM C ─► elevated? ─► state machine ─► actions
```

## 2. Day type

`weekday` = Monday to Friday, `weekend` = Saturday and Sunday. A feature is compared with
reference days of the same day type when at least `minSameDayType` (6) such days are in
the reference set; otherwise with all reference days.

## 3. Reference set and robust z-score

### 3.1 Eligible days
A past day is **eligible** as a reference for feature `j` when all hold:
- the feature value is not `null`;
- the feature's domain was not masked by a context label that day (§6);
- the stored state of that day was `MONITOR` or `WARM_UP` **and the day was not elevated**;
- no flagged PHQ-9 lies within 14 days before or after it;
- for sleep features, `restSource` equals today's.

Excluding elevated days is what stops a slow decline from becoming the new normal: the
reference only learns from days the system considered ordinary.

### 3.2 Reference set
`R_j(d)` = the most recent `baselineWindowDays` (56) eligible days before `d`.
The feature is usable on day `d` only if `|R_j(d)| ≥ minReferenceDays` (14).

### 3.3 z-score
```
z_j = clamp( (x_j − median(R_j)) / (1.4826 · MAD(R_j) + floor_j), −4, 4 )
```
`floor_j` is a small per-feature scale (`featureFloors` in config) that prevents division
by a near-zero spread. `roll7` features use the same formula.

### 3.4 Anchor and drift check
The **anchor** is a snapshot `{median_j, scale_j}` of every feature's reference statistics,
taken (a) the first time the state leaves `WARM_UP` and (b) again whenever a PHQ-9 total is
below 5 while the state is `MONITOR`. Once a week, for each domain, compute the mean
risk-directed shift of the current reference medians from the anchor, in anchor scale
units. If any domain exceeds `driftThreshold` (1.0), emit the action `offer_questionnaire
PHQ2` with reason `drift` (subject to the PHQ-2 cooldown). This catches a decline too
gradual to trip the daily index.

## 4. From z to the index

### 4.1 Risk-directed deviation
Direction `s_j` comes from the feature catalogue, or from a confirmed personal rule
(`higher`/`later`/`less_regular` → `+`, `lower`/`earlier` → `-`), which overrides it.

```
r_j = max(0,  z_j)        if s_j = +
r_j = max(0, −z_j)        if s_j = −
r_j = max(0, |z_j| − 1)   if s_j = ±
r_j is capped at 3.
```

### 4.2 Domain scores
Domains: `activity`, `rhythm`, `sleep`, `body`, `mobility`, `phone`.
```
G_k = Σ_{j∈k} a_j · r_j / Σ_{j∈k} a_j          over usable, unmasked features in domain k
a_j = personalWeight (2) if j belongs to a confirmed personal rule, else 1
```
Features inside one domain are strongly correlated, so they are averaged. A domain with no
usable feature is absent that day.

### 4.3 Index
```
D = mean of G_k over the domains present
```
Domains are weighted equally. The day is **insufficient** if fewer than `minDomains` (2)
domains are present; then D is `null` and the control statistics are frozen (§5.3).

Also compute, for display only:
- `D_daily`: the same, using only `win = day` features (used in §7.3);
- `P`: the weighted mean of `r_j` over personal-rule features (the "your signals" line);
- `contributors`: the features sorted by `a_j · r_j`, top 3 with `r_j ≥ 1`.

## 5. Control statistics

### 5.1 In-control parameters
`μ0` and `σ0` are the mean and standard deviation of `D` over the eligible days in the
last `baselineWindowDays`. `σ0` is floored at `sigmaFloor` (0.15). They are recomputed
daily while the state is `MONITOR` and frozen otherwise. They are undefined, and the state
stays `WARM_UP`, until `minReferenceDays` values of `D` exist.

### 5.2 EWMA and CUSUM
```
S_d = λ·D_d + (1−λ)·S_{d−1}                    S_0 = μ0       λ = ewmaLambda (0.3)
UCL = μ0 + L·σ0·sqrt(λ/(2−λ))                                  L = ewmaL (2.5)
C_d = max(0, C_{d−1} + (D_d − μ0)/σ0 − k)      C_0 = 0        k = cusumK (0.5)
elevated_d = (S_d > UCL) or (C_d > cusumH (4))
```

### 5.3 Frozen days
On an insufficient day: `S_d = S_{d−1}`, `C_d = C_{d−1}`, `elevated_d = elevated_{d−1}`.

## 6. Context labels

A confirmed context label (from task H or chosen by hand) has a type, a start and an end.

| Type | Kind | Effect |
|---|---|---|
| `holiday`, `travel` | explains sensors | Mask domains `mobility` and `phone`. |
| `visitors` | explains sensors | Mask `mobility`. |
| `ill` | explains sensors | Mask `activity`, `mobility`, `rhythm`, `sleep`, `body`. Check-ins continue. |
| `moving` | explains sensors | Mask `mobility` for the period, then clear `places` and restart the mobility reference. |
| `exams`, `new_job`, `loss`, `other_stress` | **stressor** | **No masking.** Shown as an annotation; raises the random check-in probability to `stressCheckinProb` (0.5). |

Rules:
- Masked domains are left out of `D` on those days, and those days are not eligible as
  reference days for those domains.
- A label that explains sensors lasts at most `contextMaxDays` (14). On expiry the app
  asks once whether it still applies.
- Stressors are never masked, because exams, a move or a loss are the kind of event that
  precedes a relapse.
- Questionnaires and the safety flow are never affected by any label.
- A label only takes effect after the user confirms it.

## 7. State machine

```
WARM_UP ──(μ0, σ0 defined)──► MONITOR ◄────────────────────────┐
                                 │ elevated for 1 day           │ not elevated for
                                 ▼                              │ `recoveryDays` (3)
                              ELEVATED ─────────────────────────┘
                                 │ PHQ-9 flagged (docs/06 §3)
                                 ▼
                             CONFIRMED ──(a later PHQ-9 not flagged)──► MONITOR
```

| State | Reference set | Prompts |
|---|---|---|
| `WARM_UP` | being built | Random check-ins only. |
| `MONITOR` | slides forward | Random check-ins. |
| `ELEVATED` | frozen | Triggered check-in; PHQ-2 when §7.3 holds; `my_plan` is shown. |
| `CONFIRMED` | frozen | No deviation prompts. PHQ-9 offered every `phq9IntervalDays` (14). `my_plan` and the share suggestion are shown. |

### 7.1 Check-in scheduling (at most one per day)
1. If the state is `ELEVATED` and limits allow → `schedule_checkin {kind: "triggered", reasons: contributors}`.
2. Else, with probability `randomCheckinProb` (0.33, or `stressCheckinProb` during a
   stressor) and if limits allow → `schedule_checkin {kind: "random"}`.

The random draw uses the seeded PRNG in `EngineState`, so replays are reproducible.
Whether a check-in was triggered or random is stored but **not shown** to the user before
they answer; the self-audit (§9) depends on that.

### 7.2 Limits
`maxCheckinsPerDay` (1), `maxCheckinsPerWeek` (4). After `ignoredBeforeBackoff` (2)
consecutive unanswered check-ins, both probabilities are halved until one is answered.

### 7.3 When PHQ-2 is offered
At least `phq2CooldownDays` (7) since the last PHQ-2, and any of:
- **persistent change:** `D_daily > μ0_daily + σ0_daily` on at least `persistDays` (3) of
  the last `persistWindow` (5) days, while the state is `ELEVATED`. Using only one-day
  features avoids counting the built-in carry-over of the rolling 7-day features;
- **momentary signals:** on at least 2 of the last 3 answered check-ins within 7 days,
  `mood_low ≥ emaHigh` (5) or `enjoyment ≤ emaLow` (3);
- **drift:** §3.4.

### 7.4 Delivery time
The engine only decides *that* a prompt is due. The app delivers it at the first moment
that is outside `quietHours` (23:00–08:00) and, on iOS, when the phone is unlocked and the
user is not driving. This lives in the app, not the engine.

## 8. `dailyUpdate`

```ts
interface DailyUpdateInput {
  date: string
  raws: DayRaw[]                 // at least the last 64 days
  history: DayRecord[]           // stored results of previous days
  state: EngineState             // returned by the previous call
  rules: PlanRule[]              // confirmed personal rules
  contexts: ContextLabel[]       // confirmed labels
  checkins: CheckinRecord[]      // last 14 days
  questionnaires: QuestionnaireRecord[]
  cfg: Config
}
interface DailyUpdateOutput {
  record: DayRecord              // features, z, r, G, D, D_daily, P, S, C, UCL, elevated, masks, contributors, state
  state: EngineState
  actions: Action[]
}
type Action =
  | { type: "schedule_checkin"; kind: "triggered" | "random"; reasons: Contributor[] }
  | { type: "offer_questionnaire"; id: "PHQ2" | "PHQ9"; reason: "persistent" | "momentary" | "drift" | "interval" }
  | { type: "show_plan" }
  | { type: "context_expired"; contextId: string }
```

Steps, in order:
1. `computeFeatures` for `date`.
2. Build masks from `contexts` (§6).
3. For each feature: reference set, usability, `z`, `r` (§3–4.1).
4. Domain scores, `D`, `D_daily`, `P`, contributors (§4).
5. Update `μ0`, `σ0` if the state allows; update `S`, `C`, `elevated` (§5).
6. Advance the state machine (§7).
7. Weekly (every 7th day since the anchor): drift check (§3.4).
8. Decide actions (§7.1–7.3) and return.

The function is idempotent: calling it again for a date that already has a `DayRecord`
returns the stored record and no actions. The app calls it once for every unprocessed day,
oldest first; this is also how the iOS backfill and the web replay run.

## 9. Self-audit

Purpose: tell each user honestly whether the triggers are informative **for them**.

Take answered check-ins from the last `auditWindowDays` (90). Group by `kind`. Let
`m_T`, `m_R` be the `mood_low` scores at triggered and random check-ins.

- Fewer than `auditMinPerGroup` (8) in either group → `status: "collecting"`.
- Otherwise compute `delta = mean(m_T) − mean(m_R)` and a one-sided permutation p-value
  (10 000 shuffles, seeded) for `delta > 0`.
  - `p < 0.10` and `delta ≥ 0.5` → `status: "informative"`.
  - both groups ≥ `auditMinForNegative` (12) and not informative → `status: "not_informative"`.
  - else → `status: "unclear"`.

On `not_informative` the app says so plainly on the `audit` screen and offers to switch to
a fixed schedule (`fixedScheduleDays`, a check-in every 3 days) with triggers off. The
user decides.

## 10. Required tests

| Test | Checks |
|---|---|
| z-score | Known vector → expected median, MAD, z; clamp; floor applied when MAD is 0. |
| Day type | Saturday is compared with weekend days once 6 exist, else pooled. |
| Eligibility | Elevated and masked days are excluded from the reference set. |
| Slow decline | A persona declining 1% per day for 60 days still becomes `ELEVATED` (reference does not follow it). |
| Zero spread | A constant `D` history does not divide by zero and does not alarm. |
| Domain averaging | Four deviating mobility features produce the same `G_mobility` as one. |
| Holiday | A confirmed `holiday` week with large mobility change produces no `ELEVATED` day. |
| Stressor | A confirmed `exams` week masks nothing. |
| Persistence | Rolling features alone cannot satisfy §7.3. |
| Limits | Never more than 1 check-in per day or 4 per week. |
| Idempotence | Re-running a processed day returns the same record and no actions. |
| Determinism | Same seed and inputs → identical outputs. |
| Self-audit | Each status is reachable with a constructed set of check-ins. |
