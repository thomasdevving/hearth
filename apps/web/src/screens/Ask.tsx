import { useState, useSyncExternalStore } from "react";
import { askFacts, askTemplate, detectCrisis, type AskFeature, type AskIntent, type AskPeriod } from "@baseline/engine";
import { db } from "../store/db";
import { router } from "../inference";
import { getModelStatus, onModelStatus } from "../inference/status";
import { openSafety } from "../app/actions";
import { getToday } from "../app/clock";
import { ModelBadge } from "../ui/kit";
import { MicButton } from "../ui/Speech";

/** Task Q (P1): the model classifies the question, code computes the facts, the model phrases them. */
export function Ask() {
  const status = useSyncExternalStore(onModelStatus, getModelStatus);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ text: string; ranOn: "on_device" | "cloud" | "template" } | null>(null);
  const [busy, setBusy] = useState(false);
  if (status.onDevice !== "available") return null; // hidden without a model (docs/05 §3)
  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    if (detectCrisis(question)) return openSafety("keyword");
    setBusy(true);
    setAnswer(null);
    const c = await router().run<{ intent: AskIntent; feature: AskFeature; period: AskPeriod }>("Q_classify", { text: question }, { sourceText: question });
    if (!c.ok) {
      setAnswer({ text: "Sorry, I couldn't read that question on this device.", ranOn: "template" });
      return setBusy(false);
    }
    if (c.value.intent === "crisis") {
      setBusy(false);
      return openSafety("model_crisis");
    }
    const facts = askFacts(c.value, await db.day_records.orderBy("date").toArray(), await db.checkins.toArray(), getToday());
    if (facts.kind === "unsupported") {
      setAnswer({ text: askTemplate(facts), ranOn: "template" });
      return setBusy(false);
    }
    // The phrasing call sees only the computed facts, never the question (docs/05 task Q).
    const p = await router().run<{ answer: string }>("Q_phrase", { facts }, { verify: { facts } });
    setAnswer(p.ok ? { text: p.value.answer, ranOn: p.ranOn } : { text: askTemplate(facts), ranOn: "template" });
    setBusy(false);
  };
  return (
    <section>
      <h2>Ask about your data</h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input type="text" aria-label="Your question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How was my rest last week compared with usual?" />
        <div className="row">
          <button className="secondary" disabled={busy || !q.trim()}>
            {busy ? "Looking…" : "Ask"}
          </button>
          <MicButton onText={(t) => setQ(t)} label="Ask by voice" />
        </div>
      </form>
      {answer && (
        <p aria-live="polite">
          {answer.text} <ModelBadge ranOn={answer.ranOn} />
        </p>
      )}
      <small>Only questions about your own signals and check-ins. Your question is read on this device.</small>
    </section>
  );
}
