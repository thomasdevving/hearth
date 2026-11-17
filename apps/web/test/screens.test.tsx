import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QUESTIONNAIRES } from "@hearth/engine";
import PHQ9 from "../../../shared/questionnaires/PHQ9.json";
import { db, updateSettings } from "../src/store/db";
import { loadPersona, getMeta, openInbox, stepDay } from "../src/app/runtime";
import { autoOnboard, completeCheckin, submitNote, submitQuestionnaire, confirmContextLabel } from "../src/app/actions";
import { setNavigator } from "../src/app/events";
import { QuestionnairePages } from "../src/screens/Questionnaire";
import { Safety } from "../src/screens/Safety";
import { timeMachine } from "../src/replay/controller";

let navigations: string[] = [];

beforeEach(async () => {
  await db.delete();
  await db.open();
  navigations = [];
  setNavigator((s) => navigations.push(s));
  await loadPersona("default", 1);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("questionnaire page (R1)", () => {
  it("renders every PHQ-9 page verbatim from the JSON", async () => {
    render(<QuestionnairePages instrument="PHQ9" onDone={() => {}} />);
    for (let i = 0; i < PHQ9.items.length; i++) {
      const box = document.querySelector(".questionnaire")!;
      expect(box.querySelector(".stem")!.textContent).toBe(PHQ9.stem);
      expect(box.querySelector(".item-text")!.textContent).toBe(PHQ9.items[i].text);
      const labels = [...box.querySelectorAll(".options button")].map((b) => b.textContent);
      expect(labels).toEqual(PHQ9.options.map((o) => o.label));
      if (i < PHQ9.items.length - 1) {
        await act(async () => {
          fireEvent.click(screen.getByText("Not at all"));
          await new Promise((r) => setTimeout(r, 200));
        });
      }
    }
    expect(QUESTIONNAIRES.PHQ9!.items.map((x) => x.text)).toEqual(PHQ9.items.map((x) => x.text));
  });
});

describe("safety flow (docs/06 §4)", () => {
  it("PHQ-9 item 9 above 0 opens the safety screen and logs the event locally", async () => {
    await submitQuestionnaire("PHQ9", [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(navigations).toContain("safety");
    const ev = await db.safety_events.toArray();
    expect(ev.map((e) => e.entry)).toEqual(["phq9_item9"]);
  });
  it("a crisis phrase in check-in free text opens the safety screen before any model runs", async () => {
    await autoOnboard();
    for (let i = 0; i < 10 && !(await openInbox()).some((x) => x.type === "checkin"); i++) await stepDay();
    const item = (await openInbox()).find((x) => x.type === "checkin");
    expect(item).toBeTruthy();
    if (item?.type !== "checkin") return;
    const res = await completeCheckin(item.checkinId, { answers: { mood_low: 6, enjoyment: 2, energy: 2, company: "Alone" }, personal: {}, freeText: "Honestly I sometimes think everyone would be better off without me." });
    expect(res.safety).toBe(true);
    expect(navigations).toContain("safety");
    expect(await db.ledger.count()).toBe(0); // no model call was made
  });
  it("a crisis phrase in a note opens it too", async () => {
    await submitNote("I want to die");
    expect(navigations).toContain("safety");
  });
  it("shows the crisis line offline, and Back only after 3 seconds", async () => {
    await updateSettings({ country: "NL", online: false });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Safety params={{}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText(/Call 113/)).toBeTruthy();
    const back = screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(false);
    vi.useRealTimers();
  });
  it("the safety scenario's PHQ-9 opens the safety screen", async () => {
    await loadPersona("safety", 1);
    await timeMachine.jump("phq9");
    const open = (await openInbox()).filter((i) => i.type === "questionnaire");
    expect(open.length).toBeGreaterThan(0);
    const meta = await getMeta();
    const { scriptedQuestionnaire, simulatePersona } = await import("@hearth/engine");
    const data = simulatePersona(1, "safety");
    const q2 = scriptedQuestionnaire(data.script, "PHQ2", meta!.today)!;
    if (open.some((i) => i.type === "questionnaire" && i.instrument === "PHQ2")) await submitQuestionnaire("PHQ2", q2);
    await submitQuestionnaire("PHQ9", scriptedQuestionnaire(data.script, "PHQ9", meta!.today)!);
    expect(navigations).toContain("safety");
  });
});

describe("context confirmation (task H → context_confirm → masking)", () => {
  it("the holiday day waits for the confirmation and is then masked", async () => {
    await autoOnboard();
    timeMachine.setAutoAnswer(true);
    for (let i = 0; i < 59; i++) await timeMachine.step();
    timeMachine.setAutoAnswer(false);
    expect((await getMeta())!.dayNumber).toBe(60);
    const r = await stepDay(); // day 61 starts with Sam's note
    expect(r).toBe("paused");
    const note = (await openInbox()).find((i) => i.type === "note");
    expect(note?.type === "note" && note.text).toContain("Spain");
    if (note?.type !== "note") return;
    // No on-device model here: the one-tap picker is offered.
    await submitNote(note.text, { inboxId: note.id });
    const confirm = (await openInbox()).find((i) => i.type === "context_confirm");
    expect(confirm).toBeTruthy();
    const day61 = (await getMeta())!.today;
    expect(await db.day_records.get(day61)).toBeUndefined(); // waits for the answer
    if (confirm?.type !== "context_confirm") return;
    await confirmContextLabel({ ...confirm.context, type: "holiday", kind: "explains_sensors", end: "2026-08-23" }, confirm.id);
    const rec = await db.day_records.get(day61);
    expect(rec?.maskedDomains).toContain("mobility");
    expect((await db.ledger.toArray()).every((e) => e.ranOn === "none")).toBe(true);
  });
});
