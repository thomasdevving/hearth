// Cloud services, started only after cloud consent (R4). Nothing here runs before that.
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInAnonymously, signOut, type User } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { fetchAndActivate, getAll, getRemoteConfig } from "firebase/remote-config";
import { APPCHECK_DEBUG_TOKEN, cloudConfigured, firebaseApp, RECAPTCHA_KEY, USE_EMULATORS } from "../firebase";
import { setPromptVersionOverrides } from "../inference/prompts";

let appCheck: AppCheck | null = null;
let fs: Firestore | null = null;
let user: User | null = null;
let rcKeys: string[] = [];

export function cloudReady(): boolean {
  return cloudConfigured && user !== null && fs !== null;
}
export function currentUid(): string | null {
  return user?.uid ?? null;
}
export function remoteConfigKeys(): string[] {
  return rcKeys;
}

/** App Check → anonymous sign-in → Remote Config. Idempotent. */
export async function startCloud(): Promise<void> {
  if (!cloudConfigured) throw new Error("No Firebase project configured.");
  const app = firebaseApp();
  if (!appCheck && RECAPTCHA_KEY) {
    if (APPCHECK_DEBUG_TOKEN) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true });
  }
  const auth = getAuth(app);
  if (USE_EMULATORS && !auth.emulatorConfig) connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  if (!fs) {
    fs = getFirestore(app);
    if (USE_EMULATORS) connectFirestoreEmulator(fs, "localhost", 8080);
  }
  user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  if (!USE_EMULATORS) void refreshRemoteConfig(); // Remote Config has no emulator
}

/** Remote Config never blocks sign-in or uploads; it is fetched in the background. */
async function refreshRemoteConfig(): Promise<void> {
  try {
    const rc = getRemoteConfig(firebaseApp());
    rc.settings.minimumFetchIntervalMillis = 3600000;
    rc.settings.fetchTimeoutMillis = 8000;
    await fetchAndActivate(rc);
    const all = getAll(rc);
    rcKeys = Object.keys(all);
    // The web replay keeps the bundled engine config so it stays reproducible (docs/07 §5);
    // only the prompt version labels are taken from Remote Config.
    const pv = all.promptVersions?.asString();
    if (pv) setPromptVersionOverrides(JSON.parse(pv));
  } catch (e) {
    console.warn("Remote Config fetch failed", e);
  }
}

export async function stopCloud(): Promise<void> {
  if (!cloudConfigured || !user) return;
  await signOut(getAuth(firebaseApp()));
  user = null;
}

export function firestore(): Firestore {
  if (!fs) throw new Error("cloud not started");
  return fs;
}

/** The clinician view: read one share by id, without signing in. */
export async function loadShare(id: string): Promise<Record<string, unknown> | null> {
  if (!cloudConfigured) throw new Error("No Firebase project configured.");
  const app = firebaseApp();
  if (!appCheck && RECAPTCHA_KEY) {
    if (APPCHECK_DEBUG_TOKEN) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true });
  }
  if (!fs) {
    fs = getFirestore(app);
    if (USE_EMULATORS) connectFirestoreEmulator(fs, "localhost", 8080);
  }
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(fs, `shares/${id}`));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}
