import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, updateSettings } from "../src/store/db";
import { loadPersona, openInbox } from "../src/app/runtime";
import { submitNote } from "../src/app/actions";
import { setNavigator } from "../src/app/events";
import { setRouter } from "../src/inference";
import { WebInferenceRouter } from "../src/inference/webRouter";
import { installNetworkLog } from "../src/inference/netlog";
import { installFakeLanguageModel, removeFakeLanguageModel } from "./fakeLanguageModel";

let navigations: string[] = [];
const markers = (crisis: string) => (system: string) => {
  if (system.includes("diary text")) return { negative_affect: 2, anhedonic_language: 1, social_withdrawal: 2, hopelessness: 1, sleep_complaint: false, themes: [], crisis };
  if (system.includes("changes someone's routine")) return { context: "none", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "" };
  return {};
};

describe("crisis label from the on-device model (docs/06 §4.1, §4.4)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    navigations = [];
    setNavigator((s) => navigations.push(s));
    window.fetch = vi.fn(async () => { throw new Error("no network"); }) as unknown as typeof fetch;
    installNetworkLog();
    setRouter(new WebInferenceRouter());
    await loadPersona("default", 1);
    await updateSettings({ onDeviceEnabled: true, online: true });
  });
  afterEach(() => removeFakeLanguageModel());

  it("'possible' shows support in place: no full-screen takeover, a support item, logged locally", async () => {
    installFakeLanguageModel("available", markers("possible"));
    const full = await submitNote("Yeah, I've started avoiding people again. Haven't answered anyone in days.");
    expect(full).toBe(false);
    expect(navigations).not.toContain("safety");
    expect((await openInbox()).some((i) => i.type === "support")).toBe(true);
    expect((await db.safety_events.toArray()).map((e) => e.entry)).toEqual(["model_possible"]);
  });

  it("'explicit' still opens the full safety screen", async () => {
    installFakeLanguageModel("available", markers("explicit"));
    expect(await submitNote("I had a really bad evening.")).toBe(true);
    expect(navigations).toContain("safety");
  });

  it("crisis wording opens the full safety screen before any model runs", async () => {
    installFakeLanguageModel("available", markers("none"));
    expect(await submitNote("Some days I just want to die.")).toBe(true);
    expect(navigations).toContain("safety");
  });
});
