// Firebase setup. Config comes from untracked .env.local (rule R10). Without it the app still
// runs: on-device inference goes through Firebase AI Logic with a local-only app object, and
// every cloud path is unavailable.
import { initializeApp, type FirebaseApp } from "firebase/app";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const cloudConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const GEMINI_MODEL = (env.VITE_GEMINI_MODEL as string | undefined) || "gemini-3.5-flash";
export const RECAPTCHA_KEY = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined;
export const APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
export const USE_EMULATORS = env.VITE_USE_EMULATORS === "true";

let app: FirebaseApp | null = null;

/** The Firebase app. Unconfigured, a placeholder app that never reaches a server is used. */
export function firebaseApp(): FirebaseApp {
  if (app) return app;
  app = cloudConfigured
    ? initializeApp(firebaseConfig)
    : initializeApp({ apiKey: "local-only", projectId: "local-only", appId: "local-only" }, "local-only");
  return app;
}
