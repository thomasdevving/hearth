# Hearth

**When your days drift, Hearth notices.**
A hybrid, privacy-first early-warning app for people who have had depression. Built for
#BuildHybridAI 2026 with Firebase AI Logic.

**Try it:** https://hearth-9de01.web.app · Chrome on a computer, no install, no account.

Hearth learns your usual days from your phone and watch: sleep, steps, daily rhythm, heart
rate and the places you go. When they drift from *your own* pattern for a few days, it checks
in gently and brings back the plan you wrote yourself, in your own words. The model that reads
your words runs on your device. The cloud only sees weekly numbers, and only if you allow it.

Hearth is a wellbeing and self-insight tool. It is not a medical device and never gives a
diagnosis or treatment advice.

## The problem

Depression affects an estimated 332 million people worldwide
([WHO, 2025](https://www.who.int/news-room/fact-sheets/detail/depression)), and for many it
comes back. Clinicians help people write a relapse-prevention plan: the early signs they
know from experience and what helps them. The plan works when someone notices those signs in
time, which is exactly when it is hardest to notice them.

Hearth watches for those signs quietly, compares you only with yourself, and opens your own
plan at the moment it matters. Because the data is this personal, it has to work without
sending your words anywhere.

## How it works

1. **Your plan, in your own words.** Write what you or people close to you notice first ("I go
   to bed later, I skip the gym, calling my sister helps"). Gemini Nano on your device turns it
   into plan cards, each with the exact quote it came from. Anything you did not write is
   removed in code.
2. **It learns your usual days.** For about two weeks Hearth only learns. After that each day
   is compared with your own usual range, never with anyone else. The signs you named weigh more,
   and over time Hearth learns from your answers to random check-ins which kind of signal goes
   with your low days, and weighs that more for you (still linear, so "Why?" explains every alert).
3. **A change gets a gentle check-in.** When your days stay outside your range for a few days,
   Hearth asks how you are (three taps and your own questions), shows *why* it asked, and opens
   your plan with what fits today on top. A holiday you confirm is set aside, not counted.
4. **Help, your people and your GP.** "What helped last time" comes back by meaning, on the
   device. Your people are one tap away. Your plan prints on one page for your GP, or exports
   as FHIR. "I need help now" works offline.

## How it uses Firebase AI Logic hybrid inference

Every model call goes through one router, and the route depends on how personal the data is,
not on which task it is:

| Data | Examples | Firebase AI Logic mode |
|---|---|---|
| **S3**: your own words and places | plan text, notes, check-in text, speech, a photo of a paper plan | `ONLY_ON_DEVICE` (Gemini Nano). No model? A plain fallback in code. Never the cloud. |
| **S2**: single numbers about you | a check-in's reasons, a questionnaire total | `ONLY_ON_DEVICE`, or `PREFER_ON_DEVICE` with consent; `ONLY_IN_CLOUD` only with consent and no on-device model |
| **S1**: weekly summaries you approved | weekly reflection, clinician overview | With consent: `PREFER_IN_CLOUD` / `ONLY_IN_CLOUD` (Gemini), after a preview of the exact JSON; offline, a short version on the device. Without consent: a plain summary in code. |

Where to see it in the code:

- `apps/web/src/inference/webRouter.ts`: `getAI`, `getGenerativeModel` and all four
  `InferenceMode`s from `firebase/ai`, with structured output per task.
- `packages/engine/src/routing.ts`: the routing table above, in one place.
- `apps/web/src/inference/availability.ts`: Gemini Nano availability and download.
- `apps/web/src/cloud/client.ts`: App Check (reCAPTCHA Enterprise), anonymous Auth, Firestore
  for weekly summaries and Remote Config.

The model never decides on its own. Every output is validated against a JSON schema, every
quote is checked against the user's own words, and every number (scores, thresholds, the
moment to ask) comes from the deterministic engine in `packages/engine`. The privacy ledger
in the app lists every model call: the task, where it ran and, for the cloud, the exact
payload. A strict Content-Security-Policy only lets the page reach the listed Firebase
services, and "Test it" on the Privacy screen shows another website being refused.

## Testing it (for judges)

**Fastest: the hosted demo.** Open https://hearth-9de01.web.app in Chrome on a computer and
choose "Try the demo". You follow Sam, a made-up person, through 150 days:

1. Start with Hearth → Set up my plan → "use Sam's words" → **Turn into my plan**.
2. Answer the starting questionnaire with "Demo: Sam's answers", then **Start**.
3. In the dark demo bar at the bottom: **Jump to… → Holiday**, send Sam's note and confirm the
   holiday. Then **Jump to… → First change**.
4. On Today, tap **Why?**, then the check-in. Afterwards, look at **Plan** and **Privacy**
   (the ledger and "Test it").

**To use Gemini Nano on your machine** (Chrome desktop 139+): set
`chrome://flags/#optimization-guide-on-device-model` to "Enabled BypassPerfRequirement" and
`chrome://flags/#prompt-api-for-gemini-nano` to "Enabled", restart Chrome, then Settings →
"Download on-device model". Without it, every private task uses its plain fallback and the
app stays fully usable.

**Run it locally** (Node 22, npm 10):

```bash
npm install
```
```bash
npm run dev -w apps/web
```

Open http://localhost:5173. Without a Firebase project the app runs entirely on the device.
For the cloud part, fill `apps/web/.env.local` from `apps/web/.env.example`
(`docs/FIREBASE_SETUP.md`); an App Check debug token can be set there.

```bash
npm test
```
```bash
npm run build
```

`npm run test:rules` tests the Firestore rules on the emulator, and `npm run eval` runs the
evaluation scripts.

## What is simulated and what is real

| Simulated | Real |
|---|---|
| Sam's sensor data for 150 days, from a seeded generator (`docs/08_DEMO_REPLAY.md`) | The detection engine, check-ins, questionnaires and the safety flow |
| Sam's scripted answers, offered as dashed "Demo:" buttons | Every model call (Gemini Nano on the device, Gemini in the cloud) and its ledger entry |
| | Weekly uploads to Firestore, share links and the clinician report |

## Results so far

From `docs/10_EVALUATION.md`, on simulated people; every number is reported, including the
ones that missed their target:

- **0** requests left the browser with the cloud off, over a full 150-day run.
- **7 days** median to notice the gradual change (range 3–8; slow version 12), none missed.
- **1.0** false "changed" days per 100 on 50 stable people.
- **0 vs 92** holiday alarm days with and without confirming the holiday, across 20 people.
- **Personal weights:** for a simulated person whose mood follows activity, Hearth learned that
  in 9 of 20 cases before their decline and saw the decline earlier in 7 (later in 1); on 50
  stable people the false alarm rate stayed exactly the same.
- **Unanswered check-ins:** when a simulated person stops answering most check-ins, Hearth
  offers two short questions after a median 9–13 days; for people who keep answering as usual,
  about one needless offer per 150–1400 days.
- **Gemini Nano, measured once in Chrome (28 Nov):** reading context from a note 29 of 30
  right; crisis sentences 20 of 20 flagged, but 7 of 30 everyday low-mood texts also got a
  "possible" flag (a support card, no takeover). Turning a written plan into cards is the weak
  spot: rule precision 42 %, below the 80 % target, because Nano proposes too many signals.
  Every card waits for the user's confirmation; the prompt still needs work for Nano. Scorer:
  Settings → "Test how Hearth reads a plan".

## Platforms

| Platform | Status |
|---|---|
| **Web (Chrome)**, submitted | The full product on a simulated person, hosted on Firebase Hosting. Gemini Nano through Firebase AI Logic, Gemini in the cloud with consent. |
| **iOS** | SwiftUI app on the user's own HealthKit data, running the same engine in JavaScriptCore. Apple's on-device model through Foundation Models, and Gemini through Firebase AI Logic (`geminiLanguageModel`) for consented cloud tasks. Built and tested in the iOS 27 Simulator; on-device and cloud runs on an iPhone are still to be checked. See `apps/ios` and its README. |

## Built during the submission period

Everything in this repository was built during the submission period; the first commit is
from 16 November 2026. It uses standard frameworks and libraries (React, Vite, Dexie, the
Firebase JS SDK) and AI coding assistants.

## Limitations

- The detection thresholds are untested on real relapses; the demo person is synthetic.
- Without a watch, rest is estimated from steps, which is a rough proxy for sleep.
- English only.
- The on-device model can misread a plan or a note. The quote check and the user's own
  confirmation catch invented entries, but not every missed one.
- Once a change is detected, the reference is frozen; a lasting harmless change can keep the
  state "changed" until it returns (`docs/DECISIONS.md`).
- Personal weights learn only from random check-ins, so they need weeks of answers and stay
  equal for many people; their effect is measured on simulated people only.
- Leaving check-ins unanswered as an early sign rests on one study, and Hearth's rule for it is
  tested on simulated answering only.

## Repository

| Path | What it is |
|---|---|
| `apps/web` | The web app (React, Vite, Dexie, Firebase JS SDK) |
| `packages/engine` | The deterministic engine (TypeScript, no I/O) with golden fixtures |
| `apps/ios` | The iOS app (SwiftUI, HealthKit, the engine in JavaScriptCore) |
| `shared/` | Schemas, prompts, questionnaires, safety data and config |
| `firebase/` | Firestore rules and their tests, Remote Config template |
| `eval/` | Evaluation sets, scripts and results |
| `docs/` | The specification (`01_PRODUCT` … `10_EVALUATION`), decisions and platform notes |
| `video/` | The demo video and the scripts that render it |

## License

Apache License 2.0. See [LICENSE](LICENSE).
