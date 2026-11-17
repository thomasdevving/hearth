# 08 · Replay persona and time machine

## 1. Why

The product needs weeks of history before it does anything. Judges have minutes. The web
app therefore runs the **real engine and the real models** on a simulated person, with a
control to move through time. Only the sensor data is simulated.

## 2. `simulatePersona(seed, scenario) → ReplayData`

Pure, seeded, in `packages/engine/src/simulate/`.

```ts
interface ReplayData {
  startDate: string
  raws: DayRaw[]                       // one per day
  script: ScriptEvent[]                // what the persona "does" in the app
}
type ScriptEvent =
  | { date: string; type: "plan_text"; text: string }
  | { date: string; type: "checkin_answer"; answers: { mood_low: number; enjoyment: number; energy: number; company: string }; personal: Record<string, "yes" | "partly" | "no">; freeText: string | null }
  | { date: string; type: "questionnaire_answers"; instrument: "PHQ2" | "PHQ9"; answers: number[] }
  | { date: string; type: "ignore_checkin" }
```

Script events are **suggestions**: in the time machine the judge can accept the scripted
answer with one click or answer themselves.

### 2.1 Default persona: "Sam"
Works weekdays 09:00–17:30, gym Monday/Wednesday/Friday evening, sees friends on Saturday.

| Parameter | Weekday | Weekend | Noise (sd) |
|---|---|---|---|
| Rest start / end | 23:15 / 07:00 | 00:15 / 08:45 | 25 min |
| Steps per day | 8 500 | 7 000 | 1 500 |
| Places | home, work, gym (3×), shop (2×) | home, friends, park, shop | — |
| Walking speed | 1.32 m/s | 1.30 m/s | 0.04 |
| Heart rate variability (SDNN, overnight) | 48 ms | 48 ms | ×e^(0.15·N) |
| Resting heart rate | 58 bpm | 58 bpm | 1.6 bpm |

Step bins: zero during rest, low at home, bursts on commutes and at the gym. Visits are
generated from the day's place sequence with fixed coordinates in one city.

Sam wears a watch at night. Sleep runs from 8–25 minutes after going to bed until 3–13
minutes before getting up, with a brief awakening (5–20 min) on half of the nights. On about
1 night in 25 the watch is off: that night has no sleep or heart data, and rest falls back to
the step-based estimate. Sleep and heart data use their own random stream, so steps and
places are the same as without the watch.

### 2.2 Default scenario (150 days)

| Days | Phase | What changes |
|---|---|---|
| 1–60 | Stable | Nothing. Random check-ins, mood around 2/7. |
| 1 | — | Scripted `plan_text` (the example in `docs/05_LLM_TASKS.md` task G), offered on `plan_setup`. |
| 61–67 | Holiday | Other city, no work or gym, later rest, more steps. Scripted free text on day 61: "I'm in Spain this week, back on Sunday." |
| 68–95 | Stable | Back to normal. |
| 96–102 | Exam week | Slightly less rest, fewer steps. Free text: "Exam week, lots of stress." (stressor, no masking) |
| 103–130 | Gradual decline | Linear over 28 days: rest midpoint +100 min, gym visits 3 → 0 per week, home stay +25 points, steps −35%, walking speed −0.08 m/s, Saturday friends visit dropped from day 115, HRV −18 %, resting heart rate +3.5 bpm. Mood rises from 2 to 5; "Did you eat well today?" turns to "no". |
| 131–150 | After | Scripted PHQ-2 = 4, PHQ-9 = 13 (item 9 = 0). Then partial recovery. |

A second scenario, `slow`, has the same decline spread over 60 days (used by the
"slow decline" test). A third, `safety`, differs only in a PHQ-9 with item 9 = 1.

### 2.3 Expected behaviour (acceptance for the replay)
With seed 1 and default config:
- state is `MONITOR` from day 15 at the latest;
- **no** `ELEVATED` day during 61–67 once the holiday is confirmed; at least one if it is not;
- the exam week masks nothing;
- first `ELEVATED` day falls between day 108 and day 120;
- `rest_midpoint` and `place_visits:<gym>` are among the contributors within the first 3
  days of the change (from the first `ELEVATED` day);
- PHQ-2 is offered within 7 days after the first `ELEVATED` day;
- no day ever has more than one check-in.

These are engine tests as well as demo behaviour.

## 3. The `timemachine` screen (web)

A bar fixed to the bottom of the web app.

| Control | Does |
|---|---|
| Persona / scenario / seed | Reset the local store and load `ReplayData`. |
| Date and day counter | Shows the simulated "today". |
| `+1 day` | Appends that day's `DayRaw`, runs `dailyUpdate`, executes the returned actions through the normal UI. |
| `Play` | Steps a day every 400 ms; pauses automatically whenever an action needs the user (check-in, questionnaire, context confirmation). |
| `Jump to…` | Menu: *holiday*, *first change*, *PHQ-9*. Fast-forwards with scripted answers auto-accepted. |
| `Use scripted answer` | Appears on check-ins and questionnaires; fills in the persona's answer. |
| Network switch | `Online` / `Offline`: when offline, the app's `online` flag is false so routing behaves as it would without a connection. |
| Model status | Shows whether the on-device model is available and which model answered last. |

Rules:
- "Today" in the web app always comes from the time machine, never from the system clock.
- Check-ins, questionnaires, model calls, the ledger and Firestore uploads are **real**.
  A judge who types their own plan gets real task G output from the model in their browser.
- A banner states: "Demo: the sensor data is simulated. Everything else is live."
- If Chrome has no on-device model, the banner explains how to enable it, and S3 tasks use
  their non-LLM fallbacks. The app remains fully usable.

## 4. iOS debug menu

A hidden debug screen (5 taps on the version number) can: show `EngineState`, re-run the
backfill, force a check-in, and load the replay persona into a separate in-memory store for
recording the video. It never mixes replay data with the user's real data.
