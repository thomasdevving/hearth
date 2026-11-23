# Jury demo: script and voice-over (2:58)

Draft video: `video/demo/hearth-jury-draft.mp4` (1920×1080). The small timecode in the top
right corner of every frame matches the times below, so you can line up your webcam clips and
voice-over in any editor (CapCut, iMovie, Premiere, DaVinci).

- **WEBCAM** = a placeholder. Put your own clip on top of it.
- **VO** = voice-over over the screen. About 2.5 words per second is a calm pace; every line
  below fits its slot at that pace.
- The live demo plays at real speed (1×): nothing is sped up. Only waiting time at the cuts
  is left out, and the time machine skips the simulated days.
- The time limit is 3:00. The draft is 2:58, so keep your clips inside their placeholders.

## How it maps to the recipe

| # | Recipe point | Where |
|---|---|---|
| 1 | Recognisable problem, ≤ 30 s | 0:00–0:24 webcam hook + "Today" slide |
| 2 | One sentence, repeated at the end | 0:24 and 2:50 (same sentence) |
| 3 | A real, live demo with visible effect | 0:30–1:58, the real web app at 1×; then the GP page, 1:58–2:08 |
| 4 | The agent catches or verifies a mistake, and you say so | 0:44–0:49 "Caught and checked" (quote check); 1:30 recall with a checked quote and Sam's confirmation |
| 5 | Sponsor models by name, each with a role, architecture slide | 2:26–2:35 |
| 6 | Human control, safety, privacy | 2:35–2:42 (and in the demo at 0:49, 0:58, 1:43, 1:48 and 1:54) |
| 7 | Hard numbers | 2:42–2:50 |
| 8 | Tagline, sponsor, GitHub, QR (to the website), under the limit | 2:50–2:58 |

After the demo: the GP page (1:58–2:08). The tech and theory sit between that and the
architecture: what Hearth watches (2:08–2:16) and what counts as a drift (2:16–2:26).

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

### 0:24–0:30 · Slide: the one sentence
> VO: "Hearth notices when your days drift, and reminds you what helps, in your own words."

### 0:30–1:58 · LIVE DEMO (screen recording at 1×, optional small WEBCAM bottom left)
| Time | On screen | VO |
|---|---|---|
| 0:30 | Sam types the plan | "This is Sam. Hearth already watches research-based signals for everyone. Sam adds the early signs Sam knows, in their own words." |
| 0:40 | Cards appear | "Gemini Nano, running inside Chrome, turns that into a plan." |
| 0:44 | **Caught and checked** | "The model invented a sign Sam never mentioned. Hearth checks every quote and drops it." |
| 0:49 | Sam reviews and saves | "Sam stays in control: untick anything that's wrong." |
| 0:54 | Day 61, note | "Day 61. Sam writes: 'I'm in Spain this week.'" |
| 0:58 | One quick check | "Hearth asks once; only after a yes is the holiday set aside." |
| 1:03 | Day 109, Changed | "Day 109. Later sleep, a higher resting heart rate. The engine computes that, not the model." |
| 1:11 | **Why?** | "Why? shows each signal against Sam's own usual days: one bad day doesn't count, the trend does." |
| 1:16 | Check-in | "A twenty-second check-in: three taps for how Sam feels, Sam's own questions, and one line in Sam's own words: 'I've started avoiding people again.'" |
| 1:30 | **Recalled by meaning** | "Gemini Nano, on the device, recognises one of Sam's own signs: 'stop replying to messages'. Sam confirms." |
| 1:37 | What helped last time | "And Hearth brings back what helped last time, in Sam's own words." |
| 1:43 | Draft that text | "Nano drafts the text. Sam decides whether to send it; Hearth never does." |
| 1:48 | Call a friend | "On a hard day, one tap calls Sam's sister or texts Maya." |
| 1:54 | Privacy ledger | "Every call ran on the device." |

### 1:58–2:08 · For the GP: the plan on one page
The A4 page from the app, with its parts marked one by one: the header (kept and shared by
Sam), current status, the plan by phase (stable, early signs, crisis), the crisis row, the
questionnaires, and the FHIR R4 copy.

> VO: "For Sam's GP: the plan on one page, each sign in Sam's own words, and a FHIR copy for
> the practice, made on the device."

### 2:08–2:16 · What Hearth watches, and why
> VO: "Hearth watches what research links to harder periods, each only against your own
> usual days."

### 2:16–2:26 · What counts as a drift, and how Hearth helps
The chart is Sam's real index from the engine. Day 107 spikes but the trend stays inside
Sam's usual range; on day 109 the trend crosses.

> VO: "Not one bad day: day 107 changed nothing. Only when the trend leaves Sam's range
> does Hearth step in."

### 2:26–2:35 · Architecture
> VO: "Hybrid through Firebase AI Logic. Code computes every score. Gemini Nano handles your
> words on the device; cloud Gemini sees only weekly numbers, after you opt in."

### 2:35–2:42 · Control, safety and privacy
> VO: "You confirm every card. The cloud stays off until you say yes, and the 988 screen
> works offline."

### 2:42–2:50 · Numbers
> VO: "On fifty simulated people: drift noticed in a median of seven days, one false-alarm
> day per hundred, nothing left the browser."

Fill in the amber card before recording: run `#/eval_g` in Chrome with Gemini Nano and use
the precision it shows.

### 2:50–2:58 · Close (optional small WEBCAM)
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
     Then put your recording over 0:30–1:58 (the phone frame), or use it full screen.
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
