# 03 · Features

All features are computed per local calendar day by `computeFeatures(raws, date, cfg)`.
A feature is `null` when its input is missing or below its coverage rule. Nothing is
imputed.

## 1. Input: `DayRaw`

Collectors (iOS) and the replay generator (web) both produce this record. It is the only
input the feature code sees.

```ts
interface DayRaw {
  date: string                    // "YYYY-MM-DD", local
  stepBins15: number[] | null     // 96 values, steps per 15 min, 00:00–24:00
  walkingSpeed: number | null     // m/s, mean of the day's samples
  sleep: Interval[] | null        // asleep intervals for the night ENDING on this date
  visits: Visit[] | null          // place visits overlapping this date
  phone: PhoneBuckets | null      // P2
  heart?: HeartDay | null         // needs a watch; optional so older records stay valid
}
interface HeartDay {
  hrv: number | null              // ms, SDNN, mean of the samples during the night ending on date
  restingHr: number | null        // bpm, the day's resting heart rate
}
interface Interval { start: string; end: string }                 // ISO timestamps
interface Visit    { arrive: string; depart: string; lat: number; lon: number }
interface PhoneBuckets {          // minutes, as the highest threshold reached that day
  screen: number | null           // one of cfg.phone.thresholds, e.g. 0,30,60,120,180,240,360
  night: number | null            // same, counted 00:00–05:00
  communication: number | null    // same, apps in the communication category
}
```

### Where `DayRaw` comes from on iOS

| Field | Source | Notes |
|---|---|---|
| `stepBins15` | HealthKit `stepCount`, `HKStatisticsCollectionQuery` with 15-minute interval | History is available for as long as the phone has recorded steps. **Backfill 120 days at onboarding.** |
| `walkingSpeed` | HealthKit `walkingSpeed` | Written by the iPhone itself when carried. Backfilled too. |
| `sleep` | HealthKit `sleepAnalysis`, asleep categories only | Usually needs an Apple Watch or a sleep app. Often absent; then the step-based rest window is used (§4). |
| `visits` | `CLVisit` from `startMonitoringVisits()` | Forward only, no history. Needs "Always" location permission. |
| `phone` | Screen Time API (`DeviceActivity` threshold events), P2 | See `docs/PLATFORM_NOTES.md` §4. |
| `heart.hrv` | HealthKit `heartRateVariabilitySDNN`, mean of the samples inside the main sleep period (or 00:00–06:00 without sleep data) | Apple Watch only. Backfilled. |
| `heart.restingHr` | HealthKit `restingHeartRate`, the day's value | Apple Watch only. Backfilled. |

## 2. Feature catalogue

`dir` is the default risk direction: `-` lower is risk, `+` higher is risk, `±` both.
`win` is `day` (computed from one day) or `roll7` (computed over the 7 days ending on `date`).

| Id | Domain | dir | win | Definition |
|---|---|---|---|---|
| `steps` | activity | - | day | Sum of `stepBins15`. |
| `active_hours` | activity | - | day | Number of clock hours with at least `cfg.activeHourSteps` (100) steps. |
| `walking_speed` | activity | - | day | `walkingSpeed`. |
| `rhythm_stability` | rhythm | - | roll7 | Interdaily stability IS (§3). |
| `fragmentation` | rhythm | + | roll7 | Intradaily variability IV (§3). |
| `relative_amplitude` | rhythm | - | roll7 | RA (§3). |
| `rest_duration` | sleep | ± | day | Hours of the main rest period (§4). |
| `rest_midpoint` | sleep | ± | day | Midpoint of the main rest period, minutes after local midnight of `date` (can be negative). |
| `rest_regularity` | sleep | + | roll7 | Standard deviation of `rest_midpoint` over the window, minutes. Needs ≥5 values. |
| `hrv` | body | - | day | `heart.hrv` (§9). |
| `resting_hr` | body | + | day | `heart.restingHr` (§9). |
| `home_stay` | mobility | + | day | Share of the day's known time spent at the home place (§5). |
| `location_entropy` | mobility | - | day | Normalised entropy of time over places (§5). |
| `places_visited` | mobility | - | day | Number of distinct places visited. |
| `location_variance` | mobility | - | day | Time-weighted spatial spread (§5). |
| `routine_regularity` | mobility | - | day | Share of hours spent where the user usually is at that hour (§5). |
| `place_visits:<placeId>` | mobility | from rule | roll7 | Visits to one named place in the window. Exists only for a confirmed personal rule. |
| `screen_time` | phone | + | day | `phone.screen` (P2). |
| `night_use` | phone | + | day | `phone.night` (P2). |
| `communication_time` | phone | - | day | `phone.communication` (P2). See §6. |

Day coverage rule: `stepBins15` counts as present only if the day has at least
`cfg.minDailySteps` (200) steps in total; otherwise the phone was probably not carried and
all step-based features of that day are `null`.

## 3. Rest-activity rhythm (van Someren)

Input: hourly steps (sum of four 15-minute bins) for the 7 days ending on `date`. Requires
at least 5 days with steps present; missing days are left out.
Let `x_i` be the hourly values in time order (`n` values), `x̄` their mean, `p = 24`, and
`x̄_h` the mean for hour-of-day `h` across the included days.

```
IS = ( n · Σ_h (x̄_h − x̄)² ) / ( p · Σ_i (x_i − x̄)² )            range 0..1
IV = ( n · Σ_{i≥2} (x_i − x_{i−1})² ) / ( (n−1) · Σ_i (x_i − x̄)² )   range 0..~2
RA = (M10 − L5) / (M10 + L5)
```

`M10` is the mean of the 10 consecutive hours with the highest mean in the average 24-hour
profile `x̄_h` (wrapping around midnight); `L5` is the same for the 5 lowest consecutive
hours. For IV, differences are only taken between consecutive hours of the same included
block of days. If the denominator is 0, the feature is `null`.

## 4. Rest period

Night window for `date`: from 21:00 on the previous day to 12:00 on `date`.

1. **If `sleep` has intervals:** merge intervals separated by less than 60 minutes. The
   main rest period is the longest merged interval inside the night window.
2. **Otherwise (step-based):** take the 15-minute bins of the night window (needs the
   previous day's `DayRaw`). The main rest period is the longest run of consecutive bins
   with 0 steps. It is valid only if it lasts between 3 and 14 hours.

`rest_duration` is its length in hours. `rest_midpoint` is its midpoint. Record the source
(`healthkit` or `steps`) in `FeatureDay.restSource`; the baseline is only computed over
days with the same source as the current day.

The step-based value is the time the phone was not carried, which is longer than sleep.
That is acceptable because it is only ever compared with the user's own history. The UI
calls it "rest", never "sleep", unless the source is HealthKit.

## 5. Mobility from visits

### Places
Places are learned incrementally and stored in `EngineState.places`.
For each visit in time order: assign it to the nearest existing place whose centre is
within `cfg.placeRadiusM` (150 m); otherwise create a new place with the visit's
coordinate as its centre. A place's centre is the duration-weighted mean of its visits.

**Home** is the place with the most time between 00:00 and 06:00 over the last 28 days.
It is `null` until there are at least 3 such nights.

### Per-day quantities
Clip each visit to the day. `t_k` = minutes at place `k`, `T = Σ t_k` (known time). The
mobility features are `null` when `T < cfg.minKnownMinutes` (480).

```
home_stay         = t_home / T
location_entropy  = −Σ_k (t_k/T)·ln(t_k/T) / ln(N)      N = places with t_k>0; 0 if N = 1
places_visited    = N
location_variance = log10( 1 + Σ_k (t_k/T)·dist(place_k, c)² )
                    c = time-weighted mean position of the day, dist in metres (haversine)
```

### Routine regularity
For each hour `h` of the day, the occupied place is the place with the most minutes in that
hour (`unknown` if under 20 known minutes). The usual place for hour `h` is the most common
occupied place at that hour over the previous 28 days of the same day type (weekday or
weekend, §2 of `docs/04_DETECTION.md`).

```
routine_regularity = (# hours where occupied == usual) / (# hours where both are known)
```
`null` if fewer than 7 previous days of that day type exist or fewer than 12 hours are comparable.

### Named places
For a confirmed rule with a `place_label` (for example "gym"), the user picks the place on
a map, or taps "I'm here now". `place_visits:<placeId>` counts visits of at least 15
minutes to that place in the 7-day window.

## 6. Communication (P2)

Counting outgoing messages or calls is not possible on iOS: there is no API for message or
call history. Two things replace it.

1. **Always available:** a personal check-in item created by task G, for example
   "Did you reply to messages today?" (yes / partly / no).
2. **P2, behind `cfg.phone.enabled`:** `communication_time`, the minutes spent in apps of
   the communication category, measured with Screen Time threshold events
   (`docs/PLATFORM_NOTES.md` §4). This is time in messaging apps, not messages sent, and is
   named that way in the UI.

## 7. Language features (deterministic)

`languageFeatures(text)` on any free-text answer. English only. Tokenise on non-letters,
lowercase. `W` = number of tokens. Returns `null` when `W < 20`.

```
FPS = count(i, me, my, mine, myself) / W
OTH = count(you, your, he, she, they, we, us, them) / W
ABS = count(tokens in the absolutist list) / W
SF  = FPS / (FPS + OTH + 1e-6)
```

Absolutist list (Al-Mosaiwi & Johnstone, 19 words): absolutely, all, always, complete,
completely, constant, constantly, definitely, entire, ever, every, everyone, everything,
full, must, never, nothing, totally, whole.

These values and the task B markers are stored and charted. They **never** enter the
deviation index (rule R6): text estimates the level of symptoms, but detects change within
one person poorly.

## 8. Output: `FeatureDay`

```ts
interface FeatureDay {
  date: string
  dayType: "weekday" | "weekend"
  values: Record<FeatureId, number | null>
  restSource: "healthkit" | "steps" | null
}
```

## 9. Heart (watch)

`hrv` is the overnight heart rate variability (SDNN, ms), valid between 5 and 300; `resting_hr`
the resting heart rate (bpm), valid between 30 and 130. Outside those ranges, or without a
watch, the feature is `null`. Both form the `body` domain, shown to the user as "Heart".

Lower HRV goes with depression and more so with severity (Kemp 2010, meta-analysis); in
people with recurrent depression, changes in resting heart rate went with symptom severity
(Siddi 2023, RADAR-MDD). Both also move with illness, alcohol, training and travel, so an
`ill` label masks the domain, and like every feature they are only compared with the user's
own nights.
