import { describe, expect, it } from "vitest";
import { draftWithoutModel, quotedMessage, route, routeTask, TASKS, verifyTask } from "../src/index";

const TEXT = "Yeah, I've started avoiding people again. Haven't answered anyone in days.";

describe("task R: recall by meaning", () => {
  it("keeps only the user's own signs, with a quote that is really in their text", () => {
    const out = verifyTask("R", { matches: [
      { sign_id: "i_reply", quote: "Haven't answered anyone in days" },
      { sign_id: "made_up", quote: "avoiding people" },
    ] }, { sourceText: TEXT, signIds: ["i_reply", "r_gym"] });
    expect(out).toEqual({ ok: true, value: { matches: [{ sign_id: "i_reply", quote: "Haven't answered anyone in days" }] } });
    const notInText = verifyTask("R", { matches: [{ sign_id: "r_gym", quote: "I skipped the gym" }] }, { sourceText: TEXT, signIds: ["r_gym"] });
    expect(notInText).toEqual({ ok: true, value: { matches: [] } });
  });
  it("an empty list is a valid answer; a broken one is rejected", () => {
    expect(verifyTask("R", { matches: [] }, { sourceText: TEXT, signIds: [] })).toEqual({ ok: true, value: { matches: [] } });
    expect(verifyTask("R", { signs: ["x"] }, { sourceText: TEXT }).ok).toBe(false);
  });
});

describe("task T: draft a text", () => {
  const facts = { note: "Calling felt like too much. I texted Maya “walk tomorrow?” and that was easier.", name: "Maya" };
  it("accepts a short message", () => {
    expect(verifyTask("T", { message: "Hey Maya, walk tomorrow?" }, { facts })).toEqual({ ok: true, value: { message: "Hey Maya, walk tomorrow?" } });
  });
  it("rejects diagnostic words, invented numbers and long text", () => {
    expect(verifyTask("T", { message: "I think my depression is back, walk?" }, { facts }).ok).toBe(false);
    expect(verifyTask("T", { message: "Walk tomorrow at 7?" }, { facts }).ok).toBe(false);
    expect(verifyTask("T", { message: Array(45).fill("word").join(" ") }, { facts }).ok).toBe(false);
  });
  it("without a model: the saved message, else the quoted one, never invented text", () => {
    expect(draftWithoutModel(facts.note, "Walk tomorrow?")).toBe("Walk tomorrow?");
    expect(draftWithoutModel(facts.note)).toBe("walk tomorrow?");
    expect(draftWithoutModel("Going outside helped.")).toBe("");
    expect(quotedMessage("I texted 'fancy a coffee?' to Sam")).toBe("fancy a coffee?");
  });
});

describe("routing (R3)", () => {
  it("R and T are S3: on-device only, never a cloud fallback", () => {
    expect(TASKS.R.dataClass).toBe("S3");
    expect(TASKS.T.dataClass).toBe("S3");
    expect(routeTask("R", { cloudConsent: true, onDeviceAvailable: true, online: true })).toMatchObject({ run: "model", mode: "ONLY_ON_DEVICE" });
    expect(routeTask("T", { cloudConsent: true, onDeviceAvailable: false, online: true })).toMatchObject({ run: "fallback" });
    expect(route).toBeTypeOf("function");
  });
});

describe("task R on everyday ways of writing", () => {
  const ids = ["i_reply"];
  const r = (text: string, quote: string) => verifyTask("R", { matches: [{ sign_id: "i_reply", quote }] }, { sourceText: text, signIds: ids });
  it("matches a sign written in other words, with typos or slang", () => {
    expect(r("havent answerd anyone in days tbh", "havent answerd anyone")).toMatchObject({ ok: true, value: { matches: [{ sign_id: "i_reply" }] } });
    expect(r("Ghosting everyone again 😶", "Ghosting everyone again")).toMatchObject({ ok: true, value: { matches: [{ sign_id: "i_reply" }] } });
  });
  it("does not match a sign the person says is not happening", () => {
    expect(r("I haven't been avoiding people this week, actually.", "avoiding people")).toEqual({ ok: true, value: { matches: [] } });
    expect(r("Not ignoring my messages anymore.", "ignoring my messages")).toEqual({ ok: true, value: { matches: [] } });
  });
  it("a negation in an earlier sentence does not count", () => {
    expect(r("No gym today. Avoiding people again.", "Avoiding people again")).toMatchObject({ ok: true, value: { matches: [{ sign_id: "i_reply" }] } });
  });
});
