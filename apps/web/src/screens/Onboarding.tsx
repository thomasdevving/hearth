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
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  if (!s) return null;
  const pages = [
    <>
      <p className="item-text">Hearth notices when your days start to drift, and shows you your own plan.</p>
      <ul className="plain-list">
        <li>It learns your usual days from sleep, steps, daily rhythm, heart rate and the places you go.</li>
        <li>It compares you only with yourself, never with other people.</li>
        <li>When something changes for a few days, it asks how you are and opens your plan.</li>
      </ul>
      <p className="muted">In this demo you are Sam, a made-up person, over 150 days. Sam's sensor data is simulated; everything else is the real app.</p>
    </>,
    <>
      <h2>Your words stay on this device</h2>
      <p>Your plan, notes and answers are read only by the model on this device. The privacy ledger shows every model call.</p>
      <h2>It takes your holidays into account</h2>
      <p>Going away or having visitors changes your days. Tell Hearth, and those days are set aside. Now and then it may still ask when nothing is wrong, and that's fine: some check-ins are random on purpose.</p>
    </>,
    <>
      <h2>What Hearth is not</h2>
      <p>Not a diagnosis and not a crisis service. Nobody watches your data. “I need help now” shows support lines, even offline.</p>
      <h2>Optional: the cloud model</h2>
      <label className="toggle">
        <span>
          A longer weekly reflection by Gemini in the cloud, from weekly numbers only. Off by default.
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
            setCloudMsg(await onConsentChanged(on));
            emitChange();
          }}
        />
      </label>
      {cloudMsg && <p role="status">{cloudMsg}</p>}
      <p className="muted">On iPhone, Hearth would ask for Health and location access here.</p>
    </>,
  ];
  return (
    <Screen title="Welcome to Hearth">
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
