import { useEffect, useState } from "react";
import { MOMENTARY_ITEMS, scriptedCheckin, type CheckinRecord, type PersonalAnswer, type PersonalItem } from "@baseline/engine";
import { db } from "../store/db";
import { ModelBadge, Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { router } from "../inference";
import { completeCheckin, skipCheckin } from "../app/actions";
import { currentReplay, getMeta, openInbox } from "../app/runtime";
import { INTRO_FIXED, INTRO_RANDOM, INTRO_TRIGGERED } from "../app/templates";

type Scale = { id: "mood_low" | "enjoyment" | "energy"; text: string; min: number; max: number; min_label: string; max_label: string };
const items = MOMENTARY_ITEMS.items;
const scales = items.filter((i) => i.type === "scale") as unknown as Scale[];
const company = items.find((i) => i.id === "company") as unknown as { text: string; options: string[] };

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

export function Checkin({ params }: { params: Record<string, string> }) {
  const [rec, setRec] = useState<CheckinRecord | null>(null);
  const [personal, setPersonal] = useState<PersonalItem[]>([]);
  const [intro, setIntro] = useState<{ text: string; ranOn: "on_device" | "cloud" | "template" } | null>(null);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [who, setWho] = useState<string>("");
  const [pAns, setPAns] = useState<Record<string, PersonalAnswer>>({});
  const [text, setText] = useState("");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [script, setScript] = useState<{ answers: Record<string, number | string>; personal: Record<string, PersonalAnswer>; freeText: string | null; expectedContext?: unknown } | null>(null);

  useEffect(() => {
    (async () => {
      const r = (await db.checkins.get(params.id)) ?? null;
      setRec(r);
      setPersonal((await db.personal_items.toArray()).filter((p) => p.active));
      if (!r) return;
      const data = await currentReplay();
      const ev = data ? scriptedCheckin(data.script, r.scheduledAt.slice(0, 10)) : null;
      const meta = await getMeta();
      if (ev && ev.type === "checkin_answer") setScript({ answers: ev.answers, personal: ev.personal, freeText: ev.freeText && !meta?.notesHandled.includes(ev.date) ? ev.freeText : null, expectedContext: ev.expectedContext });
      // Task A only for a triggered check-in; a random one uses the fixed sentence without a model.
      if (r.kind === "triggered" && r.reasons.length > 0) {
        const input = { contributors: r.reasons.slice(0, 2).map((c) => c.phrase), partOfDay: partOfDay() };
        const res = await router().run<{ intro: string }>("A", input);
        setIntro(res.ok ? { text: res.value.intro, ranOn: res.ranOn } : { text: INTRO_TRIGGERED, ranOn: "template" });
      } else setIntro({ text: r.kind === "fixed" ? INTRO_FIXED : r.kind === "triggered" ? INTRO_TRIGGERED : INTRO_RANDOM, ranOn: "template" });
    })();
  }, [params.id]);

  if (!rec) return <Screen title="Check-in" back="home">This check-in is no longer open.</Screen>;
  if (done)
    return (
      <Screen title="Thanks">
        <p>{done}</p>
        <button className="primary" onClick={async () => navigate((await openInbox()).some((i) => i.type === "context_confirm") ? "home" : "home")}>
          Back to today
        </button>
      </Screen>
    );
  const complete = scales.every((s) => vals[s.id] !== undefined) && who !== "";
  const submit = async (a: { answers: { mood_low: number; enjoyment: number; energy: number; company: string }; personal: Record<string, PersonalAnswer>; freeText: string | null }, expectedContext?: unknown) => {
    setBusy(true);
    const res = await completeCheckin(rec.id, a, { expectedContext });
    setBusy(false);
    if (res.safety) return;
    const after = rec.kind === "triggered" ? `This check-in came because some of your signals changed: ${rec.reasons.map((r) => r.phrase).join("; ") || "a small change across several signals"}.` : rec.kind === "fixed" ? "This was your regular check-in." : "This was a random check-in. They help you see later whether the app's questions are useful for you.";
    setDone(`${after}${res.offerPhq2 ? " Two short questions are waiting on the home screen." : ""}`);
  };
  return (
    <Screen title="Check-in" back="home" badge={intro ? <ModelBadge ranOn={intro.ranOn} /> : undefined}>
      <p className="item-text">{intro?.text ?? "…"}</p>
      <button className="link" onClick={() => setWhy(!why)} aria-expanded={why}>
        Why am I being asked?
      </button>
      {why && <p className="muted">Sometimes I ask at random, sometimes because your pattern changed. I'll tell you which one after you answer, so it doesn't colour your answer.</p>}
      {scales.map((s) => (
        <fieldset key={s.id} className="stack" style={{ border: "none", padding: 0 }}>
          <legend className="item-text" style={{ fontSize: "1rem" }}>
            {s.text}
          </legend>
          <div className="scale" role="radiogroup" aria-label={s.text}>
            {Array.from({ length: s.max - s.min + 1 }, (_, k) => s.min + k).map((v) => (
              <button key={v} role="radio" aria-checked={vals[s.id] === v} aria-pressed={vals[s.id] === v} onClick={() => setVals({ ...vals, [s.id]: v })}>
                {v}
              </button>
            ))}
          </div>
          <div className="scale-labels">
            <span>{s.min_label}</span>
            <span>{s.max_label}</span>
          </div>
        </fieldset>
      ))}
      <p className="item-text" style={{ fontSize: "1rem" }}>
        {company.text}
      </p>
      <div className="chips" role="radiogroup" aria-label={company.text}>
        {company.options.map((o) => (
          <button key={o} role="radio" aria-checked={who === o} aria-pressed={who === o} onClick={() => setWho(o)}>
            {o}
          </button>
        ))}
      </div>
      {personal.length > 0 && <h2>Your own questions</h2>}
      {personal.map((p) => (
        <div key={p.id} className="stack" style={{ gap: 4 }}>
          <span>{p.question}</span>
          <div className="chips" role="radiogroup" aria-label={p.question}>
            {(["yes", "partly", "no"] as PersonalAnswer[]).map((a) => (
              <button key={a} role="radio" aria-checked={pAns[p.id] === a} aria-pressed={pAns[p.id] === a} onClick={() => setPAns({ ...pAns, [p.id]: a })}>
                {a}
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="stack">
        {MOMENTARY_ITEMS.free_text_prompt}
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <small>Stays on this device.</small>
      </label>
      <div className="row">
        <button className="primary" disabled={!complete || busy} onClick={() => submit({ answers: { mood_low: vals.mood_low, enjoyment: vals.enjoyment, energy: vals.energy, company: who }, personal: pAns, freeText: text || null })}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            await skipCheckin(rec.id);
            navigate("home");
          }}
        >
          Not today
        </button>
        {script && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              submit(
                {
                  answers: script.answers as { mood_low: number; enjoyment: number; energy: number; company: string },
                  personal: Object.fromEntries(personal.map((p) => [p.id, script.personal[p.question] ?? "yes"])),
                  freeText: script.freeText,
                },
                script.expectedContext,
              )
            }
          >
            Use scripted answer
          </button>
        )}
      </div>
    </Screen>
  );
}
