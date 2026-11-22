// "Call a friend" (docs/DECISIONS.md, 2026-11-22). Up to three people the user chose, with a
// message in their own words. Everything stays on this device (S3). Hearth never calls or
// sends anything itself: the links open the phone or Messages, and the user presses send.
import { db, newId, DEFAULT_MESSAGE, type Person } from "../store/db";
import { emitChange } from "./events";

export const MAX_PEOPLE = 3;

export async function getPeople(): Promise<Person[]> {
  return (await db.people.orderBy("order").toArray()).filter((p) => p.phone.trim() || p.name.trim());
}

export async function savePeople(people: Omit<Person, "id" | "order">[]): Promise<void> {
  const keep = people.filter((p) => p.phone.trim()).slice(0, MAX_PEOPLE);
  await db.transaction("rw", db.people, async () => {
    await db.people.clear();
    for (const [i, p] of keep.entries()) await db.people.put({ ...p, id: newId("person"), order: i, message: p.message.trim() || DEFAULT_MESSAGE });
  });
  emitChange();
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, "");
export const telHref = (p: Person) => `tel:${digits(p.phone)}`;
/** `sms:<number>?&body=…` opens Messages with the text filled in on both iPhone and Android. */
export const smsHref = (p: Person) => `sms:${digits(p.phone)}?&body=${encodeURIComponent(p.message || DEFAULT_MESSAGE)}`;

/** Sam's people in the demo: fictional 555-01xx numbers. */
export const DEMO_PEOPLE: Omit<Person, "id" | "order">[] = [
  { name: "My sister", phone: "+1 555 0142", goodFor: "a call", message: "Hey sis, rough few days. Can I call you tonight?" },
  { name: "Maya", phone: "+1 555 0187", goodFor: "a walk", message: "Walk tomorrow?" },
];
