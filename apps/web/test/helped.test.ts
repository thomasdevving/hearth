import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAM_HELPED_NOTE } from "@hearth/engine";
import { db, updateSettings } from "../src/store/db";
import { loadPersona } from "../src/app/runtime";
import { draftText, notesFor, recallFromText, saveNote } from "../src/app/helped";
import { installNetworkLog } from "../src/inference/netlog";
import { setRouter } from "../src/inference";
import { WebInferenceRouter } from "../src/inference/webRouter";
import { installFakeLanguageModel, removeFakeLanguageModel } from "./fakeLanguageModel";

const TEXT = "Yeah, I've started avoiding people again. Haven't answered anyone in days.";
const requests: string[] = [];

// The fake model plays tasks R and T; it answers from the sign list it is given.
function fakeRT(system: string, user: string): unknown {
  if (system.includes("just wrote in a check-in")) {
    const id = [...user.matchAll(/"id":"([^"]+)","words":"([^"]+)"/g)].find((m) => /repl/.test(m[2]))?.[1];
    return { matches: id ? [{ sign_id: id, quote: "avoiding people again" }, { sign_id: "invented", quote: "avoiding people" }] : [] };
  }
  if (system.includes("write a short text message")) return { message: "Hey Maya, walk tomorrow?" };
  return {};
}

describe("what helped me last time (tasks R and T)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    requests.length = 0;
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      throw new Error("no network in this test");
    }) as unknown as typeof fetch;
    installNetworkLog();
    setRouter(new WebInferenceRouter());
    await loadPersona("default", 1);
    await updateSettings({ cloudConsent: true, onDeviceEnabled: true, online: true });
    await db.personal_items.put({ id: "i2", question: "Did you reply to messages today?", quote: "stop replying to messages", active: true });
    await db.plan_rules.put({ id: "r1", feature: "rest_midpoint", direction: "later", placeId: null, quote: "going to bed later", active: true });
  });
  afterEach(() => removeFakeLanguageModel());

  it("Sam's note from an earlier hard week is there from the start", async () => {
    const notes = await notesFor(SAM_HELPED_NOTE.signQuote);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain("walk tomorrow?");
  });

  it("recalls the sign by meaning on this device, drops invented signs, and sends nothing even with cloud consent", async () => {
    installFakeLanguageModel("available", fakeRT);
    const r = await recallFromText(TEXT);
    expect(r.ranOn).toBe("on_device");
    expect(r.matches.map((m) => m.sign.quote)).toEqual(["stop replying to messages"]);
    expect(r.matches[0].quote).toBe("avoiding people again");
    const draft = await draftText((await notesFor("stop replying to messages"))[0]);
    expect(draft).toEqual({ message: "Hey Maya, walk tomorrow?", ranOn: "on_device" });
    expect(requests).toEqual([]);
    const ledger = (await db.ledger.orderBy("at").toArray()).filter((l) => l.task === "R" || l.task === "T");
    expect(ledger.map((l) => [l.task, l.ranOn, l.payloadSent]).sort()).toEqual([["R", "on_device", null], ["T", "on_device", null]]);
  });

  it("without a model: no guessed match, and the draft is the person's own saved message (never the cloud)", async () => {
    installFakeLanguageModel("unavailable");
    const r = await recallFromText(TEXT);
    expect(r.matches).toEqual([]);
    const draft = await draftText((await notesFor("stop replying to messages"))[0]);
    expect(draft).toEqual({ message: "Walk tomorrow?", ranOn: "template" });
    expect(requests).toEqual([]);
  });

  it("saving a note attaches it to the sign by the person's own words", async () => {
    await saveNote({ signQuote: "going to bed later", text: "Phone out of the bedroom at ten.", audio: null, message: null, contactName: null });
    expect((await notesFor("going to bed later")).map((n) => n.text)).toEqual(["Phone out of the bedroom at ten."]);
  });
});

describe("notes follow the sign when the wording differs a little", () => {
  it("a note for 'stop replying to messages' shows for the sign 'I also stop replying to messages'", async () => {
    await db.delete();
    await db.open();
    await loadPersona("default", 1);
    expect((await notesFor("I also stop replying to messages")).length).toBe(1);
    expect((await notesFor("I skip the gym")).length).toBe(0);
  });
});
