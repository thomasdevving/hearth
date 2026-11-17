## Metric 2 · Replay acceptance, seeds 1–20 (docs/08 §2.3)
| Point | Seeds passing |
|---|---|
| monitorBy15 | 20 / 20 |
| holidayQuiet | 20 / 20 |
| holidayAlarmIfUnconfirmed | 20 / 20 |
| examMasksNothing | 20 / 20 |
| firstElevatedIn108to120 | 17 / 20 |
| contributorsRestAndGym | 10 / 20 |
| phq2Within7 | 18 / 20 |
| oneCheckinPerDay | 20 / 20 |
| all points together | 10 / 20 |
Seeds failing any point: 2, 4, 6, 9, 11, 13, 16, 17, 18, 20

## Metric 3 · False alarms on stable data, seeds 1–50 (150 days, from day 15)
ELEVATED days per 100 days: mean 2.59, median 0.00, max 33.09
Episodes (entries into ELEVATED) per 150 days: mean 0.44; seeds with none: 33 / 50

## Metric 4 · Detection delay (days from decline start to first ELEVATED), seeds 1–50
| Scenario | Median | Range | Not detected | Seeds with an earlier false alarm |
|---|---|---|---|---|
| default (decline 103–130) | 7 | 0–8 | 0 | 9 |
| slow (decline 71–130) | 12 | 7–16 | 0 | 6 |

## Metric 5 · Context filter, ELEVATED days in days 61–67
Seed 1: 0 with the holiday confirmed, 6 without.
Seeds 1–20: 0 days with, 101 without (sum over seeds).

## Metric 6 · Personal rules effect on detection delay (default, seeds 1–50)
With Sam's confirmed rules: median 7 (range 0–8), not detected 0.
Without rules: median 8 (range 1–12), not detected 0.
