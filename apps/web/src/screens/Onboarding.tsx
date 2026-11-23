import { useState } from "react";
import { navigate, emitChange } from "../app/events";
import { getSettings, updateSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { LogoMark } from "../ui/Logo";
import { cloudConfigured } from "../firebase";
import { onConsentChanged } from "../cloud/consent";

/** Small drawings in the app's own visual language: your usual band, a drift out of it, your plan. */
function UsualArt() {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true">
      <path d="M4 16 C16 12 24 20 34 15 S52 13 60 16 L60 30 C52 27 44 33 34 29 S16 26 4 30 Z" fill="rgba(47,125,79,0.16)" />
      <path d="M4 23 L12 21 L20 25 L28 21 L36 24 L44 20 L52 23 L60 22" fill="none" stroke="#ca026a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DriftArt() {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true">
      <path d="M4 18 L60 18 L60 32 L4 32 Z" fill="rgba(47,125,79,0.16)" />
      <path d="M4 26 L14 24 L24 27 L34 24 L42 19 L50 13 L57 8" fill="none" stroke="#ca026a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="57" cy="8" r="4" fill="#b25d00" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}
function PlanArt() {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true">
      <rect x="8" y="6" width="48" height="32" rx="7" fill="#fff" stroke="#f3c6df" strokeWidth="1.5" />
      <rect x="15" y="14" width="24" height="3.5" rx="1.75" fill="#1d1320" opacity="0.75" />
      <rect x="15" y="22" width="18" height="3" rx="1.5" fill="#6e6470" opacity="0.5" />
      <circle cx="46" cy="22" r="6" fill="#fdf0f7" stroke="#ca026a" strokeWidth="1.5" />
      <path d="M43.4 22.2 L45.4 24.2 L48.8 20.4" fill="none" stroke="#ca026a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS = [
  { art: <UsualArt />, title: "It learns your usual days", text: "Sleep, steps, rhythm, heart rate and places." },
  { art: <DriftArt />, title: "It notices when they change", text: "Compared only with you." },
  { art: <PlanArt />, title: "It brings back your plan", text: "A short check-in, in your own words." },
];

/**
 * First run: an animated intro (logo and slogan), then one short onboarding screen. Privacy and
 * what Hearth is not are on that screen, one tap away for whoever wants them.
 */
export function Onboarding() {
  const s = useData(getSettings);
  const [step, setStep] = useState<"intro" | "about">("intro");
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  if (!s) return null;

  if (step === "intro")
    return (
      <section className="onboard" aria-labelledby="intro-title">
        <div className="intro-mark" aria-hidden="true">
          <LogoMark size={96} />
        </div>
        <p className="intro-brand">Hearth</p>
        <h1 id="intro-title">Notice when your days start to drift.</h1>
        <button className="primary intro-start" onClick={() => setStep("about")}>
          Start with Hearth
        </button>
      </section>
    );

  return (
    <section className="onboard intro-about" aria-labelledby="about-title">
      <div className="intro-mark intro-mark-small" aria-hidden="true">
        <LogoMark size={44} />
      </div>
      <h1 id="about-title">How Hearth works</h1>
      <p className="about-lead">It does three things for you in the background.</p>
      <ul className="intro-cards">
        {STEPS.map((st, i) => (
          <li key={st.title} style={{ ["--i" as string]: i }}>
            <span className="intro-art">{st.art}</span>
            <span className="intro-card-text">
              <strong>{st.title}</strong>
              <span>{st.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="intro-actions">
      <details className="intro-more">
        <summary>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" /></svg>
          Learn more about privacy
        </summary>
        <ul>
          <li>Your words are read only by the model on this device.</li>
          <li>Every model call is listed in the privacy ledger.</li>
          <li>Hearth is not a diagnosis or a crisis service. “I need help now” works offline.</li>
        </ul>
        {cloudConfigured && (
          <label className="toggle">
            <span>Allow a longer weekly reflection by Gemini in the cloud, from weekly numbers only.</span>
            <input
              type="checkbox"
              aria-label="Allow the cloud model"
              checked={s.cloudConsent}
              onChange={async (e) => {
                const on = e.target.checked; // read before any await: React resets a controlled input
                await updateSettings({ cloudConsent: on });
                setCloudMsg(await onConsentChanged(on));
                emitChange();
              }}
            />
          </label>
        )}
        {cloudMsg && <p role="status">{cloudMsg}</p>}
      </details>
      <button
        className="primary intro-start"
        onClick={async () => {
          await updateSettings({ onboarded: true });
          emitChange();
          navigate("plan_setup", { first: "1" });
        }}
      >
        Set up my plan
      </button>
      <p className="intro-demo">Demo: you are Sam, a made-up person. The sensor data is simulated.</p>
      </div>
    </section>
  );
}
