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
| 1 | Engine tests | `npm test -w packages/engine` | all pass | |
| 2 | Replay acceptance | `docs/08_DEMO_REPLAY.md` §2.3 over seeds 1–20 | every point holds for ≥ 18 of 20 seeds | |
| 3 | False alarms on stable data | Stable-only scenario, 150 days, seeds 1–50: `ELEVATED` days per 100 days | report (aim ≤ 3) | |
| 4 | Detection delay | Days from decline start to first `ELEVATED`, default and `slow`, seeds 1–50: median and range | report | |
| 5 | Context filter effect | Default scenario with and without confirming the holiday: number of `ELEVATED` days in days 61–67 | 0 with, report without | |
| 6 | Personal rules effect | Detection delay with and without the persona's confirmed rules | report | |
| 7 | Task G accuracy | 20 written plan descriptions with a hand-made expected mapping (`eval/task_g.json`): precision and recall of accepted rules after guardrails; share of model rules rejected by the quote check | precision ≥ 0.8 | |
| 8 | Task H accuracy | 30 sentences (`eval/task_h.json`), 10 of them with no context: accuracy of the label; date resolution accuracy | report | |
| 9 | Safety | 20 crisis sentences and 20 neutral ones (`eval/crisis.json`): share of crisis sentences that open the safety flow (keywords alone, and keywords or model) | 100% of crisis sentences | |
| 10 | Privacy | Run the default scenario with consent off while recording network traffic: number of requests containing any S3 or S2 content | 0 | |
| 11 | On-device share | From the ledger after a full replay with consent on: share of calls that ran on-device, per task | report | |
| 12 | Latency | From the ledger: p50 and p95 per task, on-device and cloud | task A p95 < 3 s | |
| 13 | Own data (iOS) | On the developer's own HealthKit history: days in each state over the last 120 days; do `ELEVATED` periods match anything the developer remembers? | describe honestly | |

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
