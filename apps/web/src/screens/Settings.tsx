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
  a.download = "baseline-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Settings() {
  const s = useData(async () => ({ settings: await getSettings(), contact: await getSingleton(db.trusted_contact), plan: await getSingleton(db.safety_plan) }));
  const status = useSyncExternalStore(onModelStatus, getModelStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  if (!s) return <Screen title="Settings">Loading…</Screen>;
  const { settings } = s;
  const c = contact ?? s.contact ?? { name: "", phone: "" };
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
              : "Not available in this build: no Firebase project is configured."}
          </small>
        </span>
        <input
          type="checkbox"
          aria-label="Allow the cloud model"
          checked={settings.cloudConsent}
          disabled={!cloudConfigured}
          onChange={async (e) => {
            await set({ cloudConsent: e.target.checked });
            await onConsentChanged(e.target.checked);
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
      <button className="link" onClick={() => checkOnDevice()}>
        Check again
      </button>

      <h2>Check-ins</h2>
      <label className="toggle">
        <span>
          <strong>Fixed schedule</strong>
          <br />
          <small>A check-in every 3 days instead of when your pattern changes. See “Is this working for you?”.</small>
        </span>
        <input type="checkbox" aria-label="Fixed schedule" checked={settings.scheduleMode === "fixed"} onChange={(e) => set({ scheduleMode: e.target.checked ? "fixed" : "triggered" })} />
      </label>
      <button className="link" onClick={() => navigate("audit")}>
        Is this working for you? ›
      </button>

      <h2>Sensors</h2>
      <p className="muted">In this demo the sensor data is simulated. On iPhone these switches control HealthKit and location.</p>
      {(["steps", "walkingSpeed", "sleep", "visits"] as const).map((k) => (
        <label className="toggle" key={k}>
          <span>{{ steps: "Steps", walkingSpeed: "Walking pace", sleep: "Sleep", visits: "Places (visits)" }[k]}</span>
          <input type="checkbox" checked={settings.sensors[k]} onChange={(e) => set({ sensors: { ...settings.sensors, [k]: e.target.checked } })} />
        </label>
      ))}

      <h2>Support</h2>
      <label className="toggle">
        <span>Country for the crisis line</span>
        <select value={settings.country} onChange={(e) => set({ country: e.target.value })} aria-label="Country">
          {Object.entries(crisisLines.countries).map(([code, v]) => (
            <option key={code} value={code}>
              {code} · {v.name}
            </option>
          ))}
          <option value="other">Other</option>
        </select>
      </label>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await putSingleton(db.trusted_contact, c);
          setMsg("Trusted contact saved on this device.");
          emitChange();
        }}
      >
        <label>
          Trusted contact name
          <input type="text" value={c.name} onChange={(e) => setContact({ ...c, name: e.target.value })} />
        </label>
        <label>
          Phone
          <input type="tel" value={c.phone} onChange={(e) => setContact({ ...c, phone: e.target.value })} />
        </label>
        <button className="secondary">Save contact</button>
      </form>
      <button className="link" onClick={() => navigate("safety", { edit: "1" })}>
        My safety plan ›
      </button>

      <h2>Your data</h2>
      <div className="row">
        <button className="secondary" onClick={() => exportAll()}>
          Export everything
        </button>
        <button className="link" onClick={() => navigate("weekly")}>
          Weekly reflection ›
        </button>
        <button className="link" onClick={() => navigate("share")}>
          Share with your clinician ›
        </button>
      </div>
      <button
        className="danger"
        onClick={async () => {
          if (!confirm("Delete everything on this device and in the cloud? This cannot be undone.")) return;
          await deleteCloudData();
          const meta = await getMeta();
          await clearAll();
          await loadPersona(meta?.scenario ?? "default", meta?.seed ?? 1);
          setMsg("Everything was deleted.");
          navigate("onboarding");
        }}
      >
        Delete everything
      </button>
      {msg && <p role="status">{msg}</p>}
      <HelpButton />
    </Screen>
  );
}
