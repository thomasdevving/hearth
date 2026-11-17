# Jury demo: script and voice-over (2:53)

Draft video: `video/demo/hearth-jury-draft.mp4` (1920×1080). The small timecode in the top
right corner of every frame matches the times below, so you can line up your webcam clips and
voice-over in any editor (CapCut, iMovie, Premiere, DaVinci).

- **WEBCAM** = a placeholder. Put your own clip on top of it.
- **VO** = voice-over over the screen. About 2.5 words per second is a calm pace; the lines
  below fit their slots at that pace.
- The time limit is 3:00. The draft is 2:53, so keep your clips inside their placeholders.

## How it maps to the recipe

| # | Recipe point | Where |
|---|---|---|
| 1 | Recognisable problem, ≤ 30 s | 0:00–0:30 webcam hook + "Today" slide |
| 2 | One sentence, repeated at the end | 0:30 and 2:42 (same sentence) |
| 3 | A real, live demo with visible effect | 0:38–1:31, the real web app |
| 4 | The agent catches or verifies a mistake, and you say so | 0:46–0:50 "Caught and checked" (quote check), plus the holiday confirmation |
| 5 | Sponsor models by name, each with a role, architecture slide | 2:02–2:17 |
| 6 | Human control, safety, privacy | 2:17–2:29 (and in the demo at 0:50 and 1:02) |
| 7 | Hard numbers | 2:29–2:42 |
| 8 | Tagline, sponsor, GitHub, QR (to the website), under the limit | 2:42–2:53 |

The tech and theory sit between the demo and the architecture: what Hearth watches
(1:31–1:46) and what counts as a drift (1:46–2:02).

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

### 0:38–1:31 · LIVE DEMO (screen recording, optional small WEBCAM bottom left)
| Time | On screen | VO |
|---|---|---|
| 0:38 | Sam types the plan | "This is Sam. Sam writes down, in their own words, what happens when things start to slip, and what helps." |
| 0:45 | Cards appear | "Gemini Nano, running inside Chrome, turns that into a plan: signs to watch, questions, and what helps." |
| 0:46 | **Caught and checked** | "And here the model made something up: a dog Sam never mentioned. Hearth checks every quote against Sam's own text in code, so it's left out, and Sam is told." |
| 0:50 | Sam reviews and saves | "Sam stays in control: untick anything that's wrong, then save." |
| 0:57 | Day 61, note | "Now we fast-forward through Sam's simulated sensor data. Day 61: 'I'm in Spain this week.'" |
| 1:02 | One quick check | "Hearth asks once, and only after Sam says yes is the holiday set aside." |
| 1:06 | Day 109 | "Day 109. Sam's days have been drifting for six days." |
| 1:09 | Changed + Why? | "Hearth notices: later sleep, a higher resting heart rate. The engine computes that, not the language model." |
| 1:15 | Check-in | "A twenty-second check-in; Nano writes the opening line." |
| 1:21 | Sam's plan | "Sam's own plan opens." |
| 1:26 | Privacy ledger | "And every model call ran on the device." |

### 1:31–1:46 · What Hearth watches, and why
Seven groups of signals, each with the change that counts (arrows) and the research behind it.

> VO: "Hearth watches what research links to harder periods: sleep, activity, daily rhythm,
> heart rate, places, and your check-ins. Each counts only in the direction that matters,
> and only against your own usual days."

### 1:46–2:02 · What counts as a drift, and how Hearth helps
The chart is Sam's real index from the engine. Day 107 spikes but the trend stays inside
Sam's usual range; on day 109 the trend crosses.

> VO: "What counts as a drift? Not one bad day: on day 107, nothing happened. Only when the
> trend leaves Sam's usual range. Then Hearth helps: a short check-in, Sam's own plan, a
> questionnaire if it lasts, and support if Sam wants it."

### 2:02–2:17 · Architecture
> VO: "Under the hood it's hybrid, through Firebase AI Logic. The engine computes every score
> in plain code. Gemini Nano runs on the device for everything personal. Gemini 3.5 Flash in
> the cloud only writes weekly reflections from numbers, after you opt in."

### 2:17–2:29 · Control, safety and privacy
> VO: "You confirm every card and every context. The cloud is off until you say yes. Your
> words never leave the device, and the 988 screen works offline."

### 2:29–2:42 · Numbers
> VO: "On fifty simulated people, Hearth noticed a drift after a median of seven days, with
> about one false-alarm day per hundred. With the cloud off, nothing left the browser."

Fill in the amber card before recording: run `#/eval_g` in Chrome with Gemini Nano and use
the precision it shows (and say it, for example: "Gemini Nano read the plans with __ percent
precision").

### 2:42–2:53 · Close (optional small WEBCAM)
> VO / WEBCAM: "When your days drift, Hearth notices. Built with Firebase AI Logic and
> Gemini. Scan the code to try it yourself."

The QR code opens https://hearth-ecru-sigma.vercel.app; the GitHub link is shown under it.
The Science page is linked on screen at 1:31–2:02.

## Before you submit

1. **Re-record the live demo with the real Gemini Nano.** The draft uses a stand-in model
   (marked "DRAFT" on screen), because Gemini Nano cannot run in the build container. Two ways:
   - **Screen-record it yourself** in Chrome with the on-device model enabled, following the
     same steps: Plan setup → type Sam's words → Make cards → Save → Use scripted answer →
     Start → Jump to: Holiday → Use scripted note → confirm → Yes → Jump to: First change →
     Today → Why? → open the check-in → answer → Save → Plan tab → Privacy tab.
     Then put your recording over 0:38–1:31 (the phone frame), or use it full screen.
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
