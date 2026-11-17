import { useEffect, useState } from "react";
import type { QuestionnaireRecord } from "@hearth/engine";
import { db, updateSettings } from "../store/db";
import { Card, ModelBadge, Screen } from "../ui/kit";
import { navigate } from "../app/events";
import { router } from "../inference";
import { resultTemplate } from "../app/templates";
import { finishOnboardingDay } from "../app/actions";
import { openInbox } from "../app/runtime";

const NEXT_TEXT: Record<string, string> = {
  none: "Nothing else to do now.",
  offer_phq9: "A slightly longer questionnaire comes next.",
  show_plan_and_share: "Your plan is shown next. You could share a summary with your GP or clinician.",
  safety: "Support options are shown.",
};

export function Result({ params }: { params: Record<string, string> }) {
  const baseline = params.baseline === "1";
  const [rec, setRec] = useState<QuestionnaireRecord | null>(null);
  const [text, setText] = useState<{ body: string; ranOn: "on_device" | "cloud" | "template" } | null>(null);
  const [phq9Open, setPhq9Open] = useState(false);
  useEffect(() => {
    (async () => {
      const r = (await db.questionnaires.get(params.id)) ?? null;
      setRec(r);
      if (!r) return;
      setPhq9Open((await openInbox()).some((i) => i.type === "questionnaire" && i.instrument === "PHQ9"));
      const last = (await db.day_records.orderBy("date").last()) ?? null;
      const input = {
        instrument: r.instrument,
        total: r.result.total,
        band: r.result.band,
        changeFromReference: r.result.changeFromReference,
        flagged: r.result.flagged,
        contributors: last?.contributors.map((c) => c.phrase) ?? [],
        nextStep: NEXT_TEXT[r.result.nextStep],
      };
      // Task C sees only the total, band and change, never the item answers (docs/06 §1).
      const res = await router().run<{ explanation: string }>("C", input);
      setText(res.ok ? { body: res.value.explanation, ranOn: res.ranOn } : { body: resultTemplate(r.result), ranOn: "template" });
    })();
  }, [params.id]);
  if (!rec) return <Screen title="Result">Loading…</Screen>;
  const r = rec.result;
  const max = rec.instrument === "PHQ2" ? 6 : 27;
  const onboardingHigh = baseline && r.total >= 10;
  return (
    <Screen title="Your result" badge={text ? <ModelBadge ranOn={text.ranOn} /> : undefined}>
      <p className="item-text">
        {r.total} <span className="muted">out of {max}</span>
      </p>
      {r.changeFromReference !== null && !baseline && (
        <p>
          {r.changeFromReference === 0 ? "The same as your own usual score." : r.changeFromReference > 0 ? `${r.changeFromReference} above your own usual score.` : `${-r.changeFromReference} below your own usual score.`}
        </p>
      )}
      <p aria-live="polite">{text ? text.body : "…"}</p>
      {onboardingHigh && (
        <Card tone="warm">
          <strong>A note about your answers</strong>
          <span>Hearth is built for people who are currently doing fairly well. Your answers suggest now may be a good moment to talk to your GP or clinician. You can still use the app.</span>
        </Card>
      )}
      {r.flagged && !baseline && (
        <Card tone="warm">
          <strong>Consider sharing this with your GP or clinician</strong>
          <span>You can create a summary to bring along or send.</span>
          <button className="link" onClick={() => navigate("share")}>
            Share a summary ›
          </button>
        </Card>
      )}
      <div className="row">
        {baseline ? (
          <button
            className="primary"
            onClick={async () => {
              await updateSettings({ baselineDone: true });
              await finishOnboardingDay();
              navigate("home");
            }}
          >
            Start
          </button>
        ) : r.nextStep === "offer_phq9" && phq9Open ? (
          <button className="primary" onClick={() => navigate("questionnaire", { instrument: "PHQ9" })}>
            Continue
          </button>
        ) : r.flagged ? (
          <button className="primary" onClick={() => navigate("my_plan")}>
            See my plan
          </button>
        ) : (
          <button className="primary" onClick={() => navigate("home")}>
            Done
          </button>
        )}
      </div>
    </Screen>
  );
}
