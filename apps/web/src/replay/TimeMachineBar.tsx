import { useEffect, useState, useSyncExternalStore } from "react";
import type { Scenario } from "@hearth/engine";
import { timeMachine, type JumpTarget } from "./controller";
import { useData } from "../ui/hooks";
import { getMeta, currentReplay, isTodayProcessed } from "../app/runtime";
import { getSettings, updateSettings } from "../store/db";
import { prettyDate } from "../app/labels";
import { emitChange } from "../app/events";
import { getModelStatus, onModelStatus } from "../inference/status";

function useTM() {
  const [, set] = useState(0);
  useEffect(() => timeMachine.subscribe(() => set((n) => n + 1)), []);
  return timeMachine;
}

const ON_DEVICE_TEXT: Record<string, string> = {
  checking: "checking…",
  available: "on-device model ready",
  downloadable: "on-device model can be downloaded",
  downloading: "downloading on-device model",
  unavailable: "no on-device model",
  no_api: "no on-device model in this browser",
};

export function TimeMachineBar() {
  const tm = useTM();
  const status = useSyncExternalStore(onModelStatus, getModelStatus);
  const d = useData(async () => {
    const [meta, data, settings, processed] = await Promise.all([getMeta(), currentReplay(), getSettings(), isTodayProcessed()]);
    return { meta, total: data?.raws.length ?? 0, phase: data?.phases.find((p) => meta && meta.dayNumber >= p.fromDay && meta.dayNumber <= p.toDay)?.name ?? "", settings, processed };
  });
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("default");
  const [seed, setSeed] = useState(1);
  if (!d?.meta) return null;
  const { meta, settings } = d;
  const jump = (t: JumpTarget) => tm.jump(t);
  return (
    <aside className="timemachine" aria-label="Time machine (demo control)">
      <div className="tm-row">
        <span className="tm-date" aria-live="polite">
          <strong>Day {meta.dayNumber}</strong>
          <span className="tm-of">/{d.total}</span> <span className="tm-sub">· {prettyDate(meta.today)}{d.phase && ` · ${d.phase}`}{!d.processed && " · today not scored yet"}</span>
        </span>
        <div className="tm-controls">
          <button onClick={() => tm.step()} disabled={tm.busy || tm.playing} aria-label="Next day">
            +1 day
          </button>
          {tm.playing ? (
            <button onClick={() => tm.pause()} aria-label="Pause">
              ❚❚
            </button>
          ) : (
            <button onClick={() => tm.play()} disabled={tm.busy} aria-label="Play">
              ▶
            </button>
          )}
          <select aria-label="Jump to" value="" onChange={(e) => e.target.value && jump(e.target.value as JumpTarget)} disabled={tm.busy || tm.playing}>
            <option value="">Jump to…</option>
            <option value="holiday">Holiday</option>
            <option value="first_change">First change</option>
            <option value="phq9">Questionnaire</option>
          </select>
          <button className="tm-more" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="More demo controls">
            ⋯
          </button>
        </div>
      </div>
      {tm.message && <div className="tm-msg" role="status">{tm.message}</div>}
      {open && (
        <div className="tm-panel">
          <label>
            <input type="checkbox" checked={tm.autoAnswer} onChange={(e) => tm.setAutoAnswer(e.target.checked)} /> Answer with Sam's script
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.online}
              onChange={async (e) => {
                await updateSettings({ online: e.target.checked });
                emitChange();
              }}
            />{" "}
            Online
          </label>
          <span className={`tm-model ${status.onDevice}`}>
            {ON_DEVICE_TEXT[status.onDevice]}
            {status.last ? ` · last: ${status.last.task} ${status.last.ranOn === "on_device" ? "on-device" : status.last.ranOn === "cloud" ? "cloud" : "fallback"}` : ""}
          </span>
          <div className="tm-load">
            <label>
              Scenario{" "}
              <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
                <option value="default">default</option>
                <option value="slow">slow</option>
                <option value="safety">safety</option>
                <option value="stable">stable</option>
              </select>
            </label>
            <label>
              Seed <input type="number" min={1} max={999} value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} style={{ width: "4em" }} />
            </label>
            <button
              onClick={async () => {
                if (confirm("Reset the local store and load the persona?")) {
                  await tm.load(scenario, seed);
                }
              }}
            >
              Load persona
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
