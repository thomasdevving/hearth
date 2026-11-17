// A stand-in for Chrome's Prompt API (globalThis.LanguageModel), for tests only.
import { SAM_PLAN_EXPECTED } from "@baseline/engine";

export interface FakeCall {
  system: string;
  user: string;
  constraint: unknown;
}
export const fakeCalls: FakeCall[] = [];

export function installFakeLanguageModel(availability: "available" | "unavailable" | "downloadable" = "available", reply?: (system: string, user: string) => unknown) {
  const answer = (system: string, user: string): unknown => {
    if (reply) return reply(system, user);
    if (system.includes("opening line for a check-in")) return { intro: "You have been home more than usual lately. How are you doing today?", tone: "caring" };
    if (system.includes("early warning signs")) return SAM_PLAN_EXPECTED;
    if (system.includes("changes someone's routine")) return { context: "holiday", start_hint: "this week", end_hint: "back on Sunday", confidence: "high", quote: "I'm in Spain this week" };
    if (system.includes("diary text")) return { negative_affect: 0, anhedonic_language: 0, social_withdrawal: 0, hopelessness: 0, sleep_complaint: false, themes: [], crisis: "none" };
    if (system.includes("explain a questionnaire result")) return { explanation: "Thanks for answering." };
    if (system.includes("spoken check-in")) return { answers: [{ item_id: "i1", answer: "no", quote: "didn't eat much" }] };
    if (system.includes("things this person has said help them")) return { action_ids: ["a2"] };
    if (system.includes("short note summarising the texts")) return { themes: ["activity"], note: "A quieter week. I stayed in more than I wanted to." };
    if (system.includes("classify a question")) return { intent: "compare", feature: "rest_midpoint", period: "last_week" };
    if (system.includes("answer a question using only the facts")) return { answer: "Your rest was later last week than usual." };
    if (system.includes("Transcribe the handwritten")) return { text: "Warning signs: bed later, skip gym. Helps: call my sister." };
    if (system.includes("weekly reflection")) return { reflection: "A steady week compared with the one before.", open_question: "What helped this week?" };
    return {};
  };
  class FakeLM {
    static async availability() {
      return availability;
    }
    static async create(opts: { initialPrompts?: { content: { value: string }[] }[] }) {
      const system = opts?.initialPrompts?.[0]?.content?.[0]?.value ?? "";
      return {
        async prompt(contents: { content: { value: string }[] }[], promptOptions?: { responseConstraint?: unknown }) {
          const user = contents.map((c) => c.content.map((x) => x.value).join("")).join("\n");
          fakeCalls.push({ system, user, constraint: promptOptions?.responseConstraint });
          return JSON.stringify(answer(system, user));
        },
        destroy() {},
      };
    }
  }
  (globalThis as unknown as { LanguageModel?: unknown }).LanguageModel = FakeLM;
  (window as unknown as { LanguageModel?: unknown }).LanguageModel = FakeLM;
}

export function removeFakeLanguageModel() {
  delete (globalThis as unknown as { LanguageModel?: unknown }).LanguageModel;
  delete (window as unknown as { LanguageModel?: unknown }).LanguageModel;
}
