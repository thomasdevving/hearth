import { selfAudit } from "@hearth/engine";
import { db, updateSettings, getSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { Screen } from "../ui/kit";
import { cfg } from "../app/runtime";
import { emitChange } from "../app/events";

const TEXT = {
  collecting: "Not enough check-ins yet to tell. Hearth needs at least 8 check-ins of each kind.",
  informative: "For you, the check-ins Hearth sends when your pattern changes do catch lower moods than the random ones. The triggers seem to be useful.",
  not_informative: "For you, check-ins sent when your pattern changed did not catch lower moods than random ones. The triggers don't seem to tell you much. You could switch to a simple fixed schedule.",
  unclear: "So far it is unclear whether the triggered check-ins tell you more than the random ones.",
};

export function Audit() {
  const d = useData(async () => ({ result: selfAudit(await db.checkins.toArray(), cfg), settings: await getSettings() }));
  if (!d) return <Screen title="Is this working for you?">Loading…</Screen>;
  const r = d.result;
  return (
    <Screen title="Is this working for you?" back="settings">
      <p>{TEXT[r.status]}</p>
      <p className="muted">
        Check-ins when your pattern changed: {r.nTriggered}. Random check-ins: {r.nRandom}.
        {r.delta !== null && ` Difference in “feeling down”: ${r.delta.toFixed(1)} points (p = ${r.p?.toFixed(3)}).`}
      </p>
      {r.status === "not_informative" && d.settings.scheduleMode !== "fixed" && (
        <button
          className="primary"
          onClick={async () => {
            await updateSettings({ scheduleMode: "fixed" });
            emitChange();
          }}
        >
          Switch to a check-in every 3 days
        </button>
      )}
      {d.settings.scheduleMode === "fixed" && <p>You are on the fixed schedule.</p>}
    </Screen>
  );
}
