import { useState, useSyncExternalStore } from "react";
import { clearAll, db, getSettings, getSingleton, putSingleton, updateSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { Screen } from "../ui/kit";
import { emitChange, navigate } from "../app/events";
import { getModelStatus, onModelStatus } from "../inference/status";
import { checkOnDevice, downloadOnDeviceModel } from "../inference/availability";
import { cloudConfigured } from "../firebase";
import { HelpButton } from "./Home";
import { onConsentChanged, deleteCloudData } from "../cloud/consent";
import { loadPersona, getMeta } from "../app/runtime";
import crisisLines from "../../../../shared/safety/crisis_lines.json";

async function exportAll(): Promise<void> {
  const out: Record<string, unknown> = {};
  for (const t of db.tables) out[t.name] = await t.toArray();
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hearth-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); // revoking at once can cancel the download
}

export function Settings() {
  const s = useData(async () => ({ settings: await getSettings(), plan: await getSingleton(db.safety_plan) }));
  const status = useSyncExternalStore(onModelStatus, getModelStatus);
  const [msg, setMsg] = useState<string | null>(null);
  if (!s) return <Screen title="Settings">Loading…</Screen>;
  const { settings } = s;
  const set = async (patch: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(patch);
    emitChange();
  };
  return (
    <Screen title="Settings">
      <h2>Where models run</h2>
      <label className="toggle">
        <span>
          <strong>Allow the cloud model</strong>
          <br />
          <small>
            {cloudConfigured
              ? "Off by default. When on, only weekly summaries and single numbers (never your own words, notes or places) may be sent to Gemini in the cloud. Every request is in the privacy ledger."
              : "The cloud model is not set up in this copy of Hearth, so everything runs on this device."}
          </small>
        </span>
        <input
          type="checkbox"
          aria-label="Allow the cloud model"
          checked={settings.cloudConsent}
          disabled={!cloudConfigured}
          onChange={async (e) => {
            const on = e.target.checked; // read before any await: React resets a controlled input
            await set({ cloudConsent: on });
            setMsg(await onConsentChanged(on));
          }}
        />
      </label>
      <label className="toggle">
        <span>
          <strong>Use the on-device model</strong>
          <br />
          <small>Status: {status.onDevice.replace("_", " ")}{status.downloadProgress !== null && status.onDevice === "downloading" ? ` (${Math.round(status.downloadProgress * 100)} %)` : ""}. When off, private tasks use simple fallbacks.</small>
        </span>
        <input type="checkbox" aria-label="Use the on-device model" checked={settings.onDeviceEnabled} onChange={(e) => set({ onDeviceEnabled: e.target.checked })} />
      </label>
      {(status.onDevice === "downloadable" || status.onDevice === "downloading") && (
        <button
          className="secondary"
          onClick={async () => {
            try {
              await downloadOnDeviceModel();
            } catch (e) {
              setMsg(`Download failed: ${(e as Error).message}`);
            }
          }}
        >
          Download on-device model
        </button>
      )}
      <div className="link-list">
        <button className="link" onClick={() => checkOnDevice()}>
          Check the on-device model again
        </button>
        <button className="link" onClick={() => navigate("eval_g")}>
          Test how Hearth reads a plan ›
        </button>
      </div>

      <h2>Check-ins</h2>
      <label className="toggle">
        <span>
          <strong>Fixed schedule</strong>
          <br />
          <small>A check-in every 3 days, instead of when your pattern changes.</small>
        </span>
        <input type="checkbox" aria-label="Fixed schedule" checked={settings.scheduleMode === "fixed"} onChange={(e) => set({ scheduleMode: e.target.checked ? "fixed" : "triggered" })} />
      </label>
      <button className="link" onClick={() => navigate("audit")}>
        Is this working for you? ›
      </button>

      <h2>Sensors</h2>
      <p className="muted">Simulated in this demo. On iPhone these control Health and location access.</p>
      {(["steps", "walkingSpeed", "sleep", "visits"] as const).map((k) => (
        <label className="toggle" key={k}>
          <span>{{ steps: "Steps", walkingSpeed: "Walking pace", sleep: "Sleep", visits: "Places (visits)" }[k]}</span>
          <input type="checkbox" checked={settings.sensors[k]} onChange={(e) => set({ sensors: { ...settings.sensors, [k]: e.target.checked } })} />
        </label>
      ))}

      <h2>Support</h2>
      <label className="toggle">
        <span className="nowrap">Crisis line</span>
        <select value={settings.country} onChange={(e) => set({ country: e.target.value })} aria-label="Country">
          {Object.entries(crisisLines.countries).map(([code, v]) => (
            <option key={code} value={code}>
              {code} · {v.name}
            </option>
          ))}
          <option value="other">Other</option>
        </select>
      </label>
      <div className="link-list">
        <button className="link" onClick={() => navigate("people")}>
          My people ›
        </button>
        <button className="link" onClick={() => navigate("safety", { edit: "1" })}>
          My safety plan ›
        </button>
      </div>

      <h2>Your data</h2>
      <div className="link-list">
        <button className="link" onClick={() => navigate("weekly")}>
          Weekly reflection ›
        </button>
        <button className="link" onClick={() => navigate("share")}>
          Share with your clinician ›
        </button>
      </div>
      <div className="row">
        <button className="secondary" onClick={() => exportAll()}>
          Export everything
        </button>
      </div>
      <h2>Delete your data</h2>
      <p className="muted">Removes everything Hearth stored on this device and in the cloud. This cannot be undone.</p>
      <button
        className="danger"
        onClick={async () => {
          if (!confirm("Delete everything on this device and in the cloud? This cannot be undone.")) return;
          const cloudOk = await deleteCloudData();
          if (!cloudOk && !confirm("Hearth could not reach the cloud, so your uploaded weekly summaries and share links were not deleted. If you go on, Hearth cannot delete them later. Delete everything on this device anyway? Choose Cancel to try again when you are online.")) {
            setMsg("Nothing was deleted. Try again when you are online.");
            return;
          }
          const meta = await getMeta();
          await clearAll();
          await loadPersona(meta?.scenario ?? "default", meta?.seed ?? 1);
          navigate("onboarding");
        }}
      >
        Delete everything
      </button>
      {msg && <p role="status">{msg}</p>}
      <hr className="section-rule" />
      <HelpButton />
    </Screen>
  );
}
