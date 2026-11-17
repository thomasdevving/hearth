import { useState } from "react";
import { db, getSingleton } from "../store/db";
import { getEngineState, getMeta, openInbox } from "../app/runtime";
import { useData } from "../ui/hooks";
import { Card, Screen, Sparkline } from "../ui/kit";
import { STATE_LABEL, STATE_TEXT, featureLabel, formatValue, ruleFeature, CONTEXT_LABEL, prettyDate } from "../app/labels";
import { navigate } from "../app/events";
import { openSafety, submitNote, skipNote } from "../app/actions";
import type { InboxItem } from "../store/db";

export function HelpButton() {
  return (
    <button className="help-now" onClick={() => openSafety("button")}>
      I need help now
    </button>
  );
}

function InboxCard({ item }: { item: InboxItem }) {
  switch (item.type) {
    case "checkin":
      return (
        <Card tone="accent" onClick={() => navigate("checkin", { id: item.checkinId })} label="Open check-in">
          <strong>Check-in ready</strong>
          <span>Three quick questions, about 20 seconds.</span>
        </Card>
      );
    case "questionnaire":
      return (
        <Card tone="accent" onClick={() => navigate("questionnaire", { instrument: item.instrument })} label={`Open ${item.instrument}`}>
          <strong>{item.instrument === "PHQ2" ? "Two short questions" : "A short questionnaire (9 questions)"}</strong>
          <span>About the last two weeks.</span>
        </Card>
      );
    case "context_confirm":
      return (
        <Card tone="warm" onClick={() => navigate("context_confirm", { id: item.id })} label="Confirm what is going on">
          <strong>{item.context.type ? `${CONTEXT_LABEL[item.context.type] ?? item.context.type}?` : "Is something changing your routine?"}</strong>
          <span>One tap to confirm. Nothing changes until you do.</span>
        </Card>
      );
    case "context_expired":
      return (
        <Card tone="warm" onClick={() => navigate("context_confirm", { id: item.id })} label="Does this still apply">
          <strong>Does your earlier note still apply?</strong>
          <span>It ended yesterday. Tap to extend it or leave it.</span>
        </Card>
      );
    case "show_plan":
      return (
        <Card tone="warm" onClick={() => navigate("my_plan")} label="Open your plan">
          <strong>Your plan</strong>
          <span>You wrote down what helps. Have a look.</span>
        </Card>
      );
    case "upload_preview":
      return (
        <Card tone="plain" onClick={() => navigate("weekly", { preview: item.isoWeek })} label="Review the weekly summary">
          <strong>Review what would be shared</strong>
          <span>Your first weekly summary is ready. Nothing is sent until you confirm.</span>
        </Card>
      );
    case "note":
      return <NoteSuggestion item={item} />;
  }
}

function NoteSuggestion({ item }: { item: Extract<InboxItem, { type: "note" }> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card tone="warm">
      <strong>Sam writes a note today</strong>
      <q>{item.text}</q>
      <div className="row">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await submitNote(item.text, { inboxId: item.id, expectedContext: item.expectedContext });
            setBusy(false);
          }}
        >
          Use scripted note
        </button>
        <button className="secondary" disabled={busy} onClick={() => skipNote(item.id)}>
          Skip
        </button>
      </div>
    </Card>
  );
}

function NoteBox() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="note-box"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        await submitNote(text);
        setText("");
        setBusy(false);
      }}
    >
      <label htmlFor="note">Anything different this week?</label>
      <textarea id="note" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: visitors until Sunday" />
      <button className="secondary" disabled={busy || !text.trim()}>
        {busy ? "Saving…" : "Add note"}
      </button>
      <small>Stays on this device. Read by the on-device model only.</small>
    </form>
  );
}

export function Home() {
  const data = useData(async () => {
    const [meta, state, inbox, rules, records, contexts] = await Promise.all([getMeta(), getEngineState(), openInbox(), db.plan_rules.toArray(), db.day_records.orderBy("date").toArray(), db.contexts.toArray()]);
    const plan = await getSingleton(db.plan_source);
    return { meta, state, inbox, rules, records, contexts, plan };
  });
  const [why, setWhy] = useState(false);
  if (!data || !data.meta) return <Screen title="Today">Loading…</Screen>;
  const { state, inbox, rules, records, contexts } = data;
  const last = records[records.length - 1];
  const st = last?.state ?? state?.state ?? "WARM_UP";
  const recent = records.slice(-28);
  const today = data.meta.today;
  const active = contexts.filter((c) => c.confirmed && c.start <= today && today <= c.end);
  return (
    <Screen title="Today">
      <div className={`state-badge state-${st.toLowerCase()}`} role="status">
        <span className="dot" aria-hidden />
        <div>
          <strong>{STATE_LABEL[st]}</strong>
          <p>{STATE_TEXT[st]}</p>
          {(st === "ELEVATED" || st === "CONFIRMED") && last && (
            <button className="link" onClick={() => setWhy(!why)} aria-expanded={why}>
              Why?
            </button>
          )}
          {why && last && (
            <ul className="why">
              {last.contributors.length === 0 && <li>A small change across several signals.</li>}
              {last.contributors.map((c) => (
                <li key={c.feature}>{c.phrase}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {active.length > 0 && (
        <p className="context-note">
          {active.map((c) => `${CONTEXT_LABEL[c.type] ?? c.type} until ${prettyDate(c.end)}`).join(" · ")}
          {active.some((c) => c.kind === "explains_sensors") ? " — the affected signals are set aside." : ""}
        </p>
      )}
      {inbox.length > 0 && (
        <div className="stack" aria-label="Things for today">
          {inbox.map((i) => (
            <InboxCard key={i.id} item={i} />
          ))}
        </div>
      )}
      {inbox.length === 0 && <p className="muted">Nothing to do today.</p>}

      <h2>Your signals</h2>
      {rules.length === 0 && (
        <p className="muted">
          No personal signals yet. <button className="link" onClick={() => navigate("plan_setup")}>Set up your plan</button>
        </p>
      )}
      <ul className="signals">
        {rules
          .filter((r) => r.active)
          .map((r) => {
            const f = ruleFeature(r);
            const values = recent.map((x) => x.features.values[f] ?? null);
            const lastV = values[values.length - 1];
            return (
              <li key={r.id}>
                <div>
                  <strong>{featureLabel(f, state?.places)}</strong>
                  <small>“{r.quote}”</small>
                </div>
                <Sparkline values={values} label={featureLabel(f, state?.places)} />
                <span className="value">{formatValue(f, lastV)}</span>
              </li>
            );
          })}
      </ul>
      <div className="row">
        <button className="link" onClick={() => navigate("trends")}>
          See all trends ›
        </button>
        <button className="link" onClick={() => navigate("weekly")}>
          Weekly reflection ›
        </button>
      </div>
      <NoteBox />
      <HelpButton />
    </Screen>
  );
}
