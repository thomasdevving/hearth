import { useSyncExternalStore } from "react";
import { getModelStatus, onModelStatus } from "./status";

/** If Chrome has no on-device model, explain how to enable it (docs/08 §3). */
export function OnDeviceBanner() {
  const s = useSyncExternalStore(onModelStatus, getModelStatus);
  if (s.onDevice === "available" || s.onDevice === "checking") return null;
  return (
    <details className="model-banner">
      <summary>
        {s.onDevice === "downloadable" || s.onDevice === "downloading"
          ? "The on-device model is not downloaded yet. Until then, private tasks use simple fallbacks."
          : "No on-device model in this browser. Private tasks use simple fallbacks; nothing private is sent anywhere."}
      </summary>
      <ol>
        <li>Use Chrome 139 or newer on a desktop computer.</li>
        <li>
          Open <code>chrome://flags/#optimization-guide-on-device-model</code> and choose “Enabled BypassPerfRequirement”.
        </li>
        <li>
          Open <code>chrome://flags/#prompt-api-for-gemini-nano</code> and choose “Enabled”.
        </li>
        <li>Restart Chrome, then check the model download at <code>chrome://on-device-internals</code>.</li>
        <li>Come back and press “Download on-device model” in Settings.</li>
      </ol>
    </details>
  );
}
