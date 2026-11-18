# Hearth for iOS

SwiftUI app on the user's own HealthKit data. The engine is `packages/engine` itself, run in
JavaScriptCore; no detection logic is written in Swift. Built in milestones M8 and M9 of
`docs/09_BUILD_PLAN.md`. Layout: `docs/02_ARCHITECTURE.md` §2.

## What you need

- A Mac with Xcode (built so far with Xcode 26.1; the deployment target is **iOS 26.0** for
  now, see `docs/DECISIONS.md`, M8 iOS. The Gemini cloud model needs iOS 27 / Xcode 27).
- Node.js and npm (the build phase builds `engine.js` and copies the fonts from `node_modules`).
- An iPhone with Apple Intelligence switched on, for the on-device model. Without it every
  model task uses its plain fallback.
- An Apple ID signed in under Xcode → Settings → Accounts. A free personal team is enough to
  run the app on your own phone (the app stops opening after 7 days and must be installed again).

## Build and test

From the repository root:

```bash
npm ci
npm run build -w packages/engine
```

Then run the tests in the Simulator. They cover all golden fixtures through the bridge
(bit for bit), the router and ledger, the check-in and questionnaire flows, and the schemas:

```bash
cd apps/ios && xcodebuild test -project Hearth.xcodeproj -scheme Hearth -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO
```

Or open `apps/ios/Hearth.xcodeproj` in Xcode, choose the Hearth scheme and press ⌘U.

The build phase `scripts/copy-resources.sh` copies into the app:
`packages/engine/dist/engine.js` (rebuilt when older than the engine source or `shared/`),
`Hearth/Engine/v8math.js` (bit-exact Math, see `docs/PLATFORM_NOTES.md` §8), `shared/` and
the Syne and Outfit fonts. The test bundle also gets `packages/engine/test/fixtures/*.json`.

## Run on your iPhone

1. Connect the iPhone with a cable, unlock it and tap **Trust**.
2. In Xcode, select your team under Signing & Capabilities if it differs from the one in the
   project (`DEVELOPMENT_TEAM`), and pick your iPhone as the run destination. From the
   command line:

   ```bash
   cd apps/ios && xcodebuild -project Hearth.xcodeproj -scheme Hearth -destination 'platform=iOS,name=iPhone van Thomas' -derivedDataPath build/DerivedData -allowProvisioningUpdates build
   ```

   ```bash
   xcrun devicectl device install app --device "iPhone van Thomas" apps/ios/build/DerivedData/Build/Products/Debug-iphoneos/Hearth.app
   ```

3. The first time, the iPhone asks for **Developer Mode**: Settings → Privacy & Security →
   Developer Mode → on, then restart and confirm.
4. Trust the developer profile: Settings → General → VPN & Device Management → your Apple
   ID → Trust.
5. Open Hearth, go through onboarding and allow Health access (all categories). The app
   reads 120 days of history and scores every day; Today then shows the state and your last
   months.

## Simulator with generated data (debug builds only)

The Simulator has no Health history. Launch with generated data to look at the screens:

```bash
xcrun simctl launch "iPhone 17 Pro" com.thomasdevving.hearth -HearthDemo YES
```

Add `-HearthDemoPlanned YES` to skip plan setup and the first PHQ-9, or `-HearthTab trends`
to open on Trends.

## Not in this build

- **Cloud:** no Firebase Apple SDK and no `GoogleService-Info.plist`. Cloud consent is shown
  as not available, nothing is uploaded and task D uses its template. To add it later: put
  `GoogleService-Info.plist` in `apps/ios/Hearth/` (it is git-ignored, R10; never commit it),
  raise the target to iOS 27, add the Firebase Apple SDK 13 package, and fill in `CloudModel`
  in `Hearth/Inference/OnDeviceModel.swift` (anonymous auth, weekly upload, task D).
- **P1 on iOS:** tasks I, K, G2, P, Q, speech input, writing PHQ-9 to Health, share links.

## Where things are

| Folder | What |
|---|---|
| `Hearth/Engine` | `Engine.swift` (JavaScriptCore bridge), `v8math.js`, Swift mirrors of the engine types, `shared/` loader |
| `Hearth/Collectors` | `HealthKitCollector` (steps in 15-min bins, walking speed, sleep, HRV, resting heart rate), `LocationCollector` (CLVisit) |
| `Hearth/Inference` | `InferenceRouter` (engine routing and validation, privacy ledger), `OnDeviceModel` (Apple Foundation Models), `CloudModel` (not configured) |
| `Hearth/Store` | SwiftData models, one per collection of `docs/07_DATA_MODEL.md` §2 |
| `Hearth/App` | Daily loop, user actions, notifications and background refresh |
| `Hearth/Screens` | One view per screen id |
| `HearthTests` | Golden fixtures, type decoding, router and flow tests |
