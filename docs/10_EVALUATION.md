# 10 · Evaluation

Fill in the **Result** column in milestone M11. Report every number, including bad ones.

## 1. What we claim

- The pipeline works end to end and the detection logic behaves as specified.
- Raw personal content does not leave the device.
- The model's structured outputs are accurate enough to be useful and its errors are
  caught by code.

We do **not** claim diagnostic accuracy or that the app predicts relapse.

## 2. Measurements

| # | Metric | How | Target | Result |
|---|---|---|---|---|
| 1 | Engine tests | `npm test -w packages/engine` | all pass || 216 pass, 0 skipped (`npm test`; web: 28 pass) |
| 2 | Replay acceptance | `docs/08_DEMO_REPLAY.md` §2.3 over seeds 1–20 | every point holds for ≥ 18 of 20 seeds || Seed 1: all points hold. Seeds 1–20: MONITOR by day 15 20/20; holiday quiet 20/20; holiday alarms if unconfirmed 20/20; exam masks nothing 20/20; one check-in a day 20/20; first ELEVATED in 108–120 16/20; PHQ-2 within 7 days 19/20; rest + gym among contributors in the first 3 days 16/20. **All points together: 16/20 (target 18 not met).** The contributor point was widened from the first day to the first 3 days (2026-11-17); under the old wording it is 10/20, with or without the watch data |
| 3 | False alarms on stable data | Stable-only scenario, 150 days, seeds 1–50: `ELEVATED` days per 100 days | report (aim ≤ 3) || 1.03 ELEVATED days per 100 days (median 0, max 11.8); 0.30 episodes per 150 days; 39/50 seeds have none. Before the watch data (sleep, HRV, resting heart rate): 2.59, 0.44, 33/50 |
| 4 | Detection delay | Days from decline start to first `ELEVATED`, default and `slow`, seeds 1–50: median and range | report || default: median 7 days (range 3–8), none missed; slow: median 12 (6–16), none missed. 6 resp. 6 of 50 seeds also had an earlier false alarm (before the watch data: 9 resp. 6) |
| 5 | Context filter effect | Default scenario with and without confirming the holiday: number of `ELEVATED` days in days 61–67 | 0 with, report without || Seed 1: 0 with, 5 without. Seeds 1–20: 0 with, 92 without (sum) |
| 6 | Personal rules effect | Detection delay with and without the persona's confirmed rules | report || With rules: median 7 (3–8); without: median 8 (0–10); none missed either way |
| 7 | Task G accuracy | 35 written plan descriptions with a hand-made expected mapping (`eval/task_g.json`): precision and recall of accepted rules after guardrails; share of model rules rejected by the quote check | precision ≥ 0.8 || **Not yet measured with Gemini Nano** (model download blocked in the build container). Set and scorer ready: Settings → "Test the plan reader" (`#/eval_g`) |
| 8 | Task H accuracy | 30 sentences (`eval/task_h.json`), 10 of them with no context: accuracy of the label; date resolution accuracy | report || Label accuracy: not yet measured (needs the model; same screen). Date resolution in code given correct hints: 19/20 (miss: a past "on Sunday" read as the coming Sunday) |
| 9 | Safety | 20 crisis sentences and 20 neutral ones (`eval/crisis.json`): share of crisis sentences that open the safety flow (keywords alone, and keywords or model) | 100% of crisis sentences || Keywords alone: 20/20 crisis, 0/20 neutral flagged, after extending the keyword list with the 7 phrasings it first missed (13/20 before), so this is not an unbiased estimate. Keywords-or-model: not measured (needs the model) |
| 9b | Crisis flag false positives | Task B on 30 everyday low-mood texts with no crisis (`eval/task_b_everyday.json`): share with `crisis` ≠ none; and recall on the 20 crisis sentences | report || **Not yet measured with Gemini Nano** (screen ready: `#/eval_g`, Task B). Prompt B v2 says low mood, avoiding people and phrases like "dead tired" are not crisis on their own |
| 10 | Privacy | Run the default scenario with consent off while recording network traffic: number of requests containing any S3 or S2 content | 0 || 0 requests leaving the page in both runs (no model; stand-in model), 0 containing user text; 0 requests before consent with a configured project |
| 11 | On-device share | From the ledger after a full replay with consent on: share of calls that ran on-device, per task | report || Not yet measured (needs the real model; table on `#/eval_g` from the ledger) |
| 12 | Latency | From the ledger: p50 and p95 per task, on-device and cloud | task A p95 < 3 s || Not yet measured (same) |
| 13 | Own data (iOS) | On the developer's own HealthKit history: days in each state over the last 120 days; do `ELEVATED` periods match anything the developer remembers? | describe honestly || **Not measured yet.** The iOS app is built (M8/M9) but has not run on the developer's iPhone (not connected; Xcode sign-in to renew). Once it has, Trends → "Days in each state" shows the counts for the last 120 scored days and the dates on which changes started. Days in each state: WARM_UP –, MONITOR –, ELEVATED –, CONFIRMED –. **To be written by the developer:** whether the changed periods match anything they remember. This part is not to be guessed. |

## 3. Evaluation sets

`eval/*.json` are written by hand or generated with the cloud model at development time
and then checked by hand. They contain invented text only, never a real person's words.
Scripts live in `eval/` and print a table that is pasted here.

## 4. Known limitations (state these in the README)

- The detection thresholds are untested on real relapses; the replay persona is synthetic.
- Step-based rest is a rough proxy for sleep.
- Without an Apple Watch or location permission, only the activity, rhythm and sleep-proxy domains are available.
- English only.
- The on-device model can misread a plan or a context; the quote check and user
  confirmation catch invented entries but not every missed one.

## 5. How the numbers were produced (2026-11-17)

- Metrics 2–6: `npx tsx eval/engine_metrics.ts` → `eval/results/engine_metrics.md`.
- Metrics 8 (code part) and 9: `npx tsx eval/text_metrics.ts` → `eval/results/text_metrics.md`.
- Metric 10: `node eval/privacy.cjs [--fake-model]` against `vite preview` → `eval/results/privacy.md`.
- Metrics 7, 8 (labels), 11, 12: the hidden `#/eval_g` screen in Chrome with Gemini Nano.
  The build container could not download the model, so these are still open.

### Notes on the misses
- **Metric 2.** The persona's decline makes several signals change at once; which three rank
  as contributors on a single day varies by seed (often `home_stay`, `fragmentation`,
  `resting_hr` or `location_entropy` outrank `rest_midpoint` or the gym). Over the first 3 days
  of the change both of Sam's signs appear in 16 of 20 seeds. Four seeds have a false alarm
  before day 108. The detection itself is reliable (metric 4: no seed missed).
- **Watch data (2026-11-17).** Sam now wears a watch at night: sleep from the watch, overnight
  HRV and resting heart rate (`docs/08` §2.1). The effect sizes in the persona are assumptions.
  The fall in false alarms on stable data comes from the extra, independent `body` domain and
  measured sleep; it says nothing about real people.
- **Metric 3.** Before the watch data, one seed spent a third of the stable run `ELEVATED`: once elevated, the
  reference is frozen and a harmless drift keeps the index above the limit (the known
  limitation in `docs/DECISIONS.md`, M2).
