import { describe, expect, it } from "vitest";
import { QUESTIONNAIRES, scoreQuestionnaire, defaultConfig, type QuestionnaireRecord } from "@hearth/engine";
import { buildFhirBundle } from "../src/export/fhir";

const phq9 = (answers: number[], takenAt: string): QuestionnaireRecord => ({
  id: "q1", instrument: "PHQ9", takenAt, answers,
  result: scoreQuestionnaire("PHQ9", answers, { remissionScore: null }, defaultConfig),
});

describe("FHIR export (plan for the GP's system)", () => {
  const bundle = buildFhirBundle({
    rules: [{ id: "r1", feature: "rest_midpoint", direction: "later", placeId: null, quote: "going to bed later", active: true }],
    items: [{ id: "i1", question: "Did you reply to messages today?", quote: "stop replying to messages", active: true }],
    actions: [{ id: "a1", text: "Call my sister", quote: "Calling my sister helps", active: true }],
    questionnaires: [phq9([1, 1, 2, 0, 0, 1, 0, 0, 0], "2026-10-05T19:00:00+02:00")],
    now: "2026-11-22T10:00:00.000Z",
  }) as { resourceType: string; type: string; entry: { fullUrl: string; resource: Record<string, unknown> }[] };
  const of = (t: string) => bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === t);

  it("is a FHIR R4 collection bundle with a Patient without identity", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(of("Patient")).toEqual([{ resourceType: "Patient", active: true }]);
    for (const e of bundle.entry) expect(e.fullUrl).toMatch(/^urn:uuid:/);
  });

  it("the plan is a CarePlan with the signs as notes and what helps as activities", () => {
    const [plan] = of("CarePlan") as { note: { text: string }[]; activity: { detail: { description: string } }[]; status: string; intent: string }[];
    expect(plan.status).toBe("active");
    expect(plan.intent).toBe("plan");
    expect(plan.note.map((n) => n.text)).toEqual([
      "Early sign Hearth watches: Middle of your night gets later (“going to bed later”)",
      "Asked in check-ins: Did you reply to messages today? (“stop replying to messages”)",
    ]);
    expect(plan.activity[0].detail.description).toContain("Call my sister");
  });

  it("the PHQ-9 carries LOINC codes and the verbatim item texts (R1)", () => {
    const [qr] = of("QuestionnaireResponse") as { questionnaire: string; item: { linkId: string; text: string; answer: { valueCoding: { code: string; display: string } }[] }[] }[];
    expect(qr.questionnaire).toBe("http://loinc.org/q/44249-1");
    expect(qr.item.map((i) => i.text)).toEqual(QUESTIONNAIRES.PHQ9!.items.map((i) => i.text));
    expect(qr.item[0].linkId).toBe("44250-9");
    expect(qr.item[2].answer[0].valueCoding).toMatchObject({ code: "LA6570-1", display: "More than half the days" });
    const [obs] = of("Observation") as { code: { coding: { code: string }[] }; valueInteger: number; derivedFrom: { reference: string }[] }[];
    expect(obs.code.coding[0].code).toBe("44261-6");
    expect(obs.valueInteger).toBe(5);
  });

  it("contains no people's names or numbers", () => {
    expect(JSON.stringify(bundle)).not.toMatch(/555|Maya/);
  });
});
