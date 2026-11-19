import { beforeEach, describe, expect, it } from "vitest";
import { db, updateSettings } from "../src/store/db";
import { WebInferenceRouter } from "../src/inference/webRouter";
import { G_CASES, scoreCase, summarise } from "../src/eval/taskG";
import { installFakeLanguageModel } from "./fakeLanguageModel";
import { verifyPlan, type VerifiedPlan } from "@hearth/engine";

describe("task G evaluation scoring", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await updateSettings({ cloudConsent: false, onDeviceEnabled: true });
  });
  it("every expected rule in the set is legal and every case has text", () => {
    expect(G_CASES).toHaveLength(35);
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

describe("H scoring and ledger statistics", () => {
  it("scores labels and dates, and summarises the ledger", async () => {
    const { scoreH, ledgerStats, H_CASES } = await import("../src/eval/stats");
    expect(H_CASES).toHaveLength(30);
    const spain = H_CASES[0];
    expect(scoreH(spain, { type: "holiday", kind: "explains_sensors", start: "2026-11-16", end: "2026-11-22", quote: "x", confidence: "high", startResolved: true, endResolved: true })).toEqual({ label: true, dates: true });
    expect(scoreH(H_CASES[25], null)).toEqual({ label: true, dates: null });
    const e = (task: string, ranOn: "on_device" | "cloud" | "none", ms: number) => ({ id: task + ms, at: "", task, promptVersion: "", dataClass: "S2", decision: { run: "fallback", reason: "no_model" }, ranOn, outcome: ranOn === "none" ? "fallback" : "ok", attempts: 1, latencyMs: ranOn === "none" ? null : ms, bytesSent: 0, payloadSent: null }) as never;
    const st = ledgerStats([e("A", "on_device", 100), e("A", "on_device", 300), e("A", "cloud", 900), e("A", "none", 0)]);
    expect(st[0]).toMatchObject({ task: "A", calls: 4, fallbacks: 1, onDevice: { p50: 100, p95: 300 }, cloud: { p50: 900 } });
    expect(st[0].onDeviceShare).toBeCloseTo(2 / 3);
  });
});
