// Weekly aggregate upload (docs/07 §3–4): only with consent, the first one after a preview.
import { collection, deleteDoc, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import type { WeekAggregate } from "@hearth/engine";
import { db, getSettings, newId, updateSettings } from "../store/db";
import { addInbox, openInbox } from "../app/runtime";
import { getToday } from "../app/clock";
import { emitChange } from "../app/events";
import { cloudReady, currentUid, firestore, startCloud } from "./client";
import { cloudConfigured } from "../firebase";

async function logUpload(path: string, body: unknown, task: string): Promise<void> {
  const text = JSON.stringify(body);
  await db.network_log.add({ at: new Date().toISOString(), url: `firestore:${path}`, method: "WRITE", bytes: new Blob([text]).size, task });
}

/** Called when an ISO week has been aggregated, and when consent or the preview changes. */
export async function syncWeeks(): Promise<void> {
  const s = await getSettings();
  if (!s.cloudConsent || !cloudConfigured || !s.online) return;
  const pending = (await db.week_aggregates.toArray()).filter((w) => !w.uploaded).sort((a, b) => (a.isoWeek < b.isoWeek ? -1 : 1));
  if (pending.length === 0) return;
  if (!s.firstUploadConfirmed) {
    if (!(await openInbox()).some((i) => i.type === "upload_preview")) await addInbox({ date: getToday(), type: "upload_preview", isoWeek: pending[pending.length - 1].isoWeek });
    emitChange();
    return;
  }
  if (!cloudReady()) await startCloud();
  const uid = currentUid()!;
  for (const w of pending) {
    const path = `users/${uid}/weeks/${w.isoWeek}`;
    await setDoc(doc(firestore(), path), w.aggregate);
    await logUpload(path, w.aggregate, "upload");
    await db.week_aggregates.update(w.isoWeek, { uploaded: true });
  }
  emitChange();
}

/** The user saw the exact JSON and agreed (first upload). */
export async function confirmFirstUpload(): Promise<void> {
  await updateSettings({ firstUploadConfirmed: true });
  for (const i of await openInbox()) if (i.type === "upload_preview") await db.inbox.update(i.id, { status: "done" });
  await syncWeeks();
}

export async function saveReport(kind: "weekly" | "clinician", body: unknown, model: "on_device" | "cloud" | "template", promptVersion: string, variant: "full" | "lite" | null): Promise<void> {
  const row = { id: newId("report"), kind, createdAt: new Date().toISOString(), body, model, promptVersion, variant };
  await db.reports.put(row);
  const s = await getSettings();
  // Nothing goes to the cloud before the user has reviewed what is shared (the first-upload preview).
  if (s.cloudConsent && s.firstUploadConfirmed && cloudConfigured && s.online && cloudReady()) {
    const path = `users/${currentUid()}/reports/${row.id}`;
    const data = { kind, createdAt: row.createdAt, body, model, promptVersion };
    try {
      await setDoc(doc(firestore(), path), data);
      await logUpload(path, data, "report");
    } catch (e) {
      console.warn("report upload", e); // the copy on this device is kept
    }
  }
}

/** A share is a snapshot with 128 bits of randomness as its id; default expiry 7 days (docs/07 §4). */
export async function createShare(weeks: WeekAggregate[], report: object | null, days = 7): Promise<string> {
  if (!cloudReady()) await startCloud();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const data = { ownerUid: currentUid(), createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + days * 86400000), weeks, report };
  await setDoc(doc(firestore(), `shares/${id}`), data);
  await logUpload(`shares/${id}`, { ...data, createdAt: "now", expiresAt: `+${days}d` }, "share");
  return id;
}

/** "Delete everything" also removes the user's documents in the cloud (docs/07 §2). */
export async function deleteCloud(): Promise<void> {
  if (!cloudConfigured) return;
  // Every cloud write is in the network log; with none, there is nothing to delete.
  const writes = (await db.network_log.toArray()).filter((r) => r.method === "WRITE" && r.url.startsWith("firestore:"));
  if (writes.length === 0) return;
  // After a reload the cloud is not started yet; this restores the same (persisted) anonymous user.
  if (!cloudReady()) await startCloud();
  const uid = currentUid()!;
  for (const sub of ["weeks", "reports"]) {
    const snap = await getDocs(collection(firestore(), `users/${uid}/${sub}`));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
  // Shares cannot be listed (firestore.rules); their ids are in the log.
  for (const w of writes) {
    const m = /^firestore:shares\/([0-9a-f]+)$/.exec(w.url);
    if (m) await deleteDoc(doc(firestore(), `shares/${m[1]}`));
  }
}
