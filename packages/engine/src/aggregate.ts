// docs/07 §3: the weekly aggregate, the only thing that is ever uploaded (class S1).
import type { ContextLabel, Domain, WeekAggregate, WeekInput } from "./types";
import { mean } from "./stats";
import { datesOfIsoWeek, dateOfTimestamp } from "./time";
import { DOMAINS, catalogueId } from "./features/catalogue";

const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

function overlaps(c: ContextLabel, first: string, last: string): boolean {
  return c.confirmed && c.start <= last && c.end >= first;
}

/**
 * Numbers are rounded (index and domain means to 2 decimals, check-in means to 1) so the
 * aggregate stays coarse. No dates below the week, no free text except an approved note,
 * no places, no names.
 */
export function aggregateWeek(input: WeekInput): WeekAggregate {
  const dates = datesOfIsoWeek(input.isoWeek);
  const first = dates[0];
  const last = dates[6];
  const inWeek = (d: string) => d >= first && d <= last;
  const records = input.records.filter((r) => inWeek(r.date));
  const withData = records.filter((r) => Object.values(r.features.values).some((v) => v !== null));
  const ds = records.map((r) => r.D).filter((d): d is number => d !== null);
  const domainMeans: Partial<Record<Domain, number>> = {};
  for (const dom of DOMAINS) {
    const xs = records.map((r) => r.domainScores[dom]).filter((x): x is number => typeof x === "number");
    if (xs.length > 0) domainMeans[dom] = r2(mean(xs)) as number;
  }
  const counts = new Map<string, number>();
  for (const r of records) for (const c of r.contributors) counts.set(catalogueId(c.feature), (counts.get(catalogueId(c.feature)) ?? 0) + 1);
  const topContributors = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([f]) => f);

  const answered = input.checkins.filter((c) => c.answeredAt !== null && inWeek(dateOfTimestamp(c.answeredAt)));
  const emaMean = (k: "mood_low" | "enjoyment" | "energy") => r1(mean(answered.map((c) => c.answers[k]).filter((x): x is number => typeof x === "number")));

  const qs = input.questionnaires.filter((q) => inWeek(dateOfTimestamp(q.takenAt))).sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
  const lastOf = (id: string) => [...qs].reverse().find((q) => q.instrument === id) ?? null;
  const phq2 = lastOf("PHQ2");
  const phq9 = lastOf("PHQ9");

  const markerMeans =
    input.markers.length === 0
      ? null
      : {
          negative_affect: r2(mean(input.markers.map((m) => m.negative_affect))) as number,
          anhedonic_language: r2(mean(input.markers.map((m) => m.anhedonic_language))) as number,
          social_withdrawal: r2(mean(input.markers.map((m) => m.social_withdrawal))) as number,
          hopelessness: r2(mean(input.markers.map((m) => m.hopelessness))) as number,
        };

  return {
    isoWeek: input.isoWeek,
    daysWithData: withData.length,
    indexMean: r2(mean(ds)),
    daysElevated: records.filter((r) => r.elevated).length,
    domainMeans,
    topContributors,
    ema: { n: answered.length, mood_low: emaMean("mood_low"), enjoyment: emaMean("enjoyment"), energy: emaMean("energy") },
    phq2: phq2 ? phq2.result.total : null,
    phq9: phq9 ? phq9.result.total : null,
    phq9Flagged: phq9 ? phq9.result.flagged : null,
    contexts: [...new Set(input.contexts.filter((c) => overlaps(c, first, last)).map((c) => c.type))].sort(),
    markerMeans,
    note: input.note ? { themes: [...input.note.themes], text: input.note.text } : null,
  };
}
