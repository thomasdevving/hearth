import crisisLines from "../../../../shared/safety/crisis_lines.json";
import type { EngineState } from "@hearth/engine";
import { db, getSettings, getSingleton } from "../store/db";
import { useData } from "../ui/hooks";
import { directionText, featureLabel, ruleFeature } from "../app/labels";
import { getPeople } from "../app/people";
import { cfg, getMeta } from "../app/runtime";
import { navigate } from "../app/events";
import { changeSummary, firstPerson, maxScore, questionnaireNote } from "../export/gpSummary";

type Line = { name: string; phone: string | null; url: string; emergency?: string };

/** "5 Oct 2026": a clinical document carries the year. */
function docDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The plan on one A4 page for the GP or therapist. The Dutch depression guideline asks that the
 * relapse prevention plan (signaleringsplan) is known to the GP; GGZ plans are usually laid out
 * by phase (stable, early signs, crisis) with signs, own actions and what others can do, which
 * is the layout used here. A short header block (name, date of birth, date) follows the
 * structure of letters in primary care. Printed or saved as PDF by the browser; nothing is sent.
 */
export function PlanPrint() {
  const d = useData(async () => {
    const [rules, items, actions, qs, people, settings, meta, safety, engine, records] = await Promise.all([
      db.plan_rules.toArray(),
      db.personal_items.toArray(),
      db.plan_actions.toArray(),
      db.questionnaires.orderBy("takenAt").toArray(),
      getPeople(),
      getSettings(),
      getMeta(),
      getSingleton(db.safety_plan),
      getSingleton(db.engine_state) as Promise<EngineState | null>,
      db.day_records.toArray(),
    ]);
    return {
      rules: rules.filter((r) => r.active),
      items: items.filter((i) => i.active),
      actions: actions.filter((a) => a.active),
      qs,
      people,
      settings,
      meta,
      safety,
      places: engine?.places ?? [],
      change: changeSummary(records),
    };
  });
  if (!d) return <article className="gp-doc">Loading…</article>;
  const line = ((crisisLines.countries as Record<string, Line>)[d.settings.country] ?? (crisisLines.default as Line)) as Line;
  const today = d.meta?.today ?? new Date().toISOString().slice(0, 10);
  const recent = d.qs.slice(-4);
  const latest = d.qs[d.qs.length - 1];
  const c = d.change;
  const s = d.safety;

  return (
    <div className="gp-wrap">
      <div className="no-print row gp-tools">
        <button className="primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button className="link" onClick={() => navigate("my_plan")}>
          Back to my plan
        </button>
      </div>
      <article className="gp-doc">
        <header className="gp-head">
          <div>
            <h1>Relapse prevention plan</h1>
            <p className="gp-sub">Signaleringsplan · summary kept and shared by the patient</p>
          </div>
          <dl className="gp-meta">
            <dt>Name</dt>
            <dd className="gp-fill" />
            <dt>Date of birth</dt>
            <dd className="gp-fill" />
            <dt>Date</dt>
            <dd>{docDate(today)}</dd>
          </dl>
        </header>

        <section>
          <h2>1. Current status</h2>
          <p>
            {c.since
              ? `Since ${docDate(c.since)} (${c.days} ${c.days === 1 ? "day" : "days"}), Hearth has noticed a change from my usual pattern.`
              : c.state === "MONITOR"
                ? "My days are within my usual pattern."
                : "Hearth is still learning my usual pattern."}
            {c.since && c.changes.length > 0 && ` Main changes on ${docDate(c.lastDate!)}: ${c.changes.join("; ")}.`}
          </p>
          {latest && (
            <p>
              Latest questionnaire: {latest.instrument === "PHQ9" ? "PHQ-9" : "PHQ-2"} on {docDate(latest.takenAt.slice(0, 10))}, score {latest.result.total} of {maxScore(latest.instrument)}. {questionnaireNote(latest, cfg)}.
            </p>
          )}
        </section>

        <section>
          <h2>2. Plan by phase</h2>
          <table className="gp-table gp-phases">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Signs</th>
                <th>What I do</th>
                <th>What others can do</th>
              </tr>
            </thead>
            <tbody>
              <tr className="phase-green">
                <th scope="row">Stable</th>
                <td>My usual days. Hearth compares my sleep, activity, daily rhythm, heart rate and places with them.</td>
                <td>Short check-ins in Hearth, about one day in three.</td>
                <td>–</td>
              </tr>
              <tr className="phase-orange">
                <th scope="row">Early signs</th>
                <td>
                  {d.rules.length + d.items.length === 0 ? (
                    "No personal signs written yet."
                  ) : (
                    <ul>
                      {d.rules.map((r) => (
                        <li key={r.id}>
                          “{r.quote}”
                          <span className="gp-how">
                            Measured: {firstPerson(featureLabel(ruleFeature(r), d.places)).toLowerCase()} {directionText(r.feature, r.direction)}
                          </span>
                        </li>
                      ))}
                      {d.items.map((i) => (
                        <li key={i.id}>
                          “{i.quote}”<span className="gp-how">Asked at check-ins: {i.question}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  {d.actions.length === 0 ? (
                    "Nothing written yet."
                  ) : (
                    <ul>
                      {d.actions.map((a) => (
                        <li key={a.id}>{a.text}</li>
                      ))}
                    </ul>
                  )}
                  <p className="gp-how">If the change lasts, Hearth offers the PHQ-2, then the PHQ-9.</p>
                </td>
                <td>
                  {d.people.length === 0 ? (
                    "–"
                  ) : (
                    <ul>
                      {d.people.map((p) => (
                        <li key={p.id}>
                          {p.name || "Someone I trust"}
                          {p.goodFor ? `: ${p.goodFor}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
              <tr className="phase-red">
                <th scope="row">Crisis</th>
                <td>{s?.warningSigns || "Not written down yet."}</td>
                <td>
                  {s?.helps && <p>{s.helps}</p>}
                  <p>
                    Call {line.name}
                    {line.phone ? ` (${line.phone})` : ""}.
                  </p>
                </td>
                <td>
                  {s?.whoToCall && <p>{s.whoToCall}</p>}
                  <p>
                    GP or out-of-hours GP service.
                    {line.emergency ? ` Emergency: ${line.emergency}.` : ""}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>3. Questionnaires</h2>
          {recent.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <table className="gp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Questionnaire</th>
                  <th>Score</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((q) => (
                  <tr key={q.id}>
                    <td>{docDate(q.takenAt.slice(0, 10))}</td>
                    <td>{q.instrument === "PHQ9" ? "PHQ-9" : "PHQ-2"}</td>
                    <td>
                      {q.result.total} / {maxScore(q.instrument)}
                    </td>
                    <td>{questionnaireNote(q, cfg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="gp-foot">
          <strong>About this document.</strong> Made and shared by the patient with Hearth, a self-insight app. Hearth is not a medical device and does not diagnose. Text in quotation
          marks is in the patient's own words. Sensor data: {d.meta ? "simulated (demo person)" : "own phone and watch"}. PHQ-2 and PHQ-9 answered by the patient. A structured copy
          (FHIR R4) can be downloaded from the app.
        </footer>
      </article>
    </div>
  );
}
