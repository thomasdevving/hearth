# Jury demo: script and voice-over (2:41)

Draft video: `video/demo/hearth-jury-draft.mp4` (1920×1080). The small timecode in the top
right corner of every frame matches the times below, so you can line up your webcam clips and
voice-over in any editor (CapCut, iMovie, Premiere, DaVinci).

- **WEBCAM** = a placeholder. Put your own clip on top of it.
- **VO** = voice-over over the screen. About 2.5 words per second is a calm pace; the lines
  below fit their slots at that pace.
- The time limit is 3:00. The draft is 2:41, so you have about 15 seconds of slack.

## How it maps to the recipe

| # | Recipe point | Where |
|---|---|---|
| 1 | Recognisable problem, ≤ 30 s | 0:00–0:30 webcam hook + "Today" slide |
| 2 | One sentence, repeated at the end | 0:30 and 2:29 (same sentence) |
| 3 | A real, live demo with visible effect | 0:38–1:39, the real web app |
| 4 | The agent catches or verifies a mistake, and you say so | 0:46–0:50 "Caught and checked" (quote check), plus the holiday confirmation |
| 5 | Sponsor models by name, each with a role, architecture slide | 1:39–1:59 |
| 6 | Human control, safety, privacy | 1:59–2:14 (and in the demo at 0:50 and 1:03) |
| 7 | Hard numbers | 2:14–2:29 |
| 8 | Tagline, sponsor, GitHub, QR (to the website), under the limit | 2:29–2:41 |

## Script

### 0:00–0:22 · WEBCAM (full screen): the hook
Your own words, to camera. A suggestion to adapt:

> "Someone close to me went through depression twice. Both times, the signs were there
> weeks before anyone said something: going to bed later, skipping the gym, staying in.
> They had even written those signs down with their therapist. But a plan on paper doesn't
> notice anything."

(Use your own story if you have one. Keep it under 22 seconds.)

### 0:22–0:30 · Slide "Today"
> VO: "Today, a relapse-prevention plan sits in a drawer, and appointments are weeks apart.
> In between, the drift goes unnoticed."

### 0:30–0:38 · Slide: the one sentence
> VO: "Hearth notices when your days drift from your usual pattern, and reminds you what
> helps, in your own words, on your own device."

### 0:38–1:39 · LIVE DEMO (screen recording, optional small WEBCAM bottom left)
| Time | On screen | VO |
|---|---|---|
| 0:38 | Sam types the plan | "This is Sam. Sam writes down, in their own words, what happens when things start to slip, and what helps." |
| 0:45 | Cards appear | "Gemini Nano, running inside Chrome, turns that into a plan: signs to watch, questions, and what helps." |
| 0:46 | **Caught and checked** | "And here the model made something up: a dog Sam never mentioned. Hearth checks every quote against Sam's own text in code, so it's left out, and Sam is told." |
| 0:50 | Sam reviews and saves | "Sam stays in control: untick anything that's wrong, then save." |
| 0:57 | PHQ-9 | "A starting point with the validated questionnaire, word for word. No model touches it." |
| 0:59 | Day 61, note | "Now we fast-forward through Sam's simulated sensor data. Day 61: 'I'm in Spain this week.'" |
| 1:03 | One quick check | "Hearth doesn't assume. It asks once, and only after Sam says yes is the holiday set aside, so a trip doesn't look like a crisis." |
| 1:07 | Day 109 | "Day 109. Sam's days have been drifting for six days." |
| 1:10 | Changed + Why? | "Hearth notices: later sleep, a higher resting heart rate. The engine computes that, not the language model." |
| 1:17 | Check-in | "A twenty-second check-in. Nano writes the opening line; code checks every number in it." |
| 1:25 | Sam's plan | "And Sam's own plan opens, with what Sam said helps." |
| 1:32 | Privacy ledger | "Every model call is in this ledger. All of them ran on the device. Nothing Sam wrote left the browser." |

### 1:39–1:59 · Architecture
> VO: "Hearth is hybrid by design, through Firebase AI Logic. The engine computes every score
> and threshold in plain code. Gemini Nano runs on the device for anything personal: the plan,
> notes, check-ins. Gemini 3.5 Flash in the cloud only writes a weekly reflection and a report
> for your doctor, from weekly numbers, and only after you opt in. Firebase handles anonymous
> sign-in, sync and remote configuration."

### 1:59–2:14 · Control, safety and privacy
> VO: "You stay in control: you confirm every card and every context, and the cloud is off
> until you say yes. Your words never leave the device, every call is logged, the
> questionnaires are never rewritten, and the 988 support screen works offline."

### 2:14–2:29 · Numbers
> VO: "On fifty simulated people, Hearth noticed a drift after a median of seven days,
> with about one false-alarm day per hundred. Confirming a holiday removed all ninety-two
> holiday alarms. With the cloud off, zero requests left the browser, and on-device calls
> cost nothing."

Fill in the amber card before recording: run `#/eval_g` in Chrome with Gemini Nano and use
the precision it shows (and say it, for example: "Gemini Nano read the plans with __ percent
precision").

### 2:29–2:41 · Close (optional small WEBCAM)
> VO / WEBCAM: "When your days drift, Hearth notices. Built with Firebase AI Logic and
> Gemini. Scan the code to try it yourself."

The QR code opens https://hearth-ecru-sigma.vercel.app; the GitHub link is shown under it.

## Before you submit

1. **Re-record the live demo with the real Gemini Nano.** The draft uses a stand-in model
   (marked "DRAFT" on screen), because Gemini Nano cannot run in the build container. Two ways:
   - **Screen-record it yourself** in Chrome with the on-device model enabled, following the
     same steps: Plan setup → type Sam's words → Make cards → Save → Use scripted answer →
     Start → Jump to: Holiday → Use scripted note → confirm → Yes → Jump to: First change →
     Today → Why? → open the check-in → answer → Save → Plan tab → Privacy tab.
     Then put your recording over 0:38–1:39 (the phone frame), or use it full screen.
   - **Or let the script drive your Chrome:**
     `CHROME_PROFILE=<a Chrome profile folder where Gemini Nano is downloaded> node video/demo/capture.cjs`
     with the app on `http://localhost:4173`, then `node video/demo/build.cjs`. Not tested
     here (no Chrome with Gemini Nano in the build container).
   - **If the real model does not invent anything**, the "Caught and checked" moment won't
     happen by itself. Then either say what the check does without showing it, or show the
     holiday confirmation as the verification moment. Do not present the stand-in's
     invented sign as Gemini Nano's.
2. Fill in the amber number card (`#/eval_g`).
3. Check the length after adding your clips: under 3:00.
