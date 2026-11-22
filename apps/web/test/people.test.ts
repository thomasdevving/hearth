import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { db, DEFAULT_MESSAGE, HearthDB } from "../src/store/db";
import { DEMO_PEOPLE, getPeople, MAX_PEOPLE, savePeople, smsHref, telHref } from "../src/app/people";
import { loadPersona } from "../src/app/runtime";
import { CallAFriend } from "../src/ui/CallAFriend";

describe("call a friend", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("keeps at most three people, drops rows without a number, fills an empty message", async () => {
    await savePeople([
      { name: "A", phone: "+31 6 1234 5678", goodFor: "", message: "" },
      { name: "No number", phone: " ", goodFor: "", message: "x" },
      { name: "B", phone: "06-1", goodFor: "a walk", message: "Walk?" },
      { name: "C", phone: "06-2", goodFor: "", message: "Hi" },
      { name: "D", phone: "06-3", goodFor: "", message: "Hi" },
    ]);
    const ps = await getPeople();
    expect(ps.map((p) => p.name)).toEqual(["A", "B", "C"]);
    expect(ps.length).toBe(MAX_PEOPLE);
    expect(ps[0].message).toBe(DEFAULT_MESSAGE);
  });

  it("builds call and message links; the message is filled in, never sent", async () => {
    await savePeople([{ name: "Maya", phone: "+1 555 0187", goodFor: "", message: "Walk tomorrow?" }]);
    const [p] = await getPeople();
    expect(telHref(p)).toBe("tel:+15550187");
    expect(smsHref(p)).toBe("sms:+15550187?&body=Walk%20tomorrow%3F");
  });

  it("the demo persona comes with Sam's two people", async () => {
    await loadPersona("default", 1);
    expect((await getPeople()).map((p) => p.name)).toEqual(DEMO_PEOPLE.map((p) => p.name));
  });

  it("an existing trusted contact becomes the first person when the database upgrades", async () => {
    await db.delete();
    const old = new Dexie("hearth");
    old.version(2).stores({ trusted_contact: "key", helped_notes: "id, signQuote, createdAt" });
    await old.open();
    await old.table("trusted_contact").put({ key: "singleton", value: { name: "Jo", phone: "0612345678" } });
    old.close();
    const upgraded = new HearthDB();
    await upgraded.open();
    const people = await upgraded.people.toArray();
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: "Jo", phone: "0612345678", message: DEFAULT_MESSAGE });
    upgraded.close();
  });

  it("the card offers to add someone when the list is empty", () => {
    render(createElement(CallAFriend, { people: [] }));
    expect(screen.getByText("Add someone")).toBeTruthy();
  });
});
