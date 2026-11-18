import { useEffect, useState, type ReactNode } from "react";
import { cfg, currentReplay } from "../app/runtime";
import { savePlan, openSafety } from "../app/actions";
import { db, getSettings, getSingleton } from "../store/db";
import { navigate } from "../app/events";
import { router } from "../inference";
import { ModelBadge, Screen } from "../ui/kit";
import { DIRECTION_TEXT, featureLabel } from "../app/labels";
import { MicButton } from "../ui/Speech";
import { detectCrisis, verifyPlan, type VerifiedPlan, type PersonaPlace, type RuleDirection } from "@hearth/engine";

type Status = { kind: "idle" } | { kind: "working" } | { kind: "cards"; plan: VerifiedPlan; ranOn: "on_device" | "cloud" | "template"; dropped: number } | { kind: "fallback"; reason: string };

/**
 * Early signs that research on phone and wearable data links to low mood (docs/SOURCES.md:
 * mobility, rest-activity rhythm, sleep). Ticking one adds a card directly, without a model.
 */
export const SUGGESTED_SIGNS: { id: string; feature: string; direction: RuleDirection; text: string }[] = [
  { id: "sleep_more", feature: "rest_duration", direction: "higher", text: "I sleep or rest much longer than usual" },
  { id: "sleep_less", feature: "rest_duration", direction: "lower", text: "I sleep much less than usual" },
  { id: "bed_later", feature: "rest_midpoint", direction: "later", text: "I go to bed later and later" },
  { id: "sleep_irregular", feature: "rest_regularity", direction: "less_regular", text: "My sleep times get irregular" },
  { id: "move_less", feature: "steps", direction: "lower", text: "I move and walk less" },
  { id: "home_more", feature: "home_stay", direction: "higher", text: "I stay at home more" },
  { id: "fewer_places", feature: "places_visited", direction: "lower", text: "I go to fewer places" },
  { id: "days_shapeless", feature: "rhythm_stability", direction: "less_regular", text: "My days lose their structure" },
];
/** Common early signs no sensor can see: they become questions for the check-ins. */
export const SUGGESTED_ITEMS: { id: string; text: string; question: string }[] = [
  { id: "withdraw", text: "I pull back from people", question: "Did you have contact with someone you like today?" },
  { id: "enjoy", text: "I stop doing things I enjoy", question: "Did you do something you enjoy today?" },
  { id: "meals", text: "My eating becomes irregular", question: "Did you eat regular meals today?" },
];
/** Place-based signs for the form used when no model is available. */
const PLACE_SIGNS: { feature: string; direction: RuleDirection; text: string; place: string }[] = [
  { feature: "place_visits", direction: "lower", text: "I stop going to the gym", place: "gym" },
  { feature: "place_visits", direction: "lower", text: "I stop going to work", place: "work" },
];

/** Cards for the ticked suggestions; the quote is the suggestion's own text. */
export function suggestionPlan(picked: Set<string>): VerifiedPlan {
  return {
    rules: SUGGESTED_SIGNS.filter((x) => picked.has(x.id)).map((x) => ({ feature: x.feature, direction: x.direction, place_label: null, quote: x.text })),
    personal_checkin_items: SUGGESTED_ITEMS.filter((x) => picked.has(x.id)).map((x) => ({ question: x.question, quote: x.text })),
    actions: [],
    dropped: 0,
    valid: true,
  };
}

/** The model's cards plus ticked suggestions; a feature or question already found is not repeated. */
export function mergePlans(a: VerifiedPlan, b: VerifiedPlan): VerifiedPlan {
  const rules = [...a.rules];
  for (const r of b.rules) if (!rules.some((x) => x.feature === r.feature)) rules.push(r);
  const items = [...a.personal_checkin_items];
  for (const it of b.personal_checkin_items) if (!items.some((x) => x.question.toLowerCase() === it.question.toLowerCase())) items.push(it);
  return { ...a, rules, personal_checkin_items: items };
}

const SUGGESTION_TEXTS = new Set([...SUGGESTED_SIGNS.map((x) => x.text), ...SUGGESTED_ITEMS.map((x) => x.text)]);

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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manualPlaces, setManualPlaces] = useState<boolean[]>(PLACE_SIGNS.map(() => false));
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
    const ticked = suggestionPlan(picked);
    if (!text) {
      if (picked.size > 0) showCards(ticked, "template");
      return;
    }
    if (detectCrisis(text)) {
      await openSafety("keyword");
      return;
    }
    setStatus({ kind: "working" });
    const res = await router().run<VerifiedPlan>("G", { text }, { sourceText: text, verify: { sourceText: text, cfg } });
    if (res.ok) showCards(mergePlans(res.value, ticked), res.ranOn);
    else setStatus({ kind: "fallback", reason: res.reason });
  };

  /** "I don't know my signs yet": no personal signs; the research-based signals still run. */
  const skipSigns = async () => {
    await savePlan({ warning, helps }, emptyPlan(), { rules: [], items: [], actions: [] }, {});
    const s = await getSettings();
    navigate(first || !s.baselineDone ? "baseline_phq" : "my_plan");
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
    const ticked = suggestionPlan(picked);
    plan.rules.push(...ticked.rules);
    plan.personal_checkin_items.push(...ticked.personal_checkin_items);
    PLACE_SIGNS.forEach((m, i) => {
      if (manualPlaces[i]) plan.rules.push({ feature: m.feature, direction: m.direction, place_label: m.place, quote: m.text });
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
        <p className="muted">Each card shows where it came from: your own words, or a sign you ticked. Untick anything that is not right.</p>
        {status.dropped > 0 && (
          <p className="plan-note" role="status">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 5h0" /></svg>
            <span>Hearth left out {status.dropped === 1 ? "1 suggestion" : `${status.dropped} suggestions`} from the model that {status.dropped === 1 ? "was" : "were"} not in your own words.</span>
          </p>
        )}
        {plan.rules.length > 0 && <h2 className="plan-group">Signs Hearth can watch</h2>}
        {plan.rules.length > 0 && (
          <ul className="plan-list">
            {plan.rules.map((r, i) => {
              const title = `${r.feature === "place_visits" ? `Visits to the ${r.place_label}` : featureLabel(r.feature)} ${DIRECTION_TEXT[r.direction]}`;
              return (
                <PlanItem key={`r${i}`} title={title} kept={rulesOk[i]} onChange={(v) => toggle(rulesOk, setRulesOk, i, v)}>
                  <Origin quote={r.quote} />
                  {r.feature === "place_visits" && (
                    <label className="plan-place">
                      Your {r.place_label}
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
                </PlanItem>
              );
            })}
          </ul>
        )}
        {plan.personal_checkin_items.length > 0 && <h2 className="plan-group">Questions for your check-ins</h2>}
        {plan.personal_checkin_items.length > 0 && (
          <ul className="plan-list">
            {plan.personal_checkin_items.map((it, i) => (
              <PlanItem key={`i${i}`} title={it.question} kept={itemsOk[i]} onChange={(v) => toggle(itemsOk, setItemsOk, i, v)}>
                <Origin quote={it.quote} />
              </PlanItem>
            ))}
          </ul>
        )}
        {plan.actions.length > 0 && <h2 className="plan-group">What helps you</h2>}
        {plan.actions.length > 0 && (
          <ul className="plan-list">
            {plan.actions.map((a, i) => (
              <PlanItem key={`a${i}`} title={a.text} kept={actionsOk[i]} onChange={(v) => toggle(actionsOk, setActionsOk, i, v)}>
                <span className="quote">“{a.quote}”</span>
              </PlanItem>
            ))}
          </ul>
        )}
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
        <h2>Which of these happen when things start to slip?</h2>
        <SuggestionPicker picked={picked} onChange={setPicked} />
        {PLACE_SIGNS.map((m, i) => (
          <label className="toggle" key={m.text}>
            <span>{m.text}</span>
            <input type="checkbox" checked={manualPlaces[i]} onChange={(e) => setManualPlaces(manualPlaces.map((x, k) => (k === i ? e.target.checked : x)))} />
          </label>
        ))}
        <label className="stack">
          Other signs to ask about in check-ins (one per line, e.g. “Did you reply to messages today”)
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
      <p className="muted">
        Hearth already watches signals research links to harder periods. Your own signs make it sharper: write them, tick them, or both. It all stays on this device.
      </p>
      <label className="stack">
        <strong>When things start to slip, what do you, or the people close to you, notice first?</strong>
        <textarea rows={4} value={warning} onChange={(e) => setWarning(e.target.value)} placeholder="For example: I go to bed later and stop going to the gym…" />
      </label>
      <MicButton onText={(t) => setWarning((w) => (w ? `${w} ${t}` : t))} />
      <h2>Signs many people notice early</h2>
      <p className="muted">Research links these changes to harder periods. Tick any that fit you.</p>
      <SuggestionPicker picked={picked} onChange={setPicked} />
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
        <button className="primary" disabled={status.kind === "working" || !(warning.trim() || helps.trim() || picked.size > 0)} onClick={makeCards}>
          {status.kind === "working" ? "Reading on this device…" : "Make cards"}
        </button>
      </div>
      <div className="row">
        <button className="link" onClick={() => setStatus({ kind: "fallback", reason: "manual" })}>
          Fill it in by hand instead
        </button>
        <button className="link" onClick={skipSigns}>
          I don't know my signs yet
        </button>
      </div>
      <p className="muted">
        <small>Not sure? That's fine. Hearth notices changes from your usual days on its own, and you can add your signs later, ideally together with your GP or therapist.</small>
      </p>
    </Screen>
  );
}

/** One line of the plan: what it is, where it came from, and a tick to keep it (on by default). */
function PlanItem({ title, kept, onChange, children }: { title: string; kept: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <li className={`plan-item${kept ? "" : " is-off"}`}>
      <div className="plan-item-text">
        <strong>{title}</strong>
        {children}
        {!kept && <small className="plan-off">Not kept</small>}
      </div>
      <button className="keep-tick" role="switch" aria-checked={kept} aria-label={`Keep: ${title}`} onClick={() => onChange(!kept)}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      </button>
    </li>
  );
}

/** Task G2: photograph a paper plan; the on-device model transcribes it for correction. The photo is not stored. */
function ScanPlan({ onText }: { onText: (t: string) => void }) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "failed">("idle");
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="file-btn">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5h2.5L6 3.5h4l1.5 2H14V13H2z" /><circle cx="8" cy="9" r="2.3" /></svg>
        <span>Scan a paper plan</span>
        <input
          className="visually-hidden"
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

/** Shows where a card came from: the user's own words, or a suggestion they ticked. */
function Origin({ quote }: { quote: string }) {
  if (SUGGESTION_TEXTS.has(quote)) return <span className="muted">Suggested sign you ticked: {quote}</span>;
  return <span className="quote">“{quote}”</span>;
}

function SuggestionPicker({ picked, onChange }: { picked: Set<string>; onChange: (update: (prev: Set<string>) => Set<string>) => void }) {
  // Functional update, so quick taps in a row never overwrite each other.
  const toggle = (id: string) =>
    onChange((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <small>Hearth can measure these</small>
      <div className="chips" role="group" aria-label="Signs Hearth can measure">
        {SUGGESTED_SIGNS.map((x) => (
          <button key={x.id} type="button" aria-pressed={picked.has(x.id)} onClick={() => toggle(x.id)}>
            {x.text}
          </button>
        ))}
      </div>
      <small>Asked in your check-ins</small>
      <div className="chips" role="group" aria-label="Signs to ask about in check-ins">
        {SUGGESTED_ITEMS.map((x) => (
          <button key={x.id} type="button" aria-pressed={picked.has(x.id)} onClick={() => toggle(x.id)}>
            {x.text}
          </button>
        ))}
      </div>
    </div>
  );
}
