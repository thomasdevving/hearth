import { Fold } from "./kit";
import { useState } from "react";
import { signalOnset, type EngineState, type FeatureId, type PlanRule, type SignalOnset } from "@hearth/engine";
import { db, newId } from "../store/db";
import { useData } from "./hooks";
import { cfg, getEngineState } from "../app/runtime";
import { emitChange, navigate } from "../app/events";
import { directionText, featureLabel, prettyDate } from "../app/labels";

/** How many signals outside the plan to show: the earliest ones are the interesting ones. */
const OTHERS_SHOWN = 3;

function when(o: SignalOnset): string {
  const n = o.daysBefore ?? 0;
  if (n > 1) return `${n} days before Hearth noticed`;
  if (n === 1) return "the day before Hearth noticed";
  if (n === 0) return "the day Hearth noticed";
  return n === -1 ? "a day after" : `${-n} days after`;
}

async function watchToo(o: SignalOnset, quote: string): Promise<void> {
  const [base, placeId] = o.feature.split(":");
  const rule: PlanRule = { id: newId("rule"), feature: base as FeatureId, direction: o.direction ?? "higher", placeId: placeId ?? null, quote: quote.trim(), active: true };
  await db.plan_rules.put(rule);
  emitChange();
}

/**
 * The plan learns from a hard stretch: which signals moved first, and how long before Hearth
 * noticed. Counted by the engine from the stored days (`signalOnset`); no model is involved.
 * The user decides whether to watch an extra signal, in their own words.
 */
export function WhatCameFirst({ fold = false }: { fold?: boolean }) {
  const d = useData(async () => {
    const [records, rules, state] = await Promise.all([db.day_records.orderBy("date").toArray(), db.plan_rules.toArray(), getEngineState() as Promise<EngineState | null>]);
    return { onset: signalOnset(records, rules.filter((r) => r.active), cfg), rules, places: state?.places ?? [] };
  });
  const [adding, setAdding] = useState<string | null>(null);
  const [quote, setQuote] = useState("");
  if (!d?.onset) return null;
  const { episode, moved, unchanged } = d.onset;
  const ruleById = new Map(d.rules.map((r) => [r.id, r]));
  const shown = [...moved.filter((m) => m.ruleId), ...moved.filter((m) => !m.ruleId).slice(0, OTHERS_SHOWN)].sort((a, b) => (a.firstDate! < b.firstDate! ? -1 : a.firstDate! > b.firstDate! ? 1 : 0));
  if (shown.length === 0 && unchanged.length === 0) return null;
  const label = (o: SignalOnset) => `${featureLabel(o.feature, d.places)} ${o.direction ? directionText(o.feature, o.direction) : ""}`.trim();

  const body = (
    <section className="came-first" aria-labelledby="came-first-title">
      <h2 id="came-first-title" className="plan-group">
        What came first
      </h2>
      <p className="muted">
        {episode.end
          ? `Your last hard stretch, ${prettyDate(episode.start)} to ${prettyDate(episode.end)}. This is the order in which your signals moved:`
          : `Hearth noticed a change on ${prettyDate(episode.start)}. This is the order in which your signals moved:`}
      </p>
      <ol className="onset-list">
        {shown.map((o) => {
          const rule = o.ruleId ? ruleById.get(o.ruleId) : null;
          return (
            <li key={o.feature} className={rule ? "is-own" : ""}>
              <div className="onset-head">
                <strong>{label(o)}</strong>
                <span className="onset-when">{when(o)}</span>
              </div>
              {rule ? (
                <small className="onset-own">Your sign: “{rule.quote}”</small>
              ) : adding === o.feature ? (
                <div className="smaller-edit">
                  <label>
                    In your own words
                    <input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="“My heart beats faster at rest”" autoFocus />
                  </label>
                  <div className="row">
                    <button
                      className="secondary"
                      disabled={quote.trim().length < 3}
                      onClick={async () => {
                        await watchToo(o, quote);
                        setAdding(null);
                        setQuote("");
                      }}
                    >
                      Add to my signs
                    </button>
                    <button className="link" onClick={() => setAdding(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <span className="onset-other">
                  Not in your plan.{" "}
                  <button className="link" onClick={() => setAdding(o.feature)}>
                    Watch for this too
                  </button>
                </span>
              )}
              <button className="link small-link" onClick={() => navigate("why", { feature: o.feature })}>
                See it ›
              </button>
            </li>
          );
        })}
      </ol>
      {unchanged.length > 0 && (
        <p className="muted small">
          Did not change this time: {unchanged.map((u) => featureLabel(u.feature, d.places).toLowerCase()).join(", ")}. That is fine: a sign can show up one time and not the next.
        </p>
      )}
      <p className="muted small">Worked out by Hearth's code from your own days, not by a model. The signs that move first are the ones to watch most closely; change your plan only if it feels right to you.</p>
    </section>
  );
  return fold ? <Fold title="What came first" hint={`${shown.length} signals, in order`}>{body}</Fold> : body;
}
