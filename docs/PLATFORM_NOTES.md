# Platform notes

Facts the build depends on. **Status** is one of: `verified` (seen in a primary source on
the date given), `reported` (secondary source), `must check` (confirm in milestone M0 and
update this file). When the platform differs from a spec, the platform wins; change only
the adapter layer.

## 1. What you need

| Need | Why |
|---|---|
| A Mac with a current Xcode | Required to build any iOS app. Without one, ship the web app only. |
| An iPhone that supports Apple Intelligence, with it switched on | The on-device model on iOS. An app cannot enable it or trigger the model download. |
| Apple developer account | A free account can run the app on your own phone. TestFlight needs the paid programme. |
| Chrome desktop with the built-in model available | The on-device model on web. |
| A Firebase project | AI Logic, Firestore, Auth, App Check, Remote Config, Hosting. |

## 2. Firebase AI Logic

| Fact | Status | Source / note |
|---|---|---|
| Hackathon platforms: Web (Chrome) or Android with Gemini Nano, or iOS with Apple Foundation Models, all through Firebase AI Logic | reported, 2026-11-16 | Devpost page via search |
| App Check is required; debug tokens are accepted in submissions | reported, 2026-11-16 | Devpost page via search |
| Hybrid inference is an experimental feature on all platforms | reported | Firebase docs via search |
| **iOS:** Firebase Apple SDK 13.0.0 (7 Oct 2026) removed `GenerativeModelSession`, `SystemLanguageModel` and `HybridModel`. Gemini is now used through `ai.geminiLanguageModel(name:)` with Apple's Foundation Models framework | reported | Firebase Apple SDK release notes via search. **Older tutorials and the 12.x hybrid guide no longer compile.** |
| iOS: how on-device and cloud are combined in SDK 13 (is there a built-in fallback, or does the app choose the model per call?) | **must check** | If there is no built-in mode, `InferenceRouter` picks the model itself from `RouteDecision`; the logical modes in `docs/05` still apply. |
| iOS: structured output through `@Generable` / `@Guide` works with both the Apple model and `geminiLanguageModel` | **must check** | Reported for 12.x |
| iOS: minimum OS version for Foundation Models with a third-party model | **must check** | Sources disagree (iOS 26 vs 27) |
| iOS: image input to the on-device model | **must check** | Not needed: task G2 uses Vision text recognition on iOS |
| Web: SDK import path, the inference mode enum and its four values | **must check** | Expected: `firebase/ai`, modes equivalent to prefer/only on-device and prefer/only in cloud |
| Web: structured output (JSON schema, enums) on-device | reported | Listed as supported |
| Web: on-device request limit about 9 000 tokens; single turn; text and images in | reported | From the concept document's reading of the docs |
| Web: how to read which model answered a request | **must check** | Needed for the ledger. If unavailable, log from the mode: `ONLY_*` modes are certain; for `PREFER_*`, check on-device availability immediately before the call. |
| Web: minimum Chrome version and any flags a judge must set | **must check** | Put the answer in the in-app banner and the README |
| On-device calls do not appear in Firebase AI monitoring | reported | Reason the app keeps its own ledger |

## 3. iOS sensors

| Fact | Status | Note |
|---|---|---|
| HealthKit keeps step history from the iPhone itself; statistics queries can return 15-minute bins for past months | **must check on device** | Basis of the day-1 backfill |
| HealthKit `walkingSpeed` is recorded by the iPhone when carried | **must check on device** | |
| HealthKit `sleepAnalysis` is usually present only with an Apple Watch or a sleep app | expected | Hence the step-based rest window |
| Background delivery via `HKObserverQuery` + `enableBackgroundDelivery` | **must check** | Needs the HealthKit background delivery entitlement |
| `CLVisit` monitoring delivers visits in the background with "Always" permission; no history before install | expected | P1 |
| HealthKit can store a PHQ-9 result and a state-of-mind sample (iOS 18+) | reported | WWDC24 "Explore wellbeing APIs in HealthKit". P1 |
| On-device speech recognition | **must check** | Require on-device recognition; if unavailable, hide the microphone |

## 4. Communication and phone use on iOS

- iOS has **no API** for call history, message history or per-app usage numbers readable
  by the app. Counting outgoing messages is not possible.
- The Screen Time API (`FamilyControls` with *individual* authorisation, `DeviceActivity`)
  lets a monitor extension receive a callback when usage of chosen apps or categories
  passes a threshold. By registering several thresholds per day (`cfg.phone.thresholds`)
  for (a) all apps, (b) all apps between 00:00 and 05:00, and (c) the apps the user picks
  as "messaging", and writing each callback to the shared App Group, the app obtains
  coarse daily buckets for `screen_time`, `night_use` and `communication_time`.
- Status: **reported, P2.** Needs the Family Controls entitlement (check whether the
  development entitlement is available on your account), a monitor extension, and a
  physical device. Developer forum posts report threshold callbacks firing early on some
  recent iOS versions; test before relying on it. Keep it behind `cfg.phone.enabled`.
- The dependable version of this signal is the personal check-in item
  ("Did you reply to messages today?").

For reference, on Android the direct route is also closed for store apps: Google Play
allows the call-log and SMS permissions only for the default phone, SMS or assistant app,
and forbids deriving that data another way.

## 5. Decisions already taken

| Decision | Reason |
|---|---|
| iOS + web, no Android | No Android device to develop or test on. Each platform has its own prize; web is what judges can open. |
| Engine in TypeScript, run on iOS through JavaScriptCore | One implementation, testable without a Mac. |
| Anonymous Auth | No account data to protect or leak. |
| Sensor data in the web app is simulated | A browser has no access to it, and judges need weeks of history in minutes. |
