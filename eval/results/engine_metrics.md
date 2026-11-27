## Metric 2 · Replay acceptance, seeds 1–20 (docs/08 §2.3)
| Point | Seeds passing |
|---|---|
| monitorBy15 | 20 / 20 |
| holidayQuiet | 20 / 20 |
| holidayAlarmIfUnconfirmed | 20 / 20 |
| examMasksNothing | 20 / 20 |
| firstElevatedIn108to120 | 16 / 20 |
| contributorsRestAndGym | 16 / 20 |
| phq2Within7 | 19 / 20 |
| oneCheckinPerDay | 20 / 20 |
| all points together | 16 / 20 |
Seeds failing any point: 4, 11, 14, 17

## Metric 3 · False alarms on stable data, seeds 1–50 (150 days, from day 15)
ELEVATED days per 100 days: mean 1.03, median 0.00, max 11.76
Episodes (entries into ELEVATED) per 150 days: mean 0.30; seeds with none: 39 / 50

## Metric 4 · Detection delay (days from decline start to first ELEVATED), seeds 1–50
| Scenario | Median | Range | Not detected | Seeds with an earlier false alarm |
|---|---|---|---|---|
| default (decline 103–130) | 7 | 3–8 | 0 | 6 |
| slow (decline 71–130) | 12 | 6–16 | 0 | 6 |

## Metric 5 · Context filter, ELEVATED days in days 61–67
Seed 1: 0 with the holiday confirmed, 5 without.
Seeds 1–20: 0 days with, 92 without (sum over seeds).

## Metric 6 · Personal rules effect on detection delay (default, seeds 1–50)
With Sam's confirmed rules: median 7 (range 3–8), not detected 0.
Without rules: median 8 (range 0–10), not detected 0.

## Metric 7 · Personal domain weights (docs/04 §4.4)
Learned only from random check-ins, gated by the real self-audit and leave-one-out validation.
Stable persona, seeds 1–50: ELEVATED days per 100 days 1.03 with weights vs 1.03 without (max 11.76 vs 11.76); weights active at the end in 0 / 50.
Sam (default), seeds 1–50: detection delay median 7 (range 3–8), not detected 0, earlier false alarm 6; without weights median 7 (range 3–8), not detected 0, earlier false alarm 6.
| Activity-sensitive person, seeds 1–20 | Mood follows activity | No link (control) |
|---|---|---|
| Weights active before the decline | 10 / 20 (activity weighs most in 9) | 2 / 20 |
| Decline seen earlier / later than equal weights | 7 / 1 | 3 / 0 |
| Decline detected (with / without weights) | 20 / 18 | 19 / 18 |
| False ELEVATED days, days 31–134 (with / without) | 65 / 57 | 57 / 57 |

## Metric 8 · Unanswered check-ins (docs/04 §7.5)
Stable sensors, seeds 1–40, 180 days. False episodes: entries into "fewer answers" with no change in the share left. Stops: from day 120 the person leaves 75 %.
| Usually left | False episodes per 100 days | Stops: median days to the signal | Stops: signal within 28 days |
|---|---|---|---|
| 10 % | 0.07 | 9 | 38 / 40 |
| 20 % | 0.32 | 11 | 35 / 40 |
| 30 % | 0.63 | 13 | 34 / 40 |
With the old back-off (halve after 2 unanswered instead of 4):
| 10 % | 0.07 | 11 | 34 / 40 |
| 20 % | 0.33 | 14 | 33 / 40 |
| 30 % | 0.57 | 12 | 27 / 40 |
Holiday (days 90–100, 80 % left, usually 10 %), seeds 1–40: 4 false episodes with the holiday confirmed, 34 without.
Sam (answers almost every check-in), seeds 1–50 with the signal on: 0 "unanswered" PHQ-2 offers; first ELEVATED day unchanged in 50 / 50.
