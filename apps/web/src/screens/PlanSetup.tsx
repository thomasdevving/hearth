import { useEffect, useState } from "react";
import { cfg, currentReplay } from "../app/runtime";
import { savePlan, openSafety } from "../app/actions";
import { db, getSettings, getSingleton } from "../store/db";
import { navigate } from "../app/events";
import { router } from "../inference";
import { Card, ModelBadge, Screen } from "../ui/kit";
import { DIRECTION_TEXT, featureLabel } from "../app/labels";
import { MicButton } from "../ui/Speech";
import { detectCrisis, verifyPlan, type VerifiedPlan, type PersonaPlace, type RuleDirection } from "@baseline/engine";

type Status = { kind: "idle" } | { kind: "working" } | { kind: "cards"; plan: VerifiedPlan; ranOn: "on_device" | "cloud" | "template"; dropped: number } | { kind: "fallback"; reason: string };

/** The signs that can be measured, for the form used when no model is available. */
const MANUAL_SIGNS: { feature: string; direction: RuleDirection; text: string; place?: string }[] = [
  { feature: "rest_midpoint", direction: "later", text: "I go to bed later" },
  { feature: "rest_duration", direction: "higher", text: "I rest much longer" },
  { feature: "rest_regularity", direction: "less_regular", text: "My rest times get irregular" },
  { feature: "home_stay", direction: "higher", text: "I stay at home more" },
  { feature: "steps", direction: "lower", text: "I move less" },
  { feature: "places_visited", direction: "lower", text: "I go to fewer places" },
  { feature: "place_visits", direction: "lower", text: "I stop going to the gym", place: "gym" },
  { feature: "place_visits", direction: "lower", text: "I stop going to work", place: "work" },
];

function emptyPlan(): VerifiedPlan {
  return { rules: [], personal_checkin_items: [], actions: [], dropped: 0, valid: true };
}

export function PlanSetup({ params }: { params: Record<string, string> }) {
  const first = params.first === "1";
  const [warning, setWarning] = useState("");
  const [helps, setHelps] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [rulesOk, setRulesOk] = useState<boolean[]>([]);
  const [itemsOk, setItemsOk] = useState<boolean[]>([]);
  const [actionsOk, setActionsOk] = useState<boolean[]>([]);
  const [places, setPlaces] = useState<PersonaPlace[]>([]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [scripted, setScripted] = useState<{ text: string; expected: unknown; places?: Record<string, string> } | null>(null);
  // fallback form
  const [manualSigns, setManualSigns] = useState<boolean[]>(MANUAL_SIGNS.map(() => false));
  const [manualItems, setManualItems] = useState("");
  const [manualActions, setManualActions] = useState("");

  useEffect(() => {
    (async () => {
      const src = await getSingleton(db.plan_source);
      if (src) {
        setWarning(src.warning);
        setHelps(src.helps);
      }
      const data = await currentReplay();
      setPlaces(data?.places.filter((p) => !["hotel", "beach", "old town", "market"].includes(p.label)) ?? []);
      const ev = data?.script.find((e) => e.type === "plan_text");
      if (ev && ev.type === "plan_text") setScripted({ text: ev.text, expected: ev.expected, places: ev.places });
    })();
  }, []);

  const showCards = (plan: VerifiedPlan, ranOn: "on_device" | "cloud" | "template") => {
    setRulesOk(plan.rules.map(() => true));
    setItemsOk(plan.personal_checkin_items.map(() => true));
    setActionsOk(plan.actions.map(() => true));
    const p: Record<number, string> = {};
    plan.rules.forEach((r, i) => {
      if (r.place_label) {
        const label = scripted?.places?.[r.place_label] ?? r.place_label;
        if (places.some((x) => x.label === label)) p[i] = label;
      }
    });
    setPicks(p);
    setStatus({ kind: "cards", plan, ranOn, dropped: plan.dropped });
  };

  const makeCards = async () => {
    const text = [warning.trim(), helps.trim()].filter(Boolean).join("\n");
    if (!text) return;
    if (detectCrisis(text)) {
      await openSafety("keyword");
      return;
    }
    setStatus({ kind: "working" });
    const res = await router().run<VerifiedPlan>("G", { text }, { sourceText: text, verify: { sourceText: text, cfg } });
    if (res.ok) showCards(res.value, res.ranOn);
    else setStatus({ kind: "fallback", reason: res.reason });
  };

  const save = async (plan: VerifiedPlan, choices: { rules: boolean[]; items: boolean[]; actions: boolean[] }) => {
    const coords: Record<number, { lat: number; lon: number } | null> = {};
    plan.rules.forEach((_, i) => {
      const p = places.find((x) => x.label === picks[i]);
      coords[i] = p ? { lat: p.lat, lon: p.lon } : null;
    });
    await savePlan({ warning, helps }, plan, choices, coords);
    const s = await getSettings();
    navigate(first || !s.baselineDone ? "baseline_phq" : "my_plan");
  };

  const saveManual = async () => {
    const plan = emptyPlan();
    MANUAL_SIGNS.forEach((m, i) => {
      if (manualSigns[i]) plan.rules.push({ feature: m.feature, direction: m.direction, place_label: m.place ?? null, quote: m.text });
    });
    for (const q of manualItems.split("\n").map((x) => x.trim()).filter(Boolean)) plan.personal_checkin_items.push({ question: q.endsWith("?") ? q : `${q}?`, quote: q });
    for (const a of manualActions.split("\n").map((x) => x.trim()).filter(Boolean)) plan.actions.push({ text: a, quote: a });
    plan.rules.forEach((r, i) => {
      if (r.place_label && places.some((p) => p.label === r.place_label)) picks[i] = r.place_label;
    });
    await save(plan, { rules: plan.rules.map(() => true), items: plan.personal_checkin_items.map(() => true), actions: plan.actions.map(() => true) });
  };

  if (status.kind === "cards") {
    const { plan } = status;
    const toggle = (arr: boolean[], set: (v: boolean[]) => void, i: number, v: boolean) => set(arr.map((x, k) => (k === i ? v : x)));
    return (
      <Screen title="Your plan as cards" badge={<ModelBadge ranOn={status.ranOn} />}>
        <p className="muted">Each card comes from your own words (the quote). Keep the ones that are right.{status.dropped > 0 ? ` ${status.dropped} suggestion(s) were removed because they were not in your text.` : ""}</p>
        {plan.rules.length > 0 && <h2>Signs Baseline can watch</h2>}
        {plan.rules.map((r, i) => (
          <Card key={`r${i}`} tone={rulesOk[i] ? "accent" : "plain"}>
            <strong>
              {r.feature === "place_visits" ? `Visits to the ${r.place_label}` : featureLabel(r.feature)} {DIRECTION_TEXT[r.direction]}
            </strong>
            <span className="quote">“{r.quote}”</span>
            {r.feature === "place_visits" && (
              <label>
                Which place is your {r.place_label}?{" "}
                <select value={picks[i] ?? ""} onChange={(e) => setPicks({ ...picks, [i]: e.target.value })} aria-label={`Pick the place for ${r.place_label}`}>
                  <option value="">Choose…</option>
                  {places.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Decide value={rulesOk[i]} onChange={(v) => toggle(rulesOk, setRulesOk, i, v)} />
          </Card>
        ))}
        {plan.personal_checkin_items.length > 0 && <h2>Questions for your check-ins</h2>}
        {plan.personal_checkin_items.map((it, i) => (
          <Card key={`i${i}`} tone={itemsOk[i] ? "accent" : "plain"}>
            <strong>{it.question}</strong>
            <span className="quote">“{it.quote}”</span>
            <Decide value={itemsOk[i]} onChange={(v) => toggle(itemsOk, setItemsOk, i, v)} />
          </Card>
        ))}
        {plan.actions.length > 0 && <h2>What helps you</h2>}
        {plan.actions.map((a, i) => (
          <Card key={`a${i}`} tone={actionsOk[i] ? "accent" : "plain"}>
            <strong>{a.text}</strong>
            <span className="quote">“{a.quote}”</span>
            <Decide value={actionsOk[i]} onChange={(v) => toggle(actionsOk, setActionsOk, i, v)} />
          </Card>
        ))}
        {plan.rules.length + plan.personal_checkin_items.length + plan.actions.length === 0 && <p>No cards came out of this text. You can add them by hand.</p>}
        <div className="row">
          <button className="secondary" onClick={() => setStatus({ kind: "idle" })}>
            Edit my text
          </button>
          <button className="primary" onClick={() => save(plan, { rules: rulesOk, items: itemsOk, actions: actionsOk })}>
            Save these cards
          </button>
        </div>
      </Screen>
    );
  }

  if (status.kind === "fallback") {
    return (
      <Screen title="Your plan">
        <p>The on-device model is not available, so let's do this by hand. Nothing you type leaves this device.</p>
        <h2>Which of these happen when a dip starts?</h2>
        {MANUAL_SIGNS.map((m, i) => (
          <label className="toggle" key={m.text}>
            <span>{m.text}</span>
            <input type="checkbox" checked={manualSigns[i]} onChange={(e) => setManualSigns(manualSigns.map((x, k) => (k === i ? e.target.checked : x)))} />
          </label>
        ))}
        <label className="stack">
          Signs to ask about in check-ins (one per line, e.g. “Did you eat well today”)
          <textarea rows={3} value={manualItems} onChange={(e) => setManualItems(e.target.value)} />
        </label>
        <label className="stack">
          What helps you (one per line)
          <textarea rows={3} value={manualActions} onChange={(e) => setManualActions(e.target.value)} />
        </label>
        <div className="row">
          {scripted && (
            <button className="secondary" onClick={() => showCards(verifyPlan(scripted.expected, scripted.text, cfg), "template")}>
              Use Sam's confirmed cards
            </button>
          )}
          <button className="primary" onClick={saveManual}>
            Save
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Your plan" back={first ? undefined : "my_plan"}>
      <p className="muted">In your own words. Baseline turns them into signs it can watch, questions for your check-ins, and the things that help you. It all stays on this device.</p>
      <label className="stack">
        <strong>How does a dip start for you?</strong>
        <textarea rows={4} value={warning} onChange={(e) => setWarning(e.target.value)} placeholder="For example: I go to bed later and stop going to the gym…" />
      </label>
      <MicButton onText={(t) => setWarning((w) => (w ? `${w} ${t}` : t))} />
      <label className="stack">
        <strong>What helps when that happens?</strong>
        <textarea rows={3} value={helps} onChange={(e) => setHelps(e.target.value)} placeholder="For example: calling my sister…" />
      </label>
      <MicButton onText={(t) => setHelps((h) => (h ? `${h} ${t}` : t))} />
      <ScanPlan onText={(t) => setWarning((w) => (w ? `${w}\n${t}` : t))} />
      <div className="row">
        {scripted && (
          <button
            className="secondary"
            onClick={() => {
              setWarning(scripted.text);
              setHelps("");
            }}
          >
            Use Sam's words
          </button>
        )}
        <button className="primary" disabled={status.kind === "working" || !(warning.trim() || helps.trim())} onClick={makeCards}>
          {status.kind === "working" ? "Reading on this device…" : "Make cards"}
        </button>
      </div>
      <button className="link" onClick={() => setStatus({ kind: "fallback", reason: "manual" })}>
        Fill it in by hand instead
      </button>
    </Screen>
  );
}

function Decide({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row" role="group" aria-label="Keep this card?">
      <button aria-pressed={value} className={value ? "primary" : "secondary"} onClick={() => onChange(true)}>
        Keep
      </button>
      <button aria-pressed={!value} className={!value ? "primary" : "secondary"} onClick={() => onChange(false)}>
        Not right
      </button>
    </div>
  );
}

/** Task G2: photograph a paper plan; the on-device model transcribes it for correction. The photo is not stored. */
function ScanPlan({ onText }: { onText: (t: string) => void }) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "failed">("idle");
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="secondary" style={{ display: "inline-block" }}>
        <span>Already have a written plan? Scan a photo of it: </span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Photo of a paper plan"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setState("reading");
            const data = await new Promise<string>((res) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result).split(",")[1] ?? "");
              r.readAsDataURL(f);
            });
            const res = await router().run<{ text: string }>("G2", { instruction: "Transcribe the text in the image." }, { image: { mimeType: f.type || "image/jpeg", data } });
            if (res.ok) {
              onText(res.value.text);
              setState("done");
            } else setState("failed");
          }}
        />
      </label>
      {state === "reading" && <small>Reading the photo on this device…</small>}
      {state === "done" && <small>Check the text above and correct it before making cards. The photo was not kept.</small>}
      {state === "failed" && <small>The photo could not be read on this device. Please type the plan instead.</small>}
    </div>
  );
}
