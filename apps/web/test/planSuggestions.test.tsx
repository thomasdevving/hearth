import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { verifyPlan, SAM_PLAN_EXPECTED, SAM_PLAN_TEXT, directionLegal } from "@hearth/engine";
import { db } from "../src/store/db";
import { loadPersona } from "../src/app/runtime";
import { setNavigator } from "../src/app/events";
import { PlanSetup, SUGGESTED_SIGNS, SUGGESTED_ITEMS, suggestionPlan, mergePlans } from "../src/screens/PlanSetup";

let nav: string[] = [];
beforeEach(async () => {
  await db.delete();
  await db.open();
  nav = [];
  setNavigator((s) => nav.push(s));
  await loadPersona("default", 1);
});
afterEach(() => cleanup());

describe("research-based sign suggestions", () => {
  it("every suggested sign is a legal rule and passes the plan checks", () => {
    for (const s of SUGGESTED_SIGNS) expect(directionLegal(s.feature, s.direction), s.id).toBe(true);
    // Each suggestion on its own passes the same checks as a model's card.
    for (const x of [...SUGGESTED_SIGNS, ...SUGGESTED_ITEMS]) {
      const one = suggestionPlan(new Set([x.id]));
      const raw = { rules: one.rules.map((r) => ({ ...r, place_label: "" })), personal_checkin_items: one.personal_checkin_items, actions: [] };
      const v = verifyPlan(raw, x.text);
      expect(v.valid, x.id).toBe(true);
      expect(v.dropped, x.id).toBe(0);
    }
  });
  it("ticked signs do not repeat a feature the model already found", () => {
    const model = verifyPlan(SAM_PLAN_EXPECTED, SAM_PLAN_TEXT);
    const merged = mergePlans(model, suggestionPlan(new Set(["bed_later", "move_less", "withdraw"])));
    expect(merged.rules.filter((r) => r.feature === "rest_midpoint")).toHaveLength(1);
    expect(merged.rules.map((r) => r.feature)).toContain("steps");
    expect(merged.personal_checkin_items.map((i) => i.question)).toContain("Did you have contact with someone you like today?");
  });
  it("ticking signs without writing anything makes cards without a model", async () => {
    render(<PlanSetup params={{ first: "1" }} />);
    await act(async () => {
      fireEvent.click(await screen.findByText("I go to bed later and later"));
      fireEvent.click(screen.getByText("I pull back from people"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Make cards"));
    });
    expect(await screen.findByText("Your plan as cards")).toBeTruthy();
    if (!document.body.textContent?.includes("Suggested sign you ticked: I go to bed later and later")) console.log(document.body.textContent);
    expect(document.body.textContent).toContain("Suggested sign you ticked: I go to bed later and later");
    expect(screen.getByText("Did you have contact with someone you like today?")).toBeTruthy();
  });
  it("'I don't know my signs yet' saves no signs and moves on", async () => {
    render(<PlanSetup params={{ first: "1" }} />);
    await act(async () => {
      fireEvent.click(await screen.findByText("I don't know my signs yet"));
    });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(await db.plan_rules.count()).toBe(0);
    expect(nav).toContain("baseline_phq");
  });
});
