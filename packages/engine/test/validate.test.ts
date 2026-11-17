import { describe, expect, it } from "vitest";
import { parseJsonLoose, schemas, validate } from "../src/guardrails/validate";

describe("validate", () => {
  it("accepts a valid task A output", () => {
    expect(validate("A", { intro: "Hello there. How are you today?", tone: "caring" })).toEqual({ valid: true, errors: [] });
  });
  it("rejects wrong enum, missing and extra fields", () => {
    expect(validate("A", { intro: "x", tone: "angry" }).valid).toBe(false);
    expect(validate("A", { intro: "x" }).valid).toBe(false);
    expect(validate("A", { intro: "x", tone: "light", extra: 1 }).valid).toBe(false);
    expect(validate("A", { intro: "x".repeat(161), tone: "light" }).valid).toBe(false);
  });
  it("rejects non-objects, null and empty input", () => {
    for (const v of [null, undefined, "", [], 3, {}]) expect(validate("G", v).valid).toBe(false);
  });
  it("accepts empty arrays where the schema allows them", () => {
    expect(validate("G", { rules: [], personal_checkin_items: [], actions: [] }).valid).toBe(true);
    expect(validate("K", { action_ids: [] }).valid).toBe(true);
  });
  it("checks nested items and limits", () => {
    const rule = { feature: "home_stay", direction: "higher", place_label: "", quote: "I stay inside" };
    expect(validate("G", { rules: [rule], personal_checkin_items: [], actions: [] }).valid).toBe(true);
    expect(validate("G", { rules: [{ ...rule, feature: "mood" }], personal_checkin_items: [], actions: [] }).valid).toBe(false);
    expect(validate("G", { rules: Array(7).fill(rule), personal_checkin_items: [], actions: [] }).valid).toBe(false);
    expect(validate("B", { negative_affect: 4, anhedonic_language: 0, social_withdrawal: 0, hopelessness: 0, sleep_complaint: false, themes: [], crisis: "none" }).valid).toBe(false);
    expect(validate("B", { negative_affect: 1.5, anhedonic_language: 0, social_withdrawal: 0, hopelessness: 0, sleep_complaint: false, themes: [], crisis: "none" }).valid).toBe(false);
  });
  it("reports readable errors", () => {
    const res = validate("H", { context: "holiday" });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
  it("works with a schema object and with an unknown id", () => {
    expect(validate({ type: "number", minimum: 2 }, 3).valid).toBe(true);
    expect(validate({ type: "number", minimum: 2 }, 1).valid).toBe(false);
    expect(validate("nope" as never, 1).valid).toBe(false);
  });
  it("has every schema in shared/schemas", () => {
    expect(Object.keys(schemas).sort()).toEqual(["A", "B", "C", "D", "E", "G", "H", "I", "K", "P", "Q_classify", "Q_phrase"]);
  });
  it("parseJsonLoose", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
    expect(parseJsonLoose("not json")).toBeUndefined();
    expect(parseJsonLoose("")).toBeUndefined();
  });
});
