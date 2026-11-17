import { beforeEach, describe, expect, it } from "vitest";
import { db, updateSettings } from "../src/store/db";
import { WebInferenceRouter } from "../src/inference/webRouter";
import { G_CASES, scoreCase, summarise } from "../src/eval/taskG";
import { installFakeLanguageModel } from "./fakeLanguageModel";
import { verifyPlan, type VerifiedPlan } from "@baseline/engine";

describe("task G evaluation scoring", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await updateSettings({ cloudConsent: false, onDeviceEnabled: true });
  });
  it("every expected rule in the set is legal and every case has text", () => {
    expect(G_CASES).toHaveLength(20);
    for (const c of G_CASES) {
      expect(c.text.length).toBeGreaterThan(10);
      const raw = { rules: c.rules.map(([f, d, l]) => ({ feature: f, direction: d, place_label: l ?? "", quote: c.text.slice(0, 12) })), personal_checkin_items: [], actions: [] };
      expect(verifyPlan(raw, c.text).rules).toHaveLength(c.rules.length);
    }
  });
  it("a perfect model scores 100 %, an invented rule lowers precision and counts as a quote failure", async () => {
    const sam = G_CASES.find((c) => c.id === "sam")!;
    installFakeLanguageModel("available");
    let raw: unknown = null;
    const res = await new WebInferenceRouter().run<VerifiedPlan>("G", { text: sam.text }, { sourceText: sam.text, onRaw: (r) => (raw = r) });
    expect(res.ok).toBe(true);
    const r1 = scoreCase(sam, res.ok ? res.value : null, raw, "ok", "on_device", 10);
    expect(summarise([r1])).toMatchObject({ precision: 1, recall: 1, quoteRejectedShare: 0 });
    const bad = { rules: [...(raw as { rules: unknown[] }).rules, { feature: "steps", direction: "lower", place_label: "", quote: "I stop running" }], personal_checkin_items: [], actions: [] };
    const r2 = scoreCase(sam, verifyPlan(bad, sam.text), bad, "ok", "on_device", 10);
    expect(r2.quoteRejected).toBe(1);
    expect(r2.tp).toBe(3);
    const wrong = { rules: [{ feature: "steps", direction: "lower", place_label: "", quote: "I stay inside more" }], personal_checkin_items: [], actions: [] };
    const s = summarise([scoreCase(sam, verifyPlan(wrong, sam.text), wrong, "ok", "on_device", 5)]);
    expect(s.precision).toBe(0);
    expect(s.recall).toBe(0);
  });
});
