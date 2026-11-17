import { useState } from "react";
import { datesOfIsoWeek, piiCheck } from "@hearth/engine";
import { db, getSingleton } from "../store/db";
import { router } from "../inference";
import { ModelBadge } from "../ui/kit";
import { syncWeeks } from "../cloud/sync";
import { emitChange } from "../app/events";
import { currentReplay, getEngineState } from "../app/runtime";

/**
 * Task P, the privacy gateway (docs/05 task P): this week's own texts stay on the device;
 * the on-device model writes a general note, code checks it for names, numbers, places and
 * the trusted contact, and the user sees, edits or removes it before it can be shared.
 */
export function WeekNote({ isoWeek, existing }: { isoWeek: string; existing: { themes: string[]; text: string } | null }) {
  const [draft, setDraft] = useState<{ themes: string[]; text: string; ranOn: "on_device" | "cloud" } | null>(null);
  const [state, setState] = useState<"idle" | "working" | "nomodel" | "notext">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const checkOpts = async () => {
    const st = await getEngineState();
    const data = await currentReplay();
    const contact = await getSingleton(db.trusted_contact);
    const labels = [...(st?.places.map((p) => p.label).filter((x): x is string => !!x) ?? []), ...(data?.places.map((p) => p.label) ?? [])];
    return { placeLabels: labels, contactName: contact?.name ?? null };
  };

  const write = async () => {
    const dates = datesOfIsoWeek(isoWeek);
    const texts = (await db.diary.toArray()).filter((d) => d.date >= dates[0] && d.date <= dates[6] && d.text).map((d) => d.text as string);
    if (texts.length === 0) return setState("notext");
    setState("working");
    const text = texts.join("\n---\n");
    const res = await router().run<{ themes: string[]; note: string }>("P", { text }, { sourceText: text, verify: await checkOpts() });
    if (res.ok) {
      setDraft({ themes: res.value.themes, text: res.value.note, ranOn: res.ranOn });
      setState("idle");
    } else setState("nomodel");
  };

  const approve = async () => {
    if (!draft) return;
    const pii = piiCheck(draft.text, await checkOpts());
    if (!pii.ok) {
      setProblem("Please remove names, numbers, places or other details that could identify someone.");
      return;
    }
    const row = await db.week_aggregates.get(isoWeek);
    if (!row) return;
    await db.week_aggregates.put({ ...row, aggregate: { ...row.aggregate, note: { themes: draft.themes, text: draft.text.trim() } }, uploaded: false });
    setDraft(null);
    setProblem(null);
    await syncWeeks().catch(() => undefined);
    emitChange();
  };

  const remove = async () => {
    const row = await db.week_aggregates.get(isoWeek);
    if (!row) return;
    await db.week_aggregates.put({ ...row, aggregate: { ...row.aggregate, note: null }, uploaded: false });
    await syncWeeks().catch(() => undefined);
    emitChange();
  };

  return (
    <section>
      <h2>A note in your own voice ({isoWeek})</h2>
      {existing && !draft && (
        <>
          <p className="quote">“{existing.text}”</p>
          <button className="link" onClick={remove}>
            Remove this note from the summary
          </button>
        </>
      )}
      {!existing && !draft && (
        <>
          <p className="muted">Your notes stay on this device. The on-device model can write a short, general note from them that you may add to your weekly summary. You see it first.</p>
          <button className="secondary" disabled={state === "working"} onClick={write}>
            {state === "working" ? "Writing on this device…" : "Suggest a note"}
          </button>
          {state === "nomodel" && <p className="muted">That needs the on-device model. No note is shared.</p>}
          {state === "notext" && <p className="muted">You wrote no notes this week.</p>}
        </>
      )}
      {draft && (
        <div className="stack">
          <ModelBadge ranOn={draft.ranOn} />
          <label className="stack">
            This exact text would be added to the summary:
            <textarea rows={3} maxLength={200} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </label>
          {problem && <p role="alert">{problem}</p>}
          <div className="row">
            <button className="primary" onClick={approve} disabled={!draft.text.trim()}>
              Add to my summary
            </button>
            <button className="secondary" onClick={() => setDraft(null)}>
              Don't add
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
