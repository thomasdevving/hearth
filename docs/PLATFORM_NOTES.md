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
| iOS: how on-device and cloud are combined in SDK 13 (is there a built-in fallback, or does the app choose the model per call?) | reported, 2026-11-17 | FirebaseAI CHANGELOG 13.0.0: `HybridModel` was removed, so there is **no built-in fallback**. Both models are used through Apple's `LanguageModelSession(model:)`: `SystemLanguageModel.default` on-device, `ai.geminiLanguageModel(name:)` in the cloud. The iOS `InferenceRouter` picks the model itself from `RouteDecision` (PREFER_* = try the first, catch, try the second). |
| iOS: structured output through `@Generable` / `@Guide` works with both the Apple model and `geminiLanguageModel` | reported, 2026-11-17 | CHANGELOG 13.0.0: guided generation on `GeminiLanguageModel` is sent as `responseJsonSchema`, so `@Generable` types work with both. Still validate the JSON in the engine (R8). Confirm on device in M9. |
| iOS: minimum OS version for Foundation Models with a third-party model | reported, 2026-11-17 | Firebase blog (June 2026) and the "Apple Foundation Models framework" get-started guide: the public `LanguageModel` protocol that third-party models plug into starts with **iOS 27 / Xcode 27**. Set the deployment target to iOS 27. |
| iOS: image input to the on-device model | not needed | Task G2 uses Vision text recognition on iOS. (CHANGELOG 13.2.0 added a `vision` capability for Gemini; irrelevant here.) |
| Web: SDK import path, the inference mode enum and its four values | verified, 2026-11-17 | `firebase@13.4.0` (`@firebase/ai@3.1.0`) type definitions: `import { getAI, getGenerativeModel, InferenceMode, InferenceSource } from "firebase/ai"`; `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })`; `InferenceMode.PREFER_ON_DEVICE = "prefer_on_device"`, `ONLY_ON_DEVICE = "only_on_device"`, `ONLY_IN_CLOUD = "only_in_cloud"`, `PREFER_IN_CLOUD = "prefer_in_cloud"`. `ONLY_ON_DEVICE` throws when no model is available and never calls the cloud (checked in the SDK source, `callCloudOrDevice`). `PREFER_IN_CLOUD` falls back to on-device only on fetch/API-not-enabled errors. |
| Web: structured output (JSON schema, enums) on-device | verified, 2026-11-17 | Two separate settings: on-device uses `onDeviceParams.promptOptions.responseConstraint` (a JSON Schema, passed to Chrome's `session.prompt`); cloud uses `inCloudParams.generationConfig.responseMimeType: "application/json"` + `responseJsonSchema`. The router sets both. **`systemInstruction` is not passed to the on-device model** by the SDK, so the router also sends the system prompt as `onDeviceParams.createOptions.initialPrompts` (role `system`). |
| Web: on-device request limit about 9 000 tokens; single turn; text and images in | reported | From the concept document's reading of the docs |
| Web: how to read which model answered a request | verified, 2026-11-17 | `result.response.inferenceSource` is `"on_device"` or `"in_cloud"` (`InferenceSource`). The ledger uses it. |
| Web: minimum Chrome version and any flags a judge must set | reported, 2026-11-17 | Firebase hybrid docs (via search): Chrome desktop **139+**. The SDK reads `globalThis.LanguageModel` (Chrome Prompt API); `initializeDeviceModel()` must run after a user gesture because it may start the model download. If `LanguageModel` is missing, enable `chrome://flags/#optimization-guide-on-device-model` ("Enabled BypassPerfRequirement") and `chrome://flags/#prompt-api-for-gemini-nano`, restart, and wait for the model download in `chrome://on-device-internals`. This text is in the in-app banner and the README. |
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

## 6. How M0 was checked (2026-11-17)

- `firebase.google.com` is not reachable from the build container, so the web facts were
  read from the published SDK itself (`firebase@13.4.0` on npm: `@firebase/ai/dist/ai-public.d.ts`
  and `dist/esm/index.esm.js`), which is a primary source for the API surface.
- iOS facts come from `firebase-ios-sdk/FirebaseAI/CHANGELOG.md` (raw GitHub) and search
  results for the Firebase blog and docs. They stay `reported` until seen on a device (M8/M9).
- Cloud model name: not fixed by the SDK. The web app reads it from `VITE_GEMINI_MODEL`
  (default `gemini-3.5-flash`, the name used in the Firebase blog example) so it can be
  changed without code changes.
- Without a Firebase config the web app still runs: on-device calls (`ONLY_ON_DEVICE`) never
  touch the network, and cloud-only features show as unavailable.
