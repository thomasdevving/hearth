// FHIR R4 export of the plan and the questionnaires, for a GP's or clinician's system
// (docs/DECISIONS.md, "Plan for the GP and FHIR export"). Built and downloaded on the device;
// Hearth sends nothing. No identity: the Patient resource is empty and is matched by the
// clinician on import. The people the user listed are not included (they are third parties).
import type { PersonalItem, PlanAction, PlanRule, QuestionnaireRecord } from "@hearth/engine";
import { QUESTIONNAIRES } from "@hearth/engine";
import { directionText, featureLabel } from "../app/labels";

type R = Record<string, unknown>;

// LOINC: PHQ-9 panel 44249-1, PHQ-2 panel 55757-9, totals 44261-6 / 55758-7, answer list LL358-3.
const PANEL = { PHQ9: { code: "44249-1", display: "PHQ-9 quick depression assessment panel", total: "44261-6", totalDisplay: "Patient Health Questionnaire 9 item (PHQ-9) total score [Reported]" }, PHQ2: { code: "55757-9", display: "Patient Health Questionnaire 2 item (PHQ-2) [Reported]", total: "55758-7", totalDisplay: "Patient Health Questionnaire 2 item (PHQ-2) total score [Reported]" } } as const;
const ITEM_LOINC = ["44250-9", "44255-8", "44259-0", "44254-1", "44251-7", "44258-2", "44252-5", "44253-3", "44260-8"];
const ANSWER_LOINC = ["LA6568-5", "LA6569-3", "LA6570-1", "LA6571-9"];

const loinc = (code: string, display: string) => ({ system: "http://loinc.org", code, display });
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export interface FhirInput {
  rules: PlanRule[];
  items: PersonalItem[];
  actions: PlanAction[];
  questionnaires: QuestionnaireRecord[];
  now: string; // ISO timestamp
}

export function buildFhirBundle(inp: FhirInput): R {
  const patientUrl = `urn:uuid:${uuid()}`;
  const entries: { fullUrl: string; resource: R }[] = [{ fullUrl: patientUrl, resource: { resourceType: "Patient", active: true } }];

  const signs = inp.rules.filter((r) => r.active).map((r) => {
    const f = r.feature === "place_visits" ? "Visits to a named place" : featureLabel(r.feature);
    return `${f} ${directionText(r.feature, r.direction)} (“${r.quote}”)`;
  });
  const questions = inp.items.filter((i) => i.active).map((i) => `${i.question} (“${i.quote}”)`);
  entries.push({
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: "CarePlan",
      status: "active",
      intent: "plan",
      title: "Relapse prevention plan (signaleringsplan)",
      description: "Written by the person in Hearth, in their own words. Early signs are watched against the person's own usual days.",
      subject: { reference: patientUrl },
      created: inp.now,
      note: [
        ...signs.map((s) => ({ text: `Early sign Hearth watches: ${s}` })),
        ...questions.map((q) => ({ text: `Asked in check-ins: ${q}` })),
      ],
      activity: inp.actions.filter((a) => a.active).map((a) => ({ detail: { status: "not-started", description: `${a.text} (in the person's words: “${a.quote}”)` } })),
    },
  });

  for (const q of [...inp.questionnaires].sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1))) {
    if (q.instrument !== "PHQ9" && q.instrument !== "PHQ2") continue;
    const def = QUESTIONNAIRES[q.instrument]!;
    const p = PANEL[q.instrument];
    const qrUrl = `urn:uuid:${uuid()}`;
    entries.push({
      fullUrl: qrUrl,
      resource: {
        resourceType: "QuestionnaireResponse",
        questionnaire: `http://loinc.org/q/${p.code}`,
        status: "completed",
        subject: { reference: patientUrl },
        authored: q.takenAt,
        item: def.items.map((it, i) => {
          const v = q.answers[i];
          const opt = def.options.find((o) => o.value === v);
          return {
            linkId: ITEM_LOINC[i],
            text: it.text, // verbatim from shared/questionnaires (R1)
            answer: opt ? [{ valueCoding: { system: "http://loinc.org", code: ANSWER_LOINC[v], display: opt.label } }] : [],
          };
        }),
      },
    });
    entries.push({
      fullUrl: `urn:uuid:${uuid()}`,
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey", display: "Survey" }] }],
        code: { coding: [loinc(p.total, p.totalDisplay)], text: `${def.title} total score` },
        subject: { reference: patientUrl },
        effectiveDateTime: q.takenAt,
        valueInteger: q.result.total,
        derivedFrom: [{ reference: qrUrl }],
        ...(q.result.band ? { interpretation: [{ text: q.result.band.replace(/_/g, " ") }] } : {}),
      },
    });
  }

  return { resourceType: "Bundle", type: "collection", timestamp: inp.now, entry: entries };
}

/** Saves the bundle as a local file; nothing is sent. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/fhir+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
