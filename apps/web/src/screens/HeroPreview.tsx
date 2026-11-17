import { useState } from "react";
import { addDays, computeFeatures, defaultConfig, PERSONA_START, SAM_PLAN_EXPECTED, SAM_PLAN_TEXT, simulatePersona, verifyPlan, type FeatureId } from "@hearth/engine";
import { featureLabel, formatValue, prettyDate } from "../app/labels";
import { LogoMark } from "../ui/Logo";
import { Sparkline } from "../ui/kit";

const demoPlan = verifyPlan(SAM_PLAN_EXPECTED, SAM_PLAN_TEXT);
const signalIds: FeatureId[] = ["steps", "rest_midpoint", "home_stay"];
const previewDate = addDays(PERSONA_START, 27);
const emptySignals = signalIds.map((id) => ({ id, values: Array<number | null>(7).fill(null) }));

/** Uses the same seeded persona, feature calculations and presentation as Today. */
function previewSignals() {
  const replay = simulatePersona(1);
  const days = replay.raws.slice(21, 28).map((day, i) => computeFeatures(replay.raws.slice(0, i + 22), day.date, defaultConfig));
  return {
    date: replay.raws[27].date,
    signals: signalIds.map((id) => ({ id, values: days.map((day) => day.values[id] ?? null) })),
  };
}

export function HeroPreview() {
  const [view, setView] = useState<"plan" | "signals">("plan");
  const [signals, setSignals] = useState<ReturnType<typeof previewSignals> | null>(null);

  const showSignals = () => {
    setSignals((current) => current ?? previewSignals());
    setView("signals");
  };

  return (
    <section className="hero-preview" aria-label="Explore the Hearth app">
      <div className="preview-header">
        <span className="preview-brand"><LogoMark size={22} /> A little look inside</span>
        <span className="preview-demo">Demo</span>
      </div>
      <div className="preview-tabs" role="group" aria-label="Choose an app preview">
        <button id="preview-plan" type="button" aria-pressed={view === "plan"} aria-controls="hero-preview-panel" onClick={() => setView("plan")}>Your plan</button>
        <button id="preview-signals" type="button" aria-pressed={view === "signals"} aria-controls="hero-preview-panel" onClick={showSignals}>Your signals</button>
      </div>
      <div id="hero-preview-panel" className="preview-panel" role="region" aria-labelledby={`preview-${view}`}>
        <div className="preview-view" aria-hidden={view !== "plan"}>
          <h2>Small signs. A plan that’s yours.</h2>
          <p className="preview-description">From Sam’s own words in the demo.</p>
          <h3>Signs I watch for</h3>
          <ul className="preview-signs">
            {demoPlan.rules.slice(0, 2).map((rule) => <li key={rule.quote}><span aria-hidden="true" />“{rule.quote}”</li>)}
          </ul>
          <h3>What helps me</h3>
          <ul className="preview-actions">
            {demoPlan.actions.map((action) => (
              <li key={action.text}>
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg>
                {action.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="preview-view" aria-hidden={view !== "signals"}>
          <h2>A week of your own patterns.</h2>
          <p className="preview-description">Sam’s simulated week · {prettyDate(signals?.date ?? previewDate)}</p>
          <ul className="preview-signals">
            {(signals?.signals ?? emptySignals).map(({ id, values }) => (
              <li key={id}>
                <strong>{featureLabel(id)}</strong>
                <Sparkline values={values} width={80} height={30} label={featureLabel(id)} />
                <span>{formatValue(id, values[values.length - 1])}</span>
              </li>
            ))}
          </ul>
          <p className="preview-explainer">The same signals and charts you’ll find in the app. Always compared with your own usual days.</p>
        </div>
      </div>
      <a className="preview-open" href={view === "plan" ? "#/plan_setup?first=1" : "#/home"}>{view === "plan" ? "Build your own plan" : "Explore the full demo"}<span aria-hidden="true">→</span></a>
      <p className="preview-privacy"><span aria-hidden="true">◇</span>Your words stay on your device.</p>
    </section>
  );
}
