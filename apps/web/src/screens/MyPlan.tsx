import { db, getSingleton } from "../store/db";
import { useData } from "../ui/hooks";
import { Card, Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { getEngineState } from "../app/runtime";
import { DIRECTION_TEXT, featureLabel, ruleFeature } from "../app/labels";
import { HelpButton } from "./Home";
import { closeInbox, openInbox } from "../app/runtime";
import { useEffect, useState } from "react";
import { router } from "../inference";
import { ModelBadge } from "../ui/kit";

export function MyPlan() {
  const d = useData(async () => ({
    rules: await db.plan_rules.toArray(),
    items: await db.personal_items.toArray(),
    actions: await db.plan_actions.toArray(),
    state: await getEngineState(),
    source: await getSingleton(db.plan_source),
    last: (await db.day_records.orderBy("date").last()) ?? null,
  }));
  const [fit, setFit] = useState<{ ids: string[]; ranOn: "on_device" | "cloud" } | null>(null);
  // Task K: which of the user's own actions fit today. The model returns ids only; the user's
  // own text is shown (selection, not advice). Without a model all actions are shown.
  useEffect(() => {
    if (!d) return;
    const changed = d.state?.state === "ELEVATED" || d.state?.state === "CONFIRMED";
    const acts = d.actions.filter((a) => a.active);
    if (!changed || acts.length < 2 || fit) return;
    const ids = acts.map((a) => a.id);
    router()
      .run<{ action_ids: string[] }>("K", { today: d.last?.contributors.map((c) => c.phrase) ?? [], actions: acts.map((a) => ({ id: a.id, text: a.text })) }, { verify: { actionIds: ids } })
      .then((r) => r.ok && r.value.action_ids.length > 0 && setFit({ ids: r.value.action_ids, ranOn: r.ranOn }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.last?.date, d?.actions.length]);
  // Opening the plan closes the "your plan" reminder.
  useEffect(() => {
    openInbox().then((items) => items.filter((i) => i.type === "show_plan").forEach((i) => closeInbox(i.id)));
  }, []);
  if (!d) return <Screen title="Your plan">Loading…</Screen>;
  const changed = d.state?.state === "ELEVATED" || d.state?.state === "CONFIRMED";
  const actions = d.actions.filter((a) => a.active);
  return (
    <Screen title="Your plan">
      {changed && (
        <Card tone="warm">
          <strong>Your days look different from usual{d.last && d.last.contributors.length ? `: ${d.last.contributors.map((c) => c.phrase).join(", ")}` : ""}.</strong>
          <span>This is what you wrote down for a time like this.</span>
        </Card>
      )}
      {fit && (
        <>
          <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
            For today, from your own list <ModelBadge ranOn={fit.ranOn} />
          </h2>
          <ul className="plain-list">
            {fit.ids.map((id) => {
              const a = actions.find((x) => x.id === id);
              return a ? (
                <li key={id} className="item-text">
                  {a.text}
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}
      <h2>{fit ? "Everything you said helps" : "You said this helps"}</h2>
      {actions.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="plain-list">
        {actions.map((a) => (
          <li key={a.id} className="item-text" style={{ fontWeight: 500 }}>
            {a.text}
            <br />
            <small className="quote">in your words: “{a.quote}”</small>
          </li>
        ))}
      </ul>
      {d.state?.state === "CONFIRMED" && (
        <Card tone="plain">
          <strong>Talk it through with someone</strong>
          <span>You could share a summary with your GP or clinician.</span>
          <button className="link" onClick={() => navigate("share")}>
            Share a summary ›
          </button>
        </Card>
      )}
      <h2>Signs you watch for</h2>
      <ul className="plain-list">
        {d.rules.map((r) => (
          <li key={r.id}>
            {featureLabel(ruleFeature(r), d.state?.places)} {DIRECTION_TEXT[r.direction]} <small className="quote">(“{r.quote}”)</small>
          </li>
        ))}
        {d.items.map((i) => (
          <li key={i.id}>
            {i.question} <small className="quote">(“{i.quote}”)</small>
          </li>
        ))}
      </ul>
      <button className="secondary" onClick={() => navigate("plan_setup")}>
        Edit my plan
      </button>
      <HelpButton />
    </Screen>
  );
}
