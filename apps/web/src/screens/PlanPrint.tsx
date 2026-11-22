import crisisLines from "../../../../shared/safety/crisis_lines.json";
import { db, getSettings, getSingleton } from "../store/db";
import { useData } from "../ui/hooks";
import { directionText, featureLabel, prettyDate } from "../app/labels";
import { getPeople } from "../app/people";
import { getMeta } from "../app/runtime";
import { navigate } from "../app/events";

type Line = { name: string; phone: string | null; url: string; emergency?: string };

/**
 * One page for the GP or clinician (the Dutch guideline asks that the relapse prevention plan
 * is known to the GP). Printed or saved as PDF by the browser; nothing is sent.
 */
export function PlanPrint() {
  const d = useData(async () => {
    const [rules, items, actions, qs, people, settings, meta, safety] = await Promise.all([
      db.plan_rules.toArray(),
      db.personal_items.toArray(),
      db.plan_actions.toArray(),
      db.questionnaires.orderBy("takenAt").toArray(),
      getPeople(),
      getSettings(),
      getMeta(),
      getSingleton(db.safety_plan),
    ]);
    return { rules: rules.filter((r) => r.active), items: items.filter((i) => i.active), actions: actions.filter((a) => a.active), qs, people, settings, meta, safety };
  });
  if (!d) return <article className="print-page">Loading…</article>;
  const line = ((crisisLines.countries as Record<string, Line>)[d.settings.country] ?? (crisisLines.default as Line)) as Line;
  const today = d.meta?.today ?? new Date().toISOString().slice(0, 10);
  const recent = d.qs.slice(-4);
  return (
    <article className="print-page">
      <div className="no-print row">
        <button className="primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button className="link" onClick={() => navigate("my_plan")}>
          Back to my plan
        </button>
      </div>
      <header>
        <h1>My relapse prevention plan</h1>
        <p className="muted">Made with Hearth · {prettyDate(today)} · written in my own words</p>
      </header>

      <section>
        <h2>Early signs I watch for</h2>
        {d.rules.length + d.items.length === 0 && <p className="muted">No personal signs yet. Hearth watches the research-based signals for everyone.</p>}
        <ul>
          {d.rules.map((r) => (
            <li key={r.id}>
              {r.feature === "place_visits" ? "Visits to a named place" : featureLabel(r.feature)} {directionText(r.feature, r.direction)} <span className="quote">(“{r.quote}”)</span>
            </li>
          ))}
          {d.items.map((i) => (
            <li key={i.id}>
              {i.question} <span className="quote">(“{i.quote}”)</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Hearth compares sleep, activity, daily rhythm, heart rate and places with my own usual days. It does not diagnose.</p>
      </section>

      <section>
        <h2>What helps me</h2>
        {d.actions.length === 0 && <p className="muted">Nothing written yet.</p>}
        <ul>
          {d.actions.map((a) => (
            <li key={a.id}>{a.text}</li>
          ))}
        </ul>
      </section>

      {d.people.length > 0 && (
        <section>
          <h2>People I can reach out to</h2>
          <ul>
            {d.people.map((p) => (
              <li key={p.id}>
                {p.name || "Someone I trust"}
                {p.goodFor ? `, for ${p.goodFor}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.safety && (d.safety.warningSigns || d.safety.helps || d.safety.whoToCall) && (
        <section>
          <h2>My safety plan</h2>
          {d.safety.warningSigns && <p><strong>Warning signs:</strong> {d.safety.warningSigns}</p>}
          {d.safety.helps && <p><strong>What helps:</strong> {d.safety.helps}</p>}
          {d.safety.whoToCall && <p><strong>Who I can call:</strong> {d.safety.whoToCall}</p>}
        </section>
      )}

      <section>
        <h2>Questionnaires</h2>
        {recent.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Questionnaire</th>
                <th>Total</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((q) => (
                <tr key={q.id}>
                  <td>{prettyDate(q.takenAt.slice(0, 10))}</td>
                  <td>{q.instrument === "PHQ9" ? "PHQ-9" : "PHQ-2"}</td>
                  <td>
                    {q.result.total} / {q.instrument === "PHQ9" ? 27 : 6}
                  </td>
                  <td>{q.result.flagged ? "a clear change from my usual score" : q.result.band ? q.result.band.replace(/_/g, " ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>In a crisis</h2>
        <p>
          {line.name}
          {line.phone ? `: ${line.phone}` : ""}
          {line.emergency ? ` · Emergency: ${line.emergency}` : ""}
        </p>
      </section>
      <p className="muted small">Hearth is a self-insight tool, not a medical device. It does not tell anyone anything; I chose to share this page.</p>
    </article>
  );
}
