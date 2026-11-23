import { useEffect, useState } from "react";
import { Screen } from "../ui/kit";
import { DEFAULT_MESSAGE } from "../store/db";
import { getPeople, MAX_PEOPLE, savePeople } from "../app/people";
import { navigate } from "../app/events";

type Draft = { name: string; phone: string; goodFor: string; message: string };
const empty = (): Draft => ({ name: "", phone: "", goodFor: "", message: DEFAULT_MESSAGE });

/** "My people": who to call or message on a hard day. Local only (S3). */
export function People() {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getPeople().then((ps) => setRows(ps.length ? ps.map(({ name, phone, goodFor, message }) => ({ name, phone, goodFor, message })) : [empty()]));
  }, []);
  if (!rows) return <Screen title="My people">Loading…</Screen>;
  const set = (i: number, patch: Partial<Draft>) => {
    setSaved(false);
    setRows((prev) => (prev ?? []).map((r, k) => (k === i ? { ...r, ...patch } : r)));
  };
  return (
    <Screen title="My people" back="my_plan">
      <p className="muted">
        One to three people to call or message on a hard day. Hearth never contacts them.
      </p>
      {rows.map((r, i) => (
        <fieldset className="person-form" key={i}>
          <legend>Person {i + 1}</legend>
          <label>
            Name
            <input type="text" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="For example: my sister" autoComplete="off" />
          </label>
          <label>
            Phone
            <input type="tel" value={r.phone} onChange={(e) => set(i, { phone: e.target.value })} autoComplete="off" />
          </label>
          <label>
            Good for (optional)
            <input type="text" value={r.goodFor} onChange={(e) => set(i, { goodFor: e.target.value })} placeholder="a walk, a chat, a laugh" />
          </label>
          <label>
            Message that opens when you tap “Message”
            <textarea rows={2} value={r.message} onChange={(e) => set(i, { message: e.target.value })} />
          </label>
          <button className="link" onClick={() => { setSaved(false); setRows((prev) => (prev ?? []).filter((_, k) => k !== i)); }}>
            Remove
          </button>
        </fieldset>
      ))}
      {rows.length < MAX_PEOPLE && (
        <button className="secondary" onClick={() => setRows((prev) => [...(prev ?? []), empty()])}>
          Add another person
        </button>
      )}
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            await savePeople(rows);
            setSaved(true);
          }}
        >
          Save on this device
        </button>
        <button className="link" onClick={() => navigate("my_plan")}>
          Back to my plan
        </button>
      </div>
      {saved && <p role="status">Saved on this device.</p>}
    </Screen>
  );
}
