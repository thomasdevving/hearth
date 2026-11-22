// The only places this web app may connect to (docs/DECISIONS.md, "Provable privacy").
// Firebase Hosting sends these as the Content-Security-Policy `connect-src` (firebase.json),
// so the browser itself blocks every other destination, whatever the code tries.
// test/privacyPolicy.test.ts checks that firebase.json and this list stay identical.

export interface AllowedHost {
  origin: string;
  what: string;
}

export const ALLOWED_HOSTS: AllowedHost[] = [
  { origin: "https://firebasevertexai.googleapis.com", what: "Gemini in the cloud (Firebase AI Logic): only after your consent, never your own words" },
  { origin: "https://firestore.googleapis.com", what: "Weekly summaries and share links you approved (Firestore)" },
  { origin: "https://identitytoolkit.googleapis.com", what: "Anonymous sign-in, so only you can read your weekly summaries" },
  { origin: "https://securetoken.googleapis.com", what: "Keeps that anonymous sign-in valid" },
  { origin: "https://content-firebaseappcheck.googleapis.com", what: "App Check: proves requests come from this app" },
  { origin: "https://firebaseinstallations.googleapis.com", what: "Needed by Remote Config" },
  { origin: "https://firebaseremoteconfig.googleapis.com", what: "Remote Config: prompt version labels" },
  { origin: "https://firebaseremoteconfigrealtime.googleapis.com", what: "Remote Config updates" },
  { origin: "https://www.google.com/recaptcha/", what: "reCAPTCHA for App Check" },
];

/** The full policy, as sent by Firebase Hosting. */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${ALLOWED_HOSTS.map((h) => h.origin).join(" ")}`,
    // 'unsafe-eval': Ajv compiles the JSON schemas that check every model output (R8).
    "script-src 'self' 'unsafe-eval' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
    "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
