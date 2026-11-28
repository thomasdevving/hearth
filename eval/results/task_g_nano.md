# Task G prompt tuning on Gemini Nano

Chrome 157 on this laptop (Windows 11, NVIDIA GPU), Gemini Nano via the Prompt API, `LanguageModel.availability()` = "available".
Local dev build (`npm --prefix apps/web run dev`), screen `#/eval_g`. Tuning set: `eval/task_g.json` (35 cases, read per case).
Holdout set: `eval/task_g_holdout.json` (30 cases, summary numbers only; never opened).

Columns: P = rule precision, R = rule recall, Q = check-in questions found / expected, QF = model rules rejected by
the quote check, ms = median latency per case (tuning: from the per-case table; holdout: from the last 30 G ledger
entries). "Kept" follows the rule: higher precision with recall at most 5 points lower, or same precision with higher recall.

## Rounds

| Round | Version | Change | Tuning P / R / Q / QF / ms | Holdout P / R / Q / QF / ms | Kept |
|---|---|---|---|---|---|
| 0 | v3 | Starting point (feature table) | 45 % / 48 % / 17 of 22 / 4 % / 6778 | 65 % / 72 % / 17 of 14 / 6 % / 5119 | baseline |
| 1 | v4 | One sign gives at most one rule (first line that fits, named place first); everyday wordings for staying in, named places, errands; steps only when walking is named; routine only when the weekly routine itself falls apart | 60 % / 73 % / 28 of 22 / 4 % / 6289 | 67 % / 76 % / 25 of 14 / 5 % / 5295 | yes |
| 2 | v5 | On v4: people are never places (a question instead); "things that help are only actions, never a question"; places_visited only "in general" | 55 % / 66 % / 26 of 22 / 2 % / 6906 | not run | no |
| – | v4 again | Noise check: same prompt, second tuning run | 54 % / 68 % / 27 of 22 / 2 % / 6318 | – | – |
| 3 | v6 | On v4: a named place or activity is always place_visits, never places_visited (invented examples); people are never places; "goes out less" is staying in; reworded two lines that matched tuning wordings | 61 % / 71 % / 27 of 22 / 5 % / 6170 and 58 % / 73 % / 24 of 22 / 3 % / 5973 (avg 59.5 % / 72 %) | not run (gain within noise; budget kept for bigger steps) | yes |
| 4 | v7 | Sleep split into when / how long / how regular, with everyday wordings for each; "in bed" moved out of staying in; "use no other feature"; helps and denied signs are never rules | 65 % / 77 % / 33 of 22 / 3 % / 6172 and 64 % / 71 % / 32 of 22 / 6 % / 5935 (avg 64.5 % / 74 %) | 71 % / 80 % / 22 of 14 / 2 % / 5996 | yes |
| 5 | v8 | Step 1 splits the text into warning signs and helps first; questions only for warning signs; invented counter-example "Knitting helps" → action, never "Did you knit today?" | 67 % / 65 % / 33 of 22 / 6 % / 4989 and 77 % / 79 % / 35 of 22 / 7 % / 5692 (avg 72 % / 72 %) | not run (code base changed next) | yes |

## Notes per round

**Round 0 (v3).** Most common mistakes on the tuning set:
- `routine_regularity:lower` invented for unrelated signs (6 cases), e.g. "I skip the gym" became a routine rule.
- `steps:lower` for staying in ("I don't leave the house much") instead of `home_stay:higher` (8 wrong `steps` rules).
- One quote turned into two rules (same phrase as `steps` and `routine_regularity`).
- Named places missed (10 `place_visits` misses): "skip X", "no X", "stop cycling to X" are not read as stopping going to a place; sometimes `places_visited` is used instead.
- Sleep wording mixed up: irregular sleep → `fragmentation` or `rest_midpoint`; "sleep in longer" → `rest_midpoint` instead of `rest_duration`.
Holdout precision is 20 points above tuning: the tuning set holds more of the hard wordings.

**Round 1 (v4), kept.** Fixes the v3 pattern (staying in → steps, skip X → routine). Remaining on tuning:
- `places_visited:lower` as an extra rule in 8 cases, often for people ("I don't see anyone", "stop seeing friends") or next to a named-place rule.
- `routine_regularity:lower` still in 5 cases.
- Sleep wordings: duration vs timing vs regularity mixed up (oversleeping → also `rest_midpoint`; waking many times → `rest_duration`).
- Things that help turned into questions ("Did you see your therapist today?"). Holdout questions 25 of 14.

**Round 2 (v5), not kept.** 55 / 66 on one run, below v4's 60 / 73.

**Noise check.** Gemini Nano runs with Chrome's default sampling (the app sets no on-device temperature), so the
same prompt scores differently from run to run: v4 gave 60 / 73 and then 54 / 68. A difference of about 5 points
is noise. From round 3 on every version gets two tuning runs and is compared on the average (v4: 57 % / 70.5 %).
The second v4 run shows the biggest error clearly: 11 wrong `places_visited:lower`, from named places written
without "going to" ("skip the gym", "no gym", "Less gym", "skip my swimming"), from people ("I don't see anyone",
"stop seeing friends", "stop answering my phone") and from staying in ("go out less").

**Round 3 (v6), kept.** Wrong `places_visited` fell from 11 to 4. New top errors: `home_stay` for things that
help ("Being outside helps") and for staying in bed late (the v4 home line said "in bed"); a denied sleep sign kept;
features outside the table (`location_entropy`, `active_hours`); irregular sleep (random hours, waking many times,
long one night and short the next) missed in 4 cases.

**Round 4 (v7), kept; holdout look 3 of 6.** Precision up on both sets (tuning +5, holdout 67 → 71) and
recall too, so no sign of overfitting. Questions rose to 1.5× expected on both sets. Almost every extra question is
about something that helps ("Did you take a warm bath before bed today?", "Did you garden today?") or a feeling
("Did you feel off today?"). Still wrong: people as a place label (brother, friends, mum), `routine_regularity`.

**Round 5 (v8), kept on precision (+7.5, recall −2).** The counter-example did not stop questions about helps
(still 1.5×); one case even copied the prompt example's own question. Nano writes a question for almost every help.

## Code change after round 5: `g-structure` (commit c5f4f51)

Rounds 0–5 ran on the guardrails in `main` (7068488). From round 6 on, `tune-g-nano` sits on top of
`origin/g-structure`, which moves part of task G into code: on the device Nano chooses one legal "feature,
direction" pair per rule from a short list (no research-only features), illegal directions are dropped, and a rule
or question quoted from a "helps" clause, or a question whose quote overlaps a rule, is dropped. These numbers are
not comparable with rounds 0–5, so the best version is measured again first.

| Round | Version | Change | Tuning P / R / Q / QF / ms | Holdout P / R / Q / QF / ms | Kept |
|---|---|---|---|---|---|
| 6a | v8 on g-structure | Baseline on the new code, no prompt change | 60 % / 60 % / 11 of 22 / 3 % / 4468 and 63 % / 65 % / 7 of 22 / 3 % / 4873 (avg 61.5 % / 62.5 %) | not run | baseline |
| 6 | v9 | Step 2 as an explicit branch: a line fits → rule, no line fits → question; names the kinds of signs that fit no line (eating, washing, household tasks, messages, people, hobbies, drinking, money); shorter place lines | 63 % / 66 % / 12 of 22 / 1 % / 5450 and 65 % / 63 % / 11 of 22 / 4 % / 5595 (avg 64 % / 64.5 %) | not run | yes |
| 7 | v10 | On v9: a new invented example with two rules, two questions for unmeasurable signs and one help (instead of three rules and one question) | 61 % / 61 % / 12 of 22 / 1 % / 5742 and 56 % / 50 % / 15 of 22 / 2 % / 6230 (avg 58.5 % / 55.5 %) | not run | no |
| 8 | v11 | On v9: Step 2 as a topic gate ("a phone and watch only see five things: sleep, walking or moving, time at home, going to places, heart rate") | 47 % / 55 % / 11 of 22 / 1 % / 6372 (second run stopped: clearly worse) | not run | no |
| 9 | v12 | On v9: a self-check that each rule's quote names what its line is about (sleep or bed, walking, home, the place's name, heart), else a question; shorter list of unmeasurable kinds | 53 % / 55 % / 12 of 22 / 4 % / 4712 (second run stopped: clearly worse) | not run | no |
| 10 | v13 | On v9: names the two look-alike signals side by side ("place_visits, lower" = one named place, always with place_label; "places_visited, lower" = fewer places overall, no place named); "whenever you write a place_label the signal is place_visits" | 63 % / 60 % / 21 of 22 / 3 % / 5455 and 58 % / 60 % / 16 of 22 / 3 % / 5322 (avg 60.5 % / 60 %) | not run | no (questions recovered, rules did not) |
| 11 | v14 | Compact rewrite of v9 (491 words): one line per signal, no long sleep paragraph, same decisions | 53 % / 68 % / 8 of 22 / 6 % / 6831 (second run stopped: clearly worse) | not run | no |
| – | v7 on g-structure | Re-measured for the final choice | 55 % / 58 % / 7 of 22 / 3 % / 4760 and 62 % / 66 % / 10 of 22 / 4 % / 5088 (avg 58.5 % / 62 %) | 68 % / 78 % / 8 of 14 / 3 % / 4882 (look 4) | – |
| – | v9 on g-structure | Holdout for the final choice | (see round 6) | 72 % / 76 % / 10 of 14 / 3 % / 5622 (look 5) | final |
| final | v9 on g-structure | Final run on both sets | 66 % / 65 % / 15 of 22 / 1 % / 5649 (actions 38 of 43) | 67 % / 74 % / 5 of 14 / 3 % / 5945 (actions 31 of 32, look 6) | – |

## Result

**The targets were not reached.** Early stop after round 11 (five rounds without a kept version). The final
version is **v9**: the best holdout precision measured on the code it ships with (72 % at look 5, 67 % at the final
look; run-to-run noise on Gemini Nano is about ±5 points), and it meets the 10-point gap rule because holdout
precision is above tuning precision.

| Check | Target | v9 final run | Met |
|---|---|---|---|
| Tuning precision / recall | ≥ 80 % / ≥ 70 % | 66 % / 65 % | no |
| Holdout precision / recall | ≥ 75 % / ≥ 65 % | 67 % / 74 % | precision no, recall yes |
| Holdout precision gap | ≤ 10 points below tuning | +1 (above tuning) | yes |
| Questions | ≤ 1.3× expected | tuning 15 of 22, holdout 5 of 14 (below, not above) | yes |
| Quote fails | ≤ 10 % | 1 % / 3 % | yes |

Most common remaining mistakes on the tuning set (final run):
1. `places_visited:lower` for things that are not "fewer places": people, phone, walks, staying in (7 cases);
   e.g. `second_person`, "You stop seeing friends". Often Nano means one named place (it writes a place_label) but
   picks the look-alike signal "places_visited, lower".
2. `rest_midpoint:later` for the other kinds of sleep or for feelings (6 cases); e.g. `irregular`, "sleep at random
   hours" (expected `rest_regularity`).
3. `home_stay:higher` for signs that are not about being at home (4 cases); e.g. `hygiene`, "don't open my post".

Suggestions outside this task (code, not prompt): read "places_visited" with a non-empty place_label as
place_visits (or give the two signals names that do not look alike); put `quote` before `signal` in the on-device
rule schema so Nano finds the words before it picks a signal; let the help guard also cover a list that follows
"Things that help me:" on the same line.

**Round 6a.** The new code lowers v8 from 72 / 72 to 61.5 / 62.5 and questions fall to 9 of 22. The raw output
shows why: with one combined signal per rule, Nano puts every warning sign into `rules`, picking the closest
signal even for signs no sensor can see ("I stop replying to messages" → `places_visited`, "stop cooking" →
`places_visited`, "don't open my post" → `home_stay`), and writes its questions about the helps, which the new
guardrail then drops.

**Round 6 (v9), kept by a small margin.** Still a rule for almost every sign ("I cancel plans" → `home_stay`,
"I just feel flat" → `rest_midpoint`), and one case copied the prompt example's own sign ("I stop watering my
plants") as a question. The example had three rules and one question, and Nano copies that shape.

**Round 7 (v10), not kept.** The balanced example made it worse: unmeasurable signs turned into named places
instead (`place_visits` "letters", "showering", "cooking"). Back to v9.

**Round 8 (v11), not kept.** Naming "going to places" as one of five topics pushed Nano to `places_visited` for
almost anything (13 wrong). Back to v9.

**Observation on the new code.** In the on-device schema the rule's `signal` comes before its `quote`, so Nano
chooses a signal first and then looks for words to quote. It walks through the text and gives nearly every sign a
rule. v8 dropped from 72 / 72 (old schema) to 61.5 / 62.5 (combined signal) with no prompt change, so the combined
choice list seems to cost precision with Nano; the help guardrail itself works as intended (no question about a
help survives).

**Round 9 (v12), not kept.** The self-check did not stop the place errors. The raw output shows what is really
going on: Nano writes a `place_label` (work, yoga, supermarket, friends, market) but picks the look-alike signal
"places_visited, lower" instead of "place_visits, lower"; the guardrail then empties the label, so the rule counts as
a wrong `places_visited` and a missed `place_visits`. This one confusion explains most place errors since 6a.
A one-line code fix would remove it (read "places_visited" with a non-empty place_label as place_visits, or rename
one of the two signals); that is outside this task, so v13 tries to fix it in the prompt.

**Round 10 (v13), not kept.** Naming the look-alikes brought questions back (18.5 of 22 on average) but not the
rules: "skipping yoga" still came out as "places_visited, lower" with place_label "yoga". Four rounds in a row
without a kept version; the strategy not yet tried is a shorter prompt, so round 11 is a compact rewrite of v9.

**Round 11 (v14), not kept.** Shorter was worse (precision 53 %, 14 wrong `places_visited`, questions 8 of 22).

## Early stop after round 11

Five rounds in a row (v10–v14) brought no kept version, after every strategy in the brief was tried: stricter
rules (v11, v12), more everyday wordings (v7), fewer and better questions (v8, v10, v13), a shorter prompt (v14);
quote fails never went above 10 %. The targets were not reached. On the new code the remaining errors are
dominated by one confusion the prompt cannot fix reliably: the look-alike signals "place_visits, lower" and
"places_visited, lower".

Choosing the final version: the brief says to take the best holdout precision among versions that meet the
10-point gap rule. The only holdout numbers so far (v3, v4, v7) were measured on the old code, so v7 (best so far)
and v9 (best on the new code) are each measured once more on the code they will ship with, and the better one
is run a final time on both sets (holdout looks 4, 5 and 6).
