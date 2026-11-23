# Jury demo: script and voice-over (2:59)

Draft video: `video/demo/hearth-jury-draft.mp4` (1920×1080). The small timecode in the top
right corner of every frame matches the times below, so you can line up your webcam clips and
voice-over in any editor (CapCut, iMovie, Premiere, DaVinci).

- **WEBCAM** = a placeholder. Put your own clip on top of it.
- **VO** = voice-over over the screen. About 2.5 words per second is a calm pace; every line
  below fits its slot at that pace.
- The live demo plays at real speed (1×): nothing is sped up. Only waiting time at the cuts
  is left out, and the time machine skips the simulated days.
- The time limit is 3:00. The draft is 2:59, so keep your clips inside their placeholders.

## How it maps to the recipe

| # | Recipe point | Where |
|---|---|---|
| 1 | Recognisable problem, ≤ 30 s | 0:00–0:24 webcam hook + "Today" slide |
| 2 | One sentence, repeated at the end | 0:24 and 2:51 (same sentence) |
| 3 | A real, live demo with visible effect | 0:31–2:01, the real web app at 1× |
| 4 | The agent catches or verifies a mistake, and you say so | 0:45–0:51 "Caught and checked" (quote check); 1:32 recall with a checked quote and Sam's confirmation |
| 5 | Sponsor models by name, each with a role, architecture slide | 2:23–2:34 |
| 6 | Human control, safety, privacy | 2:34–2:42 (and in the demo at 0:51, 1:00, 1:45, 1:50 and 1:58) |
| 7 | Hard numbers | 2:42–2:51 |
| 8 | Tagline, sponsor, GitHub, QR (to the website), under the limit | 2:51–2:59 |

The tech and theory sit between the demo and the architecture: what Hearth watches
(2:01–2:11) and what counts as a drift (2:11–2:23).

## Script

### 0:00–0:16 · WEBCAM (full screen): the hook
Your own words, to camera. A suggestion to adapt (38 words, about 15 seconds):

> "Someone close to me went through depression twice. Both times the signs were there weeks
> early: later nights, skipping the gym, staying in. They'd even written them down with their
> therapist. But a plan on paper doesn't notice anything."

(Use your own story if you have one. Keep it under 16 seconds.)

### 0:16–0:24 · Slide "Today"
> VO: "Today, a relapse-prevention plan sits in a drawer, and appointments are weeks apart.
> In between, the drift goes unnoticed."

### 0:24–0:31 · Slide: the one sentence
> VO: "Hearth notices when your days drift, and reminds you what helps, in your own words."

### 0:31–2:01 · LIVE DEMO (screen recording at 1×, optional small WEBCAM bottom left)
| Time | On screen | VO |
|---|---|---|
| 0:31 | Sam types the plan | "This is Sam. Hearth already watches research-based signals for everyone. Sam adds the early signs Sam knows, in their own words." |
| 0:41 | Cards appear | "Gemini Nano, running inside Chrome, turns that into a plan." |
| 0:45 | **Caught and checked** | "The model invented a sign Sam never mentioned. Hearth checks every quote and drops it." |
| 0:51 | Sam reviews and saves | "Sam stays in control: untick anything that's wrong." |
| 0:56 | Day 61, note | "Day 61. Sam writes: 'I'm in Spain this week.'" |
| 1:00 | One quick check | "Hearth asks once; only after a yes is the holiday set aside." |
| 1:05 | Day 109, Changed | "Day 109. Later sleep, a higher resting heart rate. The engine computes that, not the model." |
| 1:13 | **Why?** | "Why? shows each signal against Sam's own usual days: one bad day doesn't count, the trend does." |
| 1:18 | Check-in | "A twenty-second check-in: three taps for how Sam feels, Sam's own questions, and one line in Sam's own words: 'I've started avoiding people again.'" |
| 1:32 | **Recalled by meaning** | "Gemini Nano, on the device, recognises one of Sam's own signs: 'stop replying to messages'. Sam confirms." |
| 1:39 | What helped last time | "And Hearth brings back what helped last time, in Sam's own words." |
| 1:45 | Draft that text | "Nano drafts the text. Sam decides whether to send it; Hearth never does." |
| 1:50 | Call a friend | "On a hard day, one tap calls Sam's sister or texts Maya. Hearth itself never contacts anyone." |
| 1:58 | Privacy ledger | "Every call ran on the device." |

### 2:01–2:11 · What Hearth watches, and why
> VO: "Hearth watches what research links to harder periods: sleep, activity, rhythm, heart
> rate and places, each only against your own usual days."

### 2:11–2:23 · What counts as a drift, and how Hearth helps
The chart is Sam's real index from the engine. Day 107 spikes but the trend stays inside
Sam's usual range; on day 109 the trend crosses.

> VO: "Not one bad day: day 107 alone changed nothing. Only when the trend leaves Sam's range
> comes a check-in, Sam's plan, and a questionnaire if it lasts."

### 2:23–2:34 · Architecture
> VO: "Hybrid through Firebase AI Logic. Code computes every score. Gemini Nano handles your
> words on the device; cloud Gemini sees only weekly numbers, after you opt in."

### 2:34–2:42 · Control, safety and privacy
> VO: "You confirm every card. The cloud stays off until you say yes, and the 988 screen
> works offline."

### 2:42–2:51 · Numbers
> VO: "On fifty simulated people: drift noticed in a median of seven days, one false-alarm
> day per hundred, nothing left the browser."

Fill in the amber card before recording: run `#/eval_g` in Chrome with Gemini Nano and use
the precision it shows.

### 2:51–2:59 · Close (optional small WEBCAM)
> VO / WEBCAM: "When your days drift, Hearth notices. Built with Firebase AI Logic and Gemini.
> Scan to try it."

The QR code opens https://hearth-9de01.web.app; the GitHub link is shown under it.

## Before you submit

1. **Re-record the live demo with the real Gemini Nano.** The draft uses a stand-in model
   (marked "DRAFT" on screen), because Gemini Nano cannot run in the build container. Two ways:
   - **Screen-record it yourself** in Chrome with the on-device model enabled, following the
     same steps: Plan setup → type Sam's words → Make cards → Save → Use scripted answer →
     Start → Jump to: Holiday → Use scripted note → confirm → Yes → Jump to: First change →
     Today → Why? → tap the first reason (the Why? screen) → Today → open the check-in → answer, type "Yeah, I've started avoiding people again.
     Haven't answered anyone in days." → Save → Yes, that's it → Draft that text → Today tab (scroll to "Call a friend") → Privacy tab.
     Then put your recording over 0:31–2:01 (the phone frame), or use it full screen.
   - **Or let the script drive your Chrome (recommended):** the video layout reads the
     timing marks from the recording, so a new recording drops straight in.
     1. In Chrome, check that `chrome://on-device-internals` shows the model as ready.
     2. Close Chrome completely (the profile can only be open once).
     3. Run the app: `npm run build -w apps/web && npx vite preview --port 4173` (in `apps/web`).
     4. `CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome" node video/demo/capture.cjs`
        (Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`; Linux: `~/.config/google-chrome`).
     5. `python3 -m http.server 8090 --bind 127.0.0.1` from the repo root, then `node video/demo/build.cjs`.
     If Playwright's own Chromium is not installed, add `PW_CHANNEL=chrome` to both commands to use
     the installed Google Chrome.
     The "DRAFT: stand-in model" label disappears by itself for a recording made this way.
     Not tested here: Gemini Nano does not run in the build container.
   - **The recall and the draft text** in the draft video also come from the stand-in model.
     With Gemini Nano, check that it recognises "avoiding people again" as Sam's sign. If it
     doesn't, the app shows Sam's signs as buttons instead; tap "stop replying to messages".
   - **If the real model does not invent anything**, the "Caught and checked" moment won't
     happen by itself. Then either say what the check does without showing it, or show the
     holiday confirmation as the verification moment. Do not present the stand-in's
     invented sign as Gemini Nano's.
2. Fill in the amber number card (`#/eval_g`).
3. Check the length after adding your clips: under 3:00.
