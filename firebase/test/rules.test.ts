// Firestore rules (firebase/firestore.rules), run against the local emulator:
//   npm run test:rules
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, Timestamp } from "firebase/firestore";

let env: RulesTestEnvironment;
const week = { isoWeek: "2026-W47", daysWithData: 7, indexMean: 0.3, daysElevated: 0, domainMeans: {}, topContributors: [], ema: { n: 0, mood_low: null, enjoyment: null, energy: null }, phq2: null, phq9: null, phq9Flagged: null, contexts: [], markerMeans: null, note: null };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-hearth",
    firestore: { rules: readFileSync(fileURLToPath(new URL("../firestore.rules", import.meta.url)), "utf8") },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

describe("users/{uid}/weeks", () => {
  it("the owner can write and read their week", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "users/alice/weeks/2026-W47"), week));
    await assertSucceeds(getDoc(doc(alice, "users/alice/weeks/2026-W47")));
  });
  it("another user cannot read or write a week document", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "users/alice/weeks/2026-W47"), week));
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "users/alice/weeks/2026-W47")));
    await assertFails(getDocs(collection(bob, "users/alice/weeks")));
    await assertFails(setDoc(doc(bob, "users/alice/weeks/2026-W48"), week));
  });
  it("a signed-out visitor cannot read it", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "users/alice/weeks/2026-W47"), week));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/alice/weeks/2026-W47")));
  });
});

describe("users/{uid}/reports", () => {
  it("only the owner", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "users/alice/reports/r1"), { kind: "weekly", body: {} }));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "users/alice/reports/r1")));
  });
});

describe("shares/{shareId}", () => {
  const future = () => Timestamp.fromMillis(Date.now() + 7 * 86400000);
  it("the owner creates a share; anyone with the id can get it until it expires; nobody can list", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "shares/s1"), { ownerUid: "alice", createdAt: Timestamp.now(), expiresAt: future(), weeks: [week], report: null }));
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "shares/s1")));
    await assertFails(getDocs(collection(anon, "shares")));
    await assertFails(setDoc(doc(alice, "shares/s1"), { ownerUid: "alice", createdAt: Timestamp.now(), expiresAt: future(), weeks: [], report: null }));
    await assertFails(deleteDoc(doc(env.authenticatedContext("bob").firestore(), "shares/s1")));
    await assertSucceeds(deleteDoc(doc(alice, "shares/s1")));
  });
  it("an expired share cannot be read, and a share cannot be made for someone else or for longer than 30 days", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "shares/old"), { ownerUid: "alice", createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() - 1000), weeks: [], report: null }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "shares/old")));
    const alice = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(alice, "shares/s2"), { ownerUid: "bob", createdAt: Timestamp.now(), expiresAt: future(), weeks: [], report: null }));
    await assertFails(setDoc(doc(alice, "shares/s3"), { ownerUid: "alice", createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 40 * 86400000), weeks: [], report: null }));
  });
});

describe("everything else", () => {
  it("is closed", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("alice").firestore(), "anything/else")));
  });
});
