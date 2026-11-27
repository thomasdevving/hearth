import { useState } from "react";
import { db, getSettings, getSingleton, updateSettings, type HelpedNote, type Settings } from "../store/db";
import type { DayRecord } from "@hearth/engine";
import { closeInbox, getEngineState, getMeta, openInbox } from "../app/runtime";
import { SupportCard } from "../ui/SupportCard";
import { CallAFriend } from "../ui/CallAFriend";
import { getPeople } from "../app/people";
import { useData } from "../ui/hooks";
import { Card, Screen, Sparkline } from "../ui/kit";
import { STATE_LABEL, STATE_TEXT, featureLabel, formatValue, ruleFeature, CONTEXT_LABEL, prettyDate } from "../app/labels";
import { emitChange, navigate } from "../app/events";
import { openSafety, submitNote, skipNote } from "../app/actions";
import type { InboxItem } from "../store/db";

export function HelpButton() {
  return (
    <button className="help-now" onClick={() => openSafety("button")}>
      I need help now
    </button>
  );
}

/** docs/04 §7.5: the PHQ-2 offered because more check-ins than usual went unanswered. */
export const UNANSWERED_LINE = "You've answered fewer check-ins than usual lately. That can just be a busy time. These two are about the last two weeks.";

function InboxCard({ item }: { item: InboxItem }) {
  switch (item.type) {
    case "checkin":
      return (
        <Card tone="accent" onClick={() => navigate("checkin", { id: item.checkinId })} label="Open check-in">
          <strong>Check-in ready</strong>
          <span>Three quick questions, about 20 seconds.</span>
          <span className="card-cta" aria-hidden="true">Start check-in</span>
        </Card>
      );
    case "questionnaire":
      return (
        <Card tone="accent" onClick={() => navigate("questionnaire", { instrument: item.instrument })} label={`Open ${item.instrument}`}>
          <strong>{item.instrument === "PHQ2" ? "Two short questions" : "A short questionnaire (9 questions)"}</strong>
          <span>{item.reason === "unanswered" ? UNANSWERED_LINE : "About the last two weeks."}</span>
          <span className="card-cta" aria-hidden="true">Start</span>
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
    case "support":
      return (
        <SupportCard
          onClose={async () => {
            await closeInbox(item.id, "done");
            emitChange();
          }}
        />
      );
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
          className="demo-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await submitNote(item.text, { inboxId: item.id, expectedContext: item.expectedContext });
            setBusy(false);
          }}
        >
          Send Sam's note
        </button>
        <button className="secondary" disabled={busy} onClick={() => skipNote(item.id)}>
          Skip
        </button>
      </div>
    </Card>
  );
}

/**
 * After a hard stretch ends (back to Steady within the last 14 days), ask once: anything that
 * helped? Save it for next time.
 */
function HelpedPrompt({ records, settings, helped }: { records: DayRecord[]; settings: Settings; helped: HelpedNote[] }) {
  const last = records[records.length - 1];
  if (!last || last.state !== "MONITOR") return null;
  const recent = records.slice(-14);
  const hard = recent.filter((r) => r.state === "ELEVATED" || r.state === "CONFIRMED");
  if (hard.length === 0) return null;
  const startedOn = hard[0].date;
  if (settings.helpedPromptDone && settings.helpedPromptDone >= startedOn) return null;
  if (helped.some((n) => n.source === "user" && n.createdAt >= startedOn)) return null;
  const close = async () => {
    await updateSettings({ helpedPromptDone: last.date });
    emitChange();
  };
  return (
    <div className="recall-ask" role="group" aria-label="Save what helped">
      <p>
        <strong>Your days look steadier again.</strong> Anything that helped? Save it in your own words, and Hearth brings it back next time.
      </p>
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            await close();
            navigate("helped_new");
          }}
        >
          Save what helped
        </button>
        <button className="secondary" onClick={close}>
          Not now
        </button>
      </div>
    </div>
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
    const settings = await getSettings();
    const helped = await db.helped_notes.toArray();
    const people = await getPeople();
    return { meta, state, inbox, rules, records, contexts, plan, settings, helped, people };
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
                <li key={c.feature}>
                  <button className="link why-link" onClick={() => navigate("why", { feature: c.feature })}>
                    {c.phrase} ›
                  </button>
                </li>
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
      <HelpedPrompt records={records} settings={data.settings} helped={data.helped} />
      {(st === "ELEVATED" || st === "CONFIRMED") && <CallAFriend people={data.people} compact />}
      {inbox.length === 0 && st === "WARM_UP" && (
        <p className="demo-line">
          Demo: nothing happens in Sam's first two weeks. Use <b>+1 day</b>, or <b>Jump to… → First change</b>.
        </p>
      )}
      {inbox.length === 0 && st !== "WARM_UP" && <p className="muted">Nothing to do today.</p>}

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
                <span className={`value${lastV == null ? " is-empty" : ""}`}>{lastV == null ? "Not enough days yet" : formatValue(f, lastV)}</span>
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
