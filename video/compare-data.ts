// Exports Sam's real engine run (seed 1) for the "with vs without Hearth" demo video.
//   npx tsx video/compare-data.ts
import { writeFileSync } from "node:fs";
import { runHeadless, simulatePersona, scriptedCheckin } from "../packages/engine/src/index";

const data = simulatePersona(1, "default");
const run = runHeadless(data, { seed: 1 });
const phaseOf = (day: number) => data.phases.find((p) => day >= p.fromDay && day <= p.toDay)?.name ?? "";

const days = run.records.map((r, i) => {
  const ev = scriptedCheckin(data.script, r.date);
  return {
    day: i + 1,
    date: r.date,
    phase: phaseOf(i + 1),
    state: r.state,
    D: r.D,
    S: r.UCL === null ? null : r.S,
    UCL: r.UCL,
    masked: r.maskedDomains,
    contributors: r.contributors.map((c) => c.phrase),
    mood: ev && ev.type === "checkin_answer" ? ev.answers.mood_low : null, // the persona's simulated feeling
    rest: r.features.values.rest_midpoint ?? null,
    steps: r.features.values.steps ?? null,
    checkin: run.days[i].checkin ? (run.days[i].checkin!.answeredAt ? run.days[i].checkin!.kind : "ignored") : null,
  };
});
const firstChange = days.find((d) => d.state === "ELEVATED")!;
const out = {
  declineStart: data.phases.find((p) => p.name === "Gradual change")!.fromDay,
  firstChange: firstChange.day,
  firstChangeReasons: firstChange.contributors,
  actions: run.actions.map((a) => a.text),
  rules: run.rules.length,
  contexts: run.contexts.map((c) => ({ type: c.type, kind: c.kind, start: c.start, end: c.end })),
  questionnaires: run.questionnaires.map((q) => ({ instrument: q.instrument, total: q.result.total, change: q.result.changeFromReference, flagged: q.result.flagged, date: q.takenAt.slice(0, 10) })),
  days,
};
writeFileSync(new URL("./data.json", import.meta.url), JSON.stringify(out));
console.log("first change day", out.firstChange, out.firstChangeReasons, "decline from", out.declineStart);
console.log(out.questionnaires);
console.log("contexts", out.contexts);
console.log("checkins", days.filter((d) => d.checkin && d.checkin !== "ignored").length);
