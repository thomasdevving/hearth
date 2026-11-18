// "What helped me last time" (docs/05 tasks R and T). Everything here stays on this device (S3).
import { draftWithoutModel } from "@hearth/engine";
import { db, newId, type HelpedNote } from "../store/db";
import { router } from "../inference";
import { getToday } from "./clock";
import { emitChange } from "./events";

export interface Sign {
  quote: string; // the user's own words; also the key notes are attached to
  kind: "rule" | "item";
  id: string;
}

/** The user's active signs: confirmed plan rules and their own check-in questions. */
export async function userSigns(): Promise<Sign[]> {
  const rules = (await db.plan_rules.toArray()).filter((r) => r.active).map((r) => ({ quote: r.quote, kind: "rule" as const, id: r.id }));
  const items = (await db.personal_items.toArray()).filter((i) => i.active).map((i) => ({ quote: i.quote, kind: "item" as const, id: i.id }));
  const seen = new Set<string>();
  return [...rules, ...items].filter((s) => s.quote && !seen.has(s.quote) && seen.add(s.quote));
}

export async function notesFor(signQuote: string): Promise<HelpedNote[]> {
  return (await db.helped_notes.where("signQuote").equals(signQuote).toArray()).filter((n) => !n.archived).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function saveNote(n: { signQuote: string; text: string; audio: Blob | null; message: string | null; contactName: string | null }): Promise<void> {
  await db.helped_notes.put({ id: newId("helped"), ...n, createdAt: getToday(), source: "user", archived: false });
  emitChange();
}

export async function archiveNote(id: string): Promise<void> {
  await db.helped_notes.update(id, { archived: true });
  emitChange();
}

export interface Recall {
  matches: { sign: Sign; quote: string }[];
  ranOn: "on_device" | "cloud" | "none";
}

/**
 * Task R: which of the user's own signs their check-in text describes, matched by meaning on
 * this device. Only signs with a quote really in the text survive (R8). Without a model: no
 * match, and the user picks a sign themselves.
 */
export async function recallFromText(text: string): Promise<Recall> {
  const signs = await userSigns();
  if (!text.trim() || signs.length === 0) return { matches: [], ranOn: "none" };
  const ids = signs.map((_, i) => `s${i + 1}`);
  const res = await router().run<{ matches: { sign_id: string; quote: string }[] }>(
    "R",
    { text, signs: signs.map((s, i) => ({ id: ids[i], words: s.quote })) },
    { sourceText: text, verify: { signIds: ids } },
  );
  if (!res.ok) return { matches: [], ranOn: "none" };
  return { matches: res.value.matches.map((m) => ({ sign: signs[ids.indexOf(m.sign_id)], quote: m.quote })), ranOn: res.ranOn };
}

/** Task T: a short text in the user's own voice, from their saved note. Without a model: their saved or quoted message. */
export async function draftText(note: HelpedNote): Promise<{ message: string; ranOn: "on_device" | "cloud" | "template" }> {
  const res = await router().run<{ message: string }>("T", { text: note.text, name: note.contactName ?? "", saved_message: note.message ?? "" }, { sourceText: note.text });
  if (res.ok && res.value.message) return { message: res.value.message, ranOn: res.ranOn };
  return { message: draftWithoutModel(note.text, note.message), ranOn: "template" };
}

/** Opens the user's own messaging app with the text filled in. Hearth never sends anything. */
export async function openMessage(message: string): Promise<"shared" | "sms" | "copied"> {
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
    location.href = `sms:?&body=${encodeURIComponent(message)}`;
    return "sms";
  }
  if (nav.share) {
    try {
      await nav.share({ text: message });
      return "shared";
    } catch {
      /* fall through to copy */
    }
  }
  await navigator.clipboard?.writeText(message);
  return "copied";
}
