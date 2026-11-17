import { useState } from "react";
import { Screen } from "../ui/kit";
import { navigate, emitChange } from "../app/events";
import { getSettings, updateSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { cloudConfigured } from "../firebase";
import { onConsentChanged } from "../cloud/consent";

export function Onboarding() {
  const s = useData(getSettings);
  const [page, setPage] = useState(0);
  if (!s) return null;
  const pages = [
    <>
      <p className="item-text">Baseline helps you notice early when your days start to change, and shows you your own plan when they do.</p>
      <p>It learns your usual pattern from steps, rest times, walking pace and the places you go. It compares each day only with your own usual days, not with anyone else.</p>
      <p>When something changes for a few days, it asks how you are. If the change continues, it offers a short questionnaire and shows the plan you wrote.</p>
    </>,
    <>
      <h2>Your words stay on this device</h2>
      <p>What you write — your plan, your notes, your answers — is read only by a model that runs on this device. It is never sent to a server.</p>
      <p>Every time a model is used, the privacy ledger shows where it ran and exactly what was sent.</p>
      <h2>It will sometimes be wrong</h2>
      <p>
        <strong>Sometimes I'll ask when nothing is wrong. That's fine.</strong> A holiday, a busy week or visitors can look like a change. You can tell the app, and it will set those days aside.
      </p>
      <p>Some check-ins are random on purpose, so you can see later whether the app's questions are useful for you.</p>
    </>,
    <>
      <h2>What Baseline is not</h2>
      <p>It cannot tell you what is wrong, and it is not a crisis service. Nobody watches your data and the app never contacts anyone for you.</p>
      <p>If you ever need help right away, the “I need help now” button shows support lines and your own safety plan, even offline.</p>
      <h2>Optional: the cloud model</h2>
      <label className="toggle">
        <span>
          Allow weekly summaries to be sent to Gemini in the cloud for a longer reflection. Off by default; you can change it in Settings.
          {!cloudConfigured && <small> (Not available in this build.)</small>}
        </span>
        <input
          type="checkbox"
          aria-label="Allow the cloud model"
          checked={s.cloudConsent}
          disabled={!cloudConfigured}
          onChange={async (e) => {
            const on = e.target.checked; // read before any await: React resets a controlled input
            await updateSettings({ cloudConsent: on });
            await onConsentChanged(on);
            emitChange();
          }}
        />
      </label>
      <p className="muted">In this demo the sensors are simulated: you follow Sam, a made-up person, for 150 days. On iPhone, Baseline would ask for Health and location access here.</p>
    </>,
  ];
  return (
    <Screen title="Welcome to Baseline">
      {pages[page]}
      <div className="row">
        {page > 0 && (
          <button className="secondary" onClick={() => setPage(page - 1)}>
            Back
          </button>
        )}
        {page < pages.length - 1 ? (
          <button className="primary" onClick={() => setPage(page + 1)}>
            Next
          </button>
        ) : (
          <button
            className="primary"
            onClick={async () => {
              await updateSettings({ onboarded: true });
              emitChange();
              navigate("plan_setup", { first: "1" });
            }}
          >
            Set up my plan
          </button>
        )}
      </div>
      <p className="progress">Step {page + 1} of {pages.length}</p>
    </Screen>
  );
}
