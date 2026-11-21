import { useEffect, useState } from "react";
import { addDays, CONTEXT_TYPES, CONTEXT_TABLE, type ContextLabel } from "@hearth/engine";
import { db, type InboxItem } from "../store/db";
import { ModelBadge, Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { confirmContextLabel, rejectContext } from "../app/actions";
import { closeInbox } from "../app/runtime";
import { CONTEXT_LABEL, prettyDate } from "../app/labels";

const QUESTION: Record<string, (end: string) => string> = {
  holiday: (e) => `Are you on holiday until ${e}?`,
  travel: (e) => `Are you travelling until ${e}?`,
  visitors: (e) => `Do you have visitors until ${e}?`,
  ill: (e) => `Are you ill (until about ${e})?`,
  moving: (e) => `Are you moving house (until about ${e})?`,
  exams: (e) => `Do you have exams until ${e}?`,
  new_job: () => "Have you started a new job?",
  loss: () => "Has something hard happened?",
  other_stress: (e) => `Is something stressful going on until ${e}?`,
};

export function ContextConfirm({ params }: { params: Record<string, string> }) {
  const [item, setItem] = useState<InboxItem | null>(null);
  const [label, setLabel] = useState<ContextLabel | null>(null);
  const [expired, setExpired] = useState<ContextLabel | null>(null);
  useEffect(() => {
    (async () => {
      const it = (await db.inbox.get(params.id)) ?? null;
      setItem(it);
      if (it?.type === "context_confirm") setLabel(it.context);
      if (it?.type === "context_expired") setExpired((await db.contexts.get(it.contextId)) ?? null);
    })();
  }, [params.id]);
  if (!item || item.status !== "open") return <Screen title="Confirm" back="home">Nothing to confirm.</Screen>;

  if (item.type === "context_expired") {
    return (
      <Screen title="Does this still apply?" back="home">
        <p>{expired ? `${CONTEXT_LABEL[expired.type] ?? expired.type} ended on ${prettyDate(expired.end)}.` : "Your earlier note has ended."} Is it still going on?</p>
        <div className="row">
          <button
            className="primary"
            onClick={async () => {
              if (expired) await confirmContextLabel({ ...expired, id: `${expired.id}_x`, start: addDays(expired.end, 1), end: addDays(expired.end, 7) });
              await closeInbox(item.id);
              navigate("home");
            }}
          >
            Yes, one more week
          </button>
          <button
            className="secondary"
            onClick={async () => {
              await closeInbox(item.id);
              navigate("home");
            }}
          >
            No, it's over
          </button>
        </div>
      </Screen>
    );
  }
  if (item.type !== "context_confirm" || !label) return null;
  const picker = !label.type;
  const kind = CONTEXT_TABLE[label.type]?.kind;
  return (
    <Screen title={picker ? "Is something changing your routine?" : "One quick check"} back="home" badge={!picker ? <ModelBadge ranOn={item.ranOn === "none" ? "template" : item.ranOn} /> : undefined}>
      {!picker && (
        <>
          <p className="item-text">{(QUESTION[label.type] ?? ((e: string) => `${CONTEXT_LABEL[label.type]} until ${e}?`))(prettyDate(label.end))}</p>
          {label.quote && <p className="quote">From your note: “{label.quote}”</p>}
        </>
      )}
      {picker && (
        <>
          <p className="quote">From your note: “{item.sourceText.trim()}”</p>
          <p className="muted">Pick one if it fits; nothing changes otherwise.</p>
          <div className="chips" role="radiogroup" aria-label="What is going on">
            {CONTEXT_TYPES.map((t) => (
              <button key={t} role="radio" aria-checked={label.type === t} aria-pressed={label.type === t} onClick={() => setLabel({ ...label, type: t, kind: CONTEXT_TABLE[t].kind })}>
                {CONTEXT_LABEL[t]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="row">
        <label>
          From <input type="date" value={label.start} onChange={(e) => setLabel({ ...label, start: e.target.value })} />
        </label>
        <label>
          until <input type="date" value={label.end} onChange={(e) => setLabel({ ...label, end: e.target.value })} />
        </label>
      </div>
      {label.type && (
        <p className="muted">
          {kind === "explains_sensors"
            ? "If you confirm, the signals this affects (for example where you go) are set aside for these days, so they don't count as a change."
            : "This is noted on your trends. Nothing is set aside: a stressful time is exactly when your signals matter."}
        </p>
      )}
      <div className="row">
        <button
          className="primary"
          disabled={!label.type}
          onClick={async () => {
            await confirmContextLabel({ ...label, source: picker ? "manual" : label.source }, item.id);
            navigate("home");
          }}
        >
          {picker ? "Save" : "Yes"}
        </button>
        <button
          className="secondary"
          onClick={async () => {
            await rejectContext(item.id);
            navigate("home");
          }}
        >
          {picker ? "Nothing like that" : "No"}
        </button>
      </div>
    </Screen>
  );
}
