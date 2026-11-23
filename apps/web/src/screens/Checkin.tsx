import { useEffect, useState, useSyncExternalStore } from "react";
import { getModelStatus, onModelStatus } from "../inference/status";
import { MOMENTARY_ITEMS, scriptedCheckin, type CheckinRecord, type PersonalAnswer, type PersonalItem } from "@hearth/engine";
import { db } from "../store/db";
import { ModelBadge, Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { router } from "../inference";
import { completeCheckin, skipCheckin } from "../app/actions";
import { currentReplay, getMeta, openInbox } from "../app/runtime";
import { INTRO_FIXED, INTRO_RANDOM, INTRO_TRIGGERED } from "../app/templates";
import { MicButton } from "../ui/Speech";
import { notesFor, recallFromText, userSigns, type Recall, type Sign } from "../app/helped";
import type { HelpedNote } from "../store/db";
import { HelpedCard } from "../ui/HelpedCard";
import { SupportCard } from "../ui/SupportCard";

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
  // Task I needs the on-device model: without one the button would only say so after a tap.
  const onDevice = useSyncExternalStore(onModelStatus, getModelStatus).onDevice;
  const modelMayRun = onDevice !== "unavailable" && onDevice !== "no_api";
  const [who, setWho] = useState<string>("");
  const [pAns, setPAns] = useState<Record<string, PersonalAnswer>>({});
  const [text, setText] = useState("");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState<"idle" | "working" | "done" | "none">("idle");
  const [done, setDone] = useState<string | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);
  const [support, setSupport] = useState(false);
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
        {support && <SupportCard />}
        <p>{done}</p>
        {recall && !support && <RecallBlock recall={recall} />}
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
    setSupport(res.support);
    // "What helped me last time": recall by meaning, on this device, from what was just written.
    setRecall(a.freeText?.trim() ? await recallFromText(a.freeText) : { matches: [], ranOn: "none" });
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
              <button key={v} role="radio" aria-checked={vals[s.id] === v} aria-pressed={vals[s.id] === v} onClick={() => setVals((prev) => ({ ...prev, [s.id]: v }))}>
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
              <button key={a} role="radio" aria-checked={pAns[p.id] === a} aria-pressed={pAns[p.id] === a} onClick={() => setPAns((prev) => ({ ...prev, [p.id]: a }))}>
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
        <MicButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} label="Talk" />
        {personal.length > 0 && text.trim().length > 0 && modelMayRun && (
          <button
            className="secondary"
            disabled={prefill === "working"}
            onClick={async () => {
              // Task I: only the personal items are read from the text; the three momentary
              // items and questionnaires are always tapped (R1). Answers are shown and editable.
              setPrefill("working");
              const res = await router().run<{ answers: { item_id: string; answer: string }[] }>("I", { text, items: personal.map((p) => ({ item_id: p.id, question: p.question })) }, { sourceText: text, verify: { sourceText: text, itemIds: personal.map((p) => p.id) } });
              if (res.ok) {
                const next = { ...pAns };
                for (const a of res.value.answers) if (a.answer === "yes" || a.answer === "partly" || a.answer === "no") next[a.item_id] = a.answer;
                setPAns(next);
                setPrefill("done");
              } else setPrefill("none");
            }}
          >
            Fill in my questions from what I said
          </button>
        )}
      </div>
      {prefill === "done" && <small>Your own questions were filled in from your words. Check them before saving.</small>}
      {prefill === "none" && <small>That needs the on-device model. Please tap your answers.</small>}
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
            className="demo-btn"
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
            Sam's answers
          </button>
        )}
      </div>
      {!complete && !busy && <small className="disabled-why">Answer the three scales and who you are with, then you can save.</small>}
    </Screen>
  );
}

/**
 * After a check-in: if the text sounds like one of the user's own signs, ask, and on yes show
 * what helped them last time. Without a match, the user can pick a sign (only when notes exist).
 */
function RecallBlock({ recall }: { recall: Recall }) {
  const [signs, setSigns] = useState<Sign[]>([]);
  const [withNotes, setWithNotes] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [notes, setNotes] = useState<HelpedNote[] | null>(null);
  useEffect(() => {
    (async () => {
      const s = await userSigns();
      setSigns(s);
      const has = new Set<string>();
      for (const sg of s) if ((await notesFor(sg.quote)).length) has.add(sg.quote);
      setWithNotes(has);
    })();
  }, []);
  const choose = async (quote: string) => {
    setChosen(quote);
    setNotes(await notesFor(quote));
  };
  const match = recall.matches[0];
  if (chosen && notes)
    return (
      <>
        {notes.length > 0 ? (
          notes.map((n) => <HelpedCard key={n.id} note={n} signQuote={chosen} />)
        ) : (
          <div className="recall-ask">
            <p>Nothing saved for “{chosen}” yet. When things are steadier, you can save what helped.</p>
            <button className="link" onClick={() => navigate("helped_new", { sign: chosen })}>
              Save what helped ›
            </button>
          </div>
        )}
      </>
    );
  if (match && !dismissed)
    return (
      <div className="recall-ask" role="group" aria-label="One of your signs?">
        <div className="recall-head">
          <strong>That sounds like one of your signs</strong>
          <ModelBadge ranOn={recall.ranOn === "none" ? "template" : recall.ranOn} />
        </div>
        <p>
          You wrote “{match.quote}”. You once named this sign: <strong>“{match.sign.quote}”</strong>. Is that right?
        </p>
        <div className="row">
          <button className="primary" onClick={() => choose(match.sign.quote)}>
            Yes, that's it
          </button>
          <button className="secondary" onClick={() => setDismissed(true)}>
            Not quite
          </button>
        </div>
      </div>
    );
  if (withNotes.size === 0) return null;
  return (
    <div className="recall-ask" role="group" aria-label="Do any of your signs feel true right now?">
      <p>
        <strong>Do any of your signs feel true right now?</strong>
      </p>
      <div className="chips">
        {signs.map((s) => (
          <button key={s.quote} type="button" onClick={() => choose(s.quote)}>
            “{s.quote}”
          </button>
        ))}
      </div>
    </div>
  );
}
