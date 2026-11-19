import { findQuoteSpan } from "../src/guardrails/quotes";
import { describe, expect, it } from "vitest";
import {
  CRISIS_KEYWORDS,
  defaultConfig,
  detectCrisis,
  hasBannedWords,
  numberCheck,
  piiCheck,
  resolveDateHint,
  resolveContextPeriod,
  verifyContext,
  verifyMarkers,
  verifyPlan,
  verifyQuote,
  verifyTask,
  normalizeForQuote,
  loadConfig,
} from "../src/index";
import { SAM_PLAN_EXPECTED, SAM_PLAN_TEXT } from "../src/simulate/persona";

describe("quote verification (docs/05 §5.1)", () => {
  const src = "When things go wrong I keep going to bed later, I skip the gym!";
  it("accepts exact, re-punctuated and re-cased quotes", () => {
    expect(verifyQuote("going to bed later", src)).toBe(true);
    expect(verifyQuote("Going to bed later.", src)).toBe(true);
    expect(verifyQuote("later  I skip", src)).toBe(true);
    expect(verifyQuote("I SKIP THE GYM", src)).toBe(true);
    expect(verifyQuote("ﬁ", "ﬁne")).toBe(false); // NFKC → "fi", too short
  });
  it("rejects invented and too-short quotes", () => {
    expect(verifyQuote("I stop eating", src)).toBe(false);
    expect(verifyQuote("go", src)).toBe(false);
    expect(verifyQuote("", src)).toBe(false);
    expect(verifyQuote(null, src)).toBe(false);
  });
  it("normalises Unicode and punctuation", () => {
    expect(normalizeForQuote("  It’s — FINE…  ")).toBe("it s fine");
  });
});

describe("verifyPlan (task G)", () => {
  it("yields exactly the cards of the docs/05 example from a correct output", () => {
    const v = verifyPlan(SAM_PLAN_EXPECTED, SAM_PLAN_TEXT);
    expect(v.valid).toBe(true);
    expect(v.dropped).toBe(0);
    expect(v.rules).toEqual([
      { feature: "rest_midpoint", direction: "later", place_label: null, quote: "going to bed later" },
      { feature: "place_visits", direction: "lower", place_label: "gym", quote: "I skip the gym" },
      { feature: "home_stay", direction: "higher", place_label: null, quote: "I stay inside more" },
    ]);
    expect(v.personal_checkin_items.map((i) => i.question)).toEqual(["Did you eat well today?", "Did you reply to messages today?"]);
    expect(v.actions.map((a) => a.text)).toEqual(["Call my sister", "A walk in the morning"]);
  });
  it("drops one invented rule", () => {
    const raw = { ...SAM_PLAN_EXPECTED, rules: [...SAM_PLAN_EXPECTED.rules, { feature: "steps", direction: "lower", place_label: "", quote: "I stop walking the dog" }] };
    const v = verifyPlan(raw, SAM_PLAN_TEXT);
    expect(v.rules).toHaveLength(3);
    expect(v.dropped).toBe(1);
  });
  it("drops illegal directions, duplicates and phone rules while the phone domain is off", () => {
    const raw = {
      rules: [
        { feature: "rest_midpoint", direction: "later", place_label: "", quote: "going to bed later" },
        { feature: "rest_midpoint", direction: "later", place_label: "", quote: "I keep going to bed later" },
        { feature: "steps", direction: "later", place_label: "", quote: "going to bed later" },
        { feature: "communication_time", direction: "lower", place_label: "", quote: "stop replying to messages" },
        { feature: "place_visits", direction: "lower", place_label: "", quote: "I skip the gym" },
      ],
      personal_checkin_items: [],
      actions: [],
    };
    const v = verifyPlan(raw, SAM_PLAN_TEXT);
    expect(v.rules.map((r) => r.feature)).toEqual(["rest_midpoint"]);
    expect(v.dropped).toBe(4);
    const withPhone = verifyPlan(raw, SAM_PLAN_TEXT, loadConfig({ phone: { enabled: true, thresholds: [0, 30] } }));
    expect(withPhone.rules.map((r) => r.feature)).toEqual(["rest_midpoint", "communication_time"]);
  });
  it("output that is not a plan at all is invalid; one broken entry only drops that entry", () => {
    expect(verifyPlan("nope", SAM_PLAN_TEXT).valid).toBe(false);
    expect(verifyPlan(null, SAM_PLAN_TEXT).valid).toBe(false);
    const p = verifyPlan({ rules: [{ feature: "mood", direction: "lower", place_label: "", quote: "x" }, { feature: "home_stay", direction: "higher", place_label: "", quote: "I stay inside more" }], personal_checkin_items: [], actions: [] }, SAM_PLAN_TEXT);
    expect(p.valid).toBe(true);
    expect(p.rules.map((r) => r.feature)).toEqual(["home_stay"]);
    expect(p.dropped).toBe(1);
  });
});

describe("verifyContext (task H)", () => {
  const today = "2026-11-19"; // a Thursday
  it("resolves 'flu since Tuesday' to the right start", () => {
    const text = "I've had the flu since Tuesday, staying in bed.";
    const v = verifyContext({ context: "ill", start_hint: "since Tuesday", end_hint: "unknown", confidence: "high", quote: "had the flu since Tuesday" }, text, today);
    expect(v).not.toBeNull();
    expect(v!.start).toBe("2026-11-17");
    expect(v!.kind).toBe("explains_sensors");
    expect(v!.startResolved).toBe(true);
    expect(v!.endResolved).toBe(false);
    expect(v!.end).toBe("2026-11-23");
  });
  it("returns null on low confidence, an invented quote, or none", () => {
    const text = "Maybe a bit under the weather.";
    expect(verifyContext({ context: "ill", start_hint: "unknown", end_hint: "unknown", confidence: "low", quote: "under the weather" }, text, today)).toBeNull();
    expect(verifyContext({ context: "ill", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "I have the flu" }, text, today)).toBeNull();
    expect(verifyContext({ context: "none", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "" }, text, today)).toBeNull();
  });
  it("overwrites kind from the context table and resolves the holiday of the replay", () => {
    const text = "I'm in Spain this week, back on Sunday.";
    const v = verifyContext({ context: "holiday", start_hint: "this week", end_hint: "back on Sunday", confidence: "high", quote: "I'm in Spain this week" }, text, "2026-08-17");
    expect(v).toMatchObject({ type: "holiday", kind: "explains_sensors", start: "2026-08-17", end: "2026-08-23" });
    const exams = verifyContext({ context: "exams", start_hint: "unknown", end_hint: "unknown", confidence: "medium", quote: "Exam week" }, "Exam week, lots of stress.", "2026-09-21");
    expect(exams).toMatchObject({ type: "exams", kind: "stressor", start: "2026-09-21" });
  });
  it("ignores a time hint that is not in the text", () => {
    const v = verifyContext({ context: "visitors", start_hint: "since Monday", end_hint: "unknown", confidence: "high", quote: "my parents are staying" }, "my parents are staying with us", today);
    expect(v!.start).toBe(today);
    expect(v!.startResolved).toBe(false);
  });
});

describe("relative dates", () => {
  const thu = "2026-11-19";
  it.each([
    ["today", "start", "2026-11-19"],
    ["yesterday", "start", "2026-11-18"],
    ["since Tuesday", "start", "2026-11-17"],
    ["on Thursday", "start", "2026-11-19"],
    ["until Sunday", "end", "2026-11-22"],
    ["back on Monday", "end", "2026-11-23"],
    ["next Tuesday", "end", "2026-11-24"],
    ["last Friday", "start", "2026-11-13"],
    ["this week", "start", "2026-11-16"],
    ["this week", "end", "2026-11-22"],
    ["next week", "start", "2026-11-23"],
    ["3 days ago", "start", "2026-11-16"],
    ["a week ago", "start", "2026-11-12"],
    ["in two days", "end", "2026-11-21"],
    ["until the 24th", "end", "2026-11-24"],
    ["on Friday", "start", "2026-11-20"],
    ["on Monday", "start", "2026-11-16"],
    ["since Friday", "start", "2026-11-13"],
    ["in a couple of days", "end", "2026-11-21"],
    ["unknown", "start", null],
    ["whenever", "end", null],
  ] as const)("%s (%s)", (hint, role, expected) => {
    expect(resolveDateHint(hint, thu, role)).toBe(expected);
  });
  it("'a few days' is a duration and 'since last week' has no end", () => {
    expect(resolveContextPeriod("unknown", "for a few days", thu, "explains_sensors", defaultConfig)).toMatchObject({ start: thu, end: "2026-11-21", endResolved: true });
    expect(resolveContextPeriod("since last week", "unknown", thu, "stressor", defaultConfig)).toMatchObject({ start: "2026-11-09", endResolved: false });
  });
  it("a duration is counted from the start", () => {
    expect(resolveDateHint("for a week", thu, "end", "2026-11-17")).toBe("2026-11-23");
    expect(resolveContextPeriod("since Tuesday", "for 3 days", thu, "explains_sensors", defaultConfig)).toMatchObject({ start: "2026-11-17", end: "2026-11-19" });
  });
  it("caps a sensor label at contextMaxDays and never ends before it starts", () => {
    const p = resolveContextPeriod("today", "for 4 weeks", thu, "explains_sensors", defaultConfig);
    expect(p.end).toBe("2026-12-02");
    expect(resolveContextPeriod("today", "yesterday", thu, "stressor", defaultConfig).end).toBe(thu);
  });
});

describe("verifyMarkers (task B)", () => {
  it("accepts a valid output and rejects an invalid one", () => {
    const m = { negative_affect: 2, anhedonic_language: 1, social_withdrawal: 0, hopelessness: 0, sleep_complaint: true, themes: ["sleep"], crisis: "none" };
    expect(verifyMarkers(m)).toEqual(m);
    expect(verifyMarkers({ ...m, negative_affect: 5 })).toBeNull();
    expect(verifyMarkers({ ...m, crisis: "maybe" })).toBeNull();
  });
});

describe("number check (docs/05 §5.2)", () => {
  const facts = { contributors: ["later rest time (+1 h 40)"], total: 13, change: 10, steps: 8500, mean: 2.47 };
  it("accepts numbers that are in the facts, including formatted ones", () => {
    expect(numberCheck("Your score is 13, 10 higher than before.", facts).ok).toBe(true);
    expect(numberCheck("Rest came 1 h 40 later.", facts).ok).toBe(true);
    expect(numberCheck("About 8,500 steps and a mean of 2.5.", facts).ok).toBe(true);
  });
  it("rejects an answer containing a number not in the facts", () => {
    const r = numberCheck("Your score is 14.", facts);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual([14]);
  });
});

describe("PII check (task P)", () => {
  const opts = { placeLabels: ["gym", "work"], contactName: "Anna de Vries" };
  it("accepts a general note", () => {
    expect(piiCheck("A tiring week. I stayed in a lot but enjoyed a long walk.", opts).ok).toBe(true);
  });
  it("rejects a name, a digit, an @, a place label and the contact's name", () => {
    expect(piiCheck("I talked to Peter about it.", opts).ok).toBe(false);
    expect(piiCheck("Slept 5 hours most nights.", opts).ok).toBe(false);
    expect(piiCheck("Mail me at x@y", opts).ok).toBe(false);
    expect(piiCheck("I skipped the gym again.", opts).ok).toBe(false);
    expect(piiCheck("anna came over.", opts).ok).toBe(false);
  });
});

describe("crisis detection (docs/05 §5.3)", () => {
  it("detects every phrase of the keyword file inside a sentence", () => {
    for (const phrase of CRISIS_KEYWORDS) {
      expect(detectCrisis(`Honestly, lately I ${phrase} and nobody knows.`), phrase).toBe(true);
      expect(detectCrisis(`${phrase.toUpperCase()}.`), phrase).toBe(true);
    }
  });
  it("matches curly apostrophes and hyphen variants, and not ordinary text", () => {
    expect(detectCrisis("I don’t want to live like this")).toBe(true);
    expect(detectCrisis("thinking about self harm again")).toBe(true);
    expect(detectCrisis("Busy week, lots of meetings, slept fine.")).toBe(false);
    expect(detectCrisis(null)).toBe(false);
  });
});

describe("banned words and task checks", () => {
  it("rejects banned words as whole words", () => {
    expect(hasBannedWords("You should rest more.")).toBe(true);
    expect(hasBannedWords("This looks like a relapse.")).toBe(true);
    expect(hasBannedWords("Your symptoms improved")).toBe(true);
    expect(hasBannedWords("A change from your usual pattern.")).toBe(false);
  });
  it("task A rejects symptom questions, unknown digits and banned words", () => {
    const facts = { contributors: ["home more than usual (4 days)"], partOfDay: "evening" };
    expect(verifyTask("A", { intro: "You've been home more than usual lately. How are you doing today?", tone: "caring" }, { facts }).ok).toBe(true);
    expect(verifyTask("A", { intro: "Home for 5 days. How are you?", tone: "neutral" }, { facts }).ok).toBe(false);
    expect(verifyTask("A", { intro: "How is your sleep and appetite?", tone: "neutral" }, { facts }).ok).toBe(false);
    expect(verifyTask("A", { intro: "You seem depressed. How are you?", tone: "neutral" }, { facts }).ok).toBe(false);
  });
  it("task K only accepts known ids; task I drops unverified quotes", () => {
    expect(verifyTask("K", { action_ids: ["a1"] }, { actionIds: ["a1", "a2"] }).ok).toBe(true);
    expect(verifyTask("K", { action_ids: ["a9"] }, { actionIds: ["a1"] }).ok).toBe(false);
    const i = verifyTask("I", { answers: [{ item_id: "i1", answer: "no", quote: "didn't eat much" }, { item_id: "i2", answer: "yes", quote: "texted everyone" }] }, { itemIds: ["i1", "i2"], sourceText: "I didn't eat much today." });
    expect(i.ok && (i.value as { answers: unknown[] }).answers).toHaveLength(1);
  });
  it("task C and D apply length, number and word checks", () => {
    expect(verifyTask("C", { explanation: "Your total is 13, 10 points above your usual." }, { facts: { total: 13, changeFromReference: 10 } }).ok).toBe(true);
    expect(verifyTask("C", { explanation: "Your total is 12." }, { facts: { total: 13 } }).ok).toBe(false);
    const long = Array.from({ length: 70 }, () => "word").join(" ");
    expect(verifyTask("D", { reflection: long, open_question: "What helped?" }, { variant: "lite", facts: {} }).ok).toBe(false);
    expect(verifyTask("D", { reflection: long, open_question: "What helped?" }, { variant: "full", facts: {} }).ok).toBe(true);
  });
});

describe("quote check tolerates a dropped word, never an invented one", () => {
  const SAM = "When things go wrong I keep going to bed later, I skip the gym, I stay inside more and I eat badly. I also stop replying to messages.";
  it("a quote missing a word or two of the user's text is found, and the user's own span is returned", () => {
    expect(findQuoteSpan("I stop replying to messages", SAM)).toBe("I also stop replying to messages");
    expect(findQuoteSpan("going to bed later", SAM)).toBe("going to bed later");
    expect(findQuoteSpan("I keep going to bed later", SAM)).toBe("I keep going to bed later");
  });
  it("words that are not in the text, or in another order, still fail", () => {
    expect(findQuoteSpan("I stop walking my dog", SAM)).toBeNull();
    expect(findQuoteSpan("replying to messages stop", SAM)).toBeNull();
    expect(findQuoteSpan("I skip messages", SAM)).toBeNull(); // more than two words in between
  });
  it("verifyPlan keeps a paraphrased-by-omission sign and stores the user's own words", () => {
    const plan = verifyPlan({ rules: [], personal_checkin_items: [{ question: "Did you reply to messages today?", quote: "I stop replying to messages" }], actions: [] }, SAM);
    expect(plan.personal_checkin_items).toEqual([{ question: "Did you reply to messages today?", quote: "I also stop replying to messages" }]);
    expect(plan.dropped).toBe(0);
  });
});
