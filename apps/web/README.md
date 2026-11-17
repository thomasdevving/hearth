# Baseline · web app

Vite + React. Runs the real engine (`packages/engine`, imported from source) and real
models on a simulated person ("Sam", `docs/08_DEMO_REPLAY.md`).

```bash
npm install
```
```bash
npm run dev -w apps/web
```

Open http://localhost:5173. The time machine at the bottom moves the simulated days:
`+1 day`, `Play` (pauses whenever something needs you; tick "Answer with Sam's script" to
let it run), `Jump to…` holiday / first change / PHQ-9, and the Online/Offline switch.

- **On-device model:** Chrome desktop 139+ with the Prompt API (see the banner in the app,
  or `docs/PLATFORM_NOTES.md` §2). Without it, private tasks use their non-LLM fallbacks.
- **Cloud:** needs a Firebase project; copy `.env.example` to `.env.local` and fill it in
  (`docs/FIREBASE_SETUP.md`). Without it the app runs fully on this device.
- **Emulators:** set `VITE_USE_EMULATORS=true`, then `npx firebase emulators:start --only auth,firestore --project demo-baseline`.

Tests: `npm test -w apps/web` (jsdom, fake IndexedDB, a fake Prompt API for router tests).
