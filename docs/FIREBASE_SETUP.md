# Firebase setup

The code needs a Firebase project; creating one requires your Google account, so these
steps are done by hand once. Nothing here goes into the repository except `firebase.json`
and the files in `firebase/` (rule R10).

1. **Create the project** at https://console.firebase.google.com (Analytics not needed).
2. **Add a Web app** (Project settings → Your apps → `</>`). Copy the config values into
   `apps/web/.env.local` using `apps/web/.env.example` as the template.
3. **Authentication** → Sign-in method → enable **Anonymous**.
4. **Firestore Database** → Create database (production mode, a region near you).
5. **AI Logic** → Get started → choose the **Gemini Developer API** provider.
6. **App Check** → register the web app with **reCAPTCHA Enterprise**; put the site key in
   `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. For local work, add a debug token
   (App Check → Apps → ⋮ → Manage debug tokens) and put it in `VITE_APPCHECK_DEBUG_TOKEN`.
   Then enforce App Check for **Firestore** and **AI Logic**.
7. **Remote Config**: optional. `firebase deploy --only remoteconfig` publishes
   `firebase/remoteconfig.template.json` (same keys as `shared/config/defaults.json`).
8. **Hosting**: nothing to click.
9. Link the CLI:
   ```bash
   npm install -g firebase-tools
   ```
   ```bash
   firebase login
   ```
   ```bash
   cp .firebaserc.example .firebaserc   # then put your project id in it
   ```
10. Deploy rules and the web app:
    ```bash
    npm run build && firebase deploy --only firestore:rules,hosting
    ```

The Firestore rules test runs against the local emulator and needs no project:
```bash
npm run test:rules
```

## Live project (2026-11-21)

- Project `hearth-9de01`; the web app is served by Firebase Hosting at
  https://hearth-9de01.web.app (`npm run build -w apps/web && firebase deploy --only hosting`).
  Firestore rules are deployed with `firebase deploy --only firestore:rules`.
- `.env.local` and `.firebaserc` stay untracked (R10). A production build must not contain
  `VITE_APPCHECK_DEBUG_TOKEN`: a debug token in a public bundle lets anyone bypass App Check.
  Use it only for local work.
- Errors seen while setting up, and what they mean:
  - `auth/configuration-not-found` on consent: Authentication has not been started in the
    console (Build → Authentication → Get started → Anonymous).
  - AI Logic `403 Permission denied on the service`: AI Logic is not enabled yet.
  - AI Logic `400 genai config not found`: the API is on, but the Gemini Developer API
    provider setup in Build → AI Logic was not completed.
