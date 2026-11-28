# Task G probe plans (Gemini Nano sanity check)

Ten invented plans in different writing styles. They are not part of either eval set and are
never scored automatically. Each kept prompt version is run on them through the app's own
pipeline (`router().run("G", …)` plus the guardrails) and read by hand. "Expected" is my own
reading with the feature table in `shared/prompts/G.md`.

## Plans

**P1 · very short**
> late nights, no gym

Expected rules: rest_midpoint later; place_visits lower "gym". Questions: none. Actions: none.

**P2 · long and rambling**
> It usually creeps up on me over a couple of weeks. First I notice I'm scrolling in bed until two or three in the morning and then I can't get up for my lectures, so I end up missing most of them. I stop cooking and live on toast. I don't really go anywhere except the corner shop, and I stop picking up when my mum rings. My flatmates say I go quiet. What helps is when someone drags me out for a walk, and putting my phone in the kitchen at night.

Expected rules: rest_midpoint later; place_visits lower "lectures"; places_visited lower (or home_stay higher). Questions: cooking/eating; answering mum's calls; (going quiet, optional). Actions: a walk with someone; phone in the kitchen at night.

**P3 · bullet list**
> - sleeping 11-12 hours
> - not leaving the house
> - not showering
> - skipping band practice
> Helps: my dog, cold water on my face

Expected rules: rest_duration higher; home_stay higher; place_visits lower "band practice". Questions: showering. Actions: my dog; cold water on my face.

**P4 · partner's voice**
> From her partner: she stops going to her pottery class, she's on the sofa all weekend and barely walks anywhere. She gets snappy with me. Getting her to the allotment usually helps.

Expected rules: place_visits lower "pottery class"; steps lower; (home_stay higher, optional). Questions: snappy / arguments. Actions: going to the allotment.

**P5 · typos and lower case**
> i go to bed realy late and sleep thru the alarm, i dont go to werk some days, i stop eating proper meals. talking to my bro helps

Expected rules: rest_midpoint later; place_visits lower "work" (label may follow the spelling). Questions: proper meals. Actions: talking to my brother.

**P6 · slang**
> when im in a bad way i basically go full hermit, dont touch grass for days, gaming till 4am, ghost the group chat. footie on sundays sorts me out tbh

Expected rules: home_stay higher; rest_midpoint later. Questions: replying to the group chat. Actions: football on Sundays. (Football is a help here, never a rule.)

**P7 · negations**
> My sleep stays pretty normal and I still go to work every day. What changes is that I stop going to the climbing wall and I don't see friends at all. I also stop answering emails.

Expected rules: place_visits lower "climbing wall". Questions: seeing friends; answering emails. Actions: none. No sleep or work rule (both denied).

**P8 · only what helps**
> Things that help me: a hot bath, a call with my sister, a long bike ride, and writing a to-do list in the morning.

Expected rules: none. Questions: none. Actions: hot bath; call with my sister; bike ride; morning to-do list.

**P9 · nothing measurable**
> I get very self-critical, I overthink every message I send and I feel like a burden. I cry more easily.

Expected rules: none. Questions: at most one or two, or none (these are thoughts and feelings). Actions: none.

**P10 · mixed languages**
> Als het slechter gaat, I stay in bed until noon en ik ga niet meer naar de sportschool. I walk a lot less too. Wat helpt: fietsen met een vriend.

Expected rules: rest_midpoint later (or rest_duration higher); place_visits lower "sportschool" (gym); steps lower. Questions: none. Actions: cycling with a friend.

## Results per kept version

**v4** (run through the app pipeline with v4's text):
- P1: `rest_midpoint:later`; "no gym" became a question ("Did you go to the gym today?") instead of a gym rule.
- P2: `rest_midpoint:later`, `places_visited:lower`, `steps:lower` (no walking is named); missed lectures, cooking and mum's calls; odd question about the flatmates.
- P3: all three rules right, no questions, both actions. Good.
- P4: pottery class and sofa right; extra `places_visited`; the help ("allotment") also became a question.
- P5: bed late and "werk" right; extra `routine_regularity`; the help became a question; meals missed.
- P6: hermit → `home_stay`; "gaming till 4am" became an action instead of `rest_midpoint:later`; group chat question OK-ish.
- P7: denied sleep and work skipped (good); climbing wall right; "don't see friends" became `places_visited`.
- P8: only actions, nothing invented. Good.
- P9: one feelings question; acceptable.
- P10: gym ("sportschool") and walking right; bed until noon → `home_stay` instead of a sleep rule; help became a question.
Main general errors: helps turned into questions, people turned into places.

The later kept versions were run on the `g-structure` code (combined signal on the device, help guardrail),
after the last tuning round, each with its own prompt text.

**v6** (on g-structure):
- P1 late nights right; "no gym" still a question, not a gym rule. P2 only `rest_midpoint:later` and a good question
  about mum's calls; lectures and the shop missed. P3 all three rules right plus a shower question. Good.
- P4 pottery and sofa right, extra `places_visited`. P5 extra `routine_regularity`, "werk" missed.
- P6 "gaming till 4am" became an action; the help (football) became a question.
- P7 climbing wall right, extra `places_visited`. P8 only actions. P10 not shown here (same as v7).

**v7** (on g-structure):
- P2 lectures right and a phone-in-the-kitchen question about a help; extra `places_visited` and `routine_regularity`.
- P3 sleeping 11–12 hours became `rest_midpoint` instead of `rest_duration`; shower question right.
- P5 bed late and "werk" right, extra `routine_regularity`. P7 a question for "I still go to work" (a denied sign).
- P9 three feelings questions (too many for a text with no behaviour). P10 bed until noon and walking right.

**v8** (on g-structure):
- P2 sleep right but `rest_duration:lower` extra, lectures missed, no questions.
- P3 all three rules right plus an extra `rhythm_stability`. P4 good, with a question about being snappy.
- P8 two helps turned into questions ("Did you call your sister today?"); the code's help guard does not catch
  "Things that help me:" followed by a list, because the help word sits only in the heading clause.
- P10 bed until noon and walking right; the gym ("sportschool") missed.

**v9, final** (on g-structure):
- P1: `rest_midpoint:later`; "no gym" still a question instead of a gym rule.
- P2: late nights right; the corner shop became a place rule (wrong: the person still goes there), `home_stay` and
  `rhythm_stability` are reasonable; questions about lectures and going quiet; both helps as actions.
- P3: all three expected rules plus `steps:lower` (not named); no shower question.
- P4: pottery class and sofa right, help as action, no extra rules. Good.
- P5: bed late right; "werk" became `places_visited`; extra `routine_regularity`; meals missed.
- P6: hermit and gaming till 4am right; extra `places_visited`; group chat missed; football is an action. Good.
- P7: denied sleep and work skipped; climbing wall right; "don't see friends" became `places_visited`, emails missed.
- P8: only actions, nothing invented. Good.
- P9: one feelings question, but also a wrong `rest_midpoint:later`.
- P10: bed until noon → `home_stay`; the gym became a question; walking missed.
Overall the final prompt handles helps, denied signs and "only helps" texts well; the remaining errors are the
same as on the tuning set: `places_visited` for anything near a place or a person, and named places written
without "going to" ("no gym") turned into questions.
