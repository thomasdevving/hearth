import { useEffect, useState } from "react";
import { QUESTIONNAIRES, scriptedQuestionnaire } from "@hearth/engine";
import { Screen } from "../ui/kit";
import { submitQuestionnaire, dismissQuestionnaire, openSafety } from "../app/actions";
import { navigate } from "../app/events";
import { currentReplay } from "../app/runtime";
import { getToday } from "../app/clock";

/**
 * One item per page, stem repeated, items and options verbatim from shared/questionnaires
 * (rule R1). No model output appears on these pages.
 */
export function QuestionnairePages({ instrument, onDone, baseline }: { instrument: "PHQ2" | "PHQ9"; onDone: (recordId: string) => void; baseline?: boolean }) {
  const def = QUESTIONNAIRES[instrument]!;
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(def.items.map(() => null));
  const [scripted, setScripted] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    currentReplay().then((d) => setScripted(d ? scriptedQuestionnaire(d.script, instrument, getToday()) : null));
  }, [instrument]);
  const item = def.items[page];
  const finish = async (a: number[]) => {
    setBusy(true);
    const rec = await submitQuestionnaire(instrument, a, { baseline, deferSafety: true });
    setBusy(false);
    onDone(rec.id);
    // PHQ-9 item 9 above 0: the safety screen comes on top of the result (docs/06 §4), so
    // going back from it lands on the result.
    if (rec.result.safetyItemPositive) await openSafety("phq9_item9");
  };
  return (
    <div className="questionnaire" data-instrument={instrument}>
      <p className="progress">
        {def.title} · question {page + 1} of {def.items.length}
      </p>
      <p className="stem">{def.stem}</p>
      <p className="item-text" id="item-text">
        {item.text}
      </p>
      <div className="options" role="radiogroup" aria-labelledby="item-text">
        {def.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={answers[page] === o.value}
            aria-pressed={answers[page] === o.value}
            onClick={() => {
              const next = answers.map((x, i) => (i === page ? o.value : x));
              setAnswers(next);
              if (page < def.items.length - 1) setTimeout(() => setPage(page + 1), 150);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="row">
        {page > 0 && (
          <button className="secondary" onClick={() => setPage(page - 1)}>
            Previous
          </button>
        )}
        {page === def.items.length - 1 && (
          <button className="primary" disabled={busy || answers.some((a) => a === null)} onClick={() => finish(answers as number[])}>
            Done
          </button>
        )}
        {scripted && (
          <button className="demo-btn" disabled={busy} onClick={() => finish(scripted)} title="Time machine: fill in the persona's answers">
            Sam's answers
          </button>
        )}
      </div>
    </div>
  );
}

export function Questionnaire({ params }: { params: Record<string, string> }) {
  const instrument = params.instrument === "PHQ9" ? "PHQ9" : "PHQ2";
  return (
    <Screen title={instrument === "PHQ2" ? "Two short questions" : "A short questionnaire"} back="home">
      <QuestionnairePages instrument={instrument} onDone={(id) => navigate("result", { id })} />
      <button
        className="link"
        onClick={async () => {
          await dismissQuestionnaire(instrument);
          navigate("home");
        }}
      >
        Not today
      </button>
    </Screen>
  );
}

export function BaselinePhq() {
  return (
    <Screen title="Your starting point">
      <p className="muted">Nine questions about the last two weeks. Later answers are compared with these.</p>
      <QuestionnairePages instrument="PHQ9" baseline onDone={(id) => navigate("result", { id, baseline: "1" })} />
    </Screen>
  );
}
