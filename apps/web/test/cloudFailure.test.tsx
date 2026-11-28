import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WeekAggregate } from "@hearth/engine";

// The cloud is allowed but not reachable (for example App Check refuses the browser): the
// first upload fails. The choice is kept, the weeks stay "not shared", and Weekly still shows
// the plain summary instead of an empty screen (end-to-end check, 2026-11-28).

vi.mock("../src/firebase", async (orig) => ({ ...(await orig<object>()), cloudConfigured: true }));
vi.mock("../src/cloud/client", () => ({
  cloudReady: () => true,
  startCloud: async () => {},
  currentUid: () => "u1",
  firestore: () => ({}),
}));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<object>()),
  doc: (_fs: unknown, path: string) => ({ path }),
  setDoc: async () => {
    throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  },
}));
vi.mock("../src/inference", async (orig) => ({
  ...(await orig<object>()),
  router: () => ({ run: async () => ({ ok: false, reason: "error", fallbackUsed: true, ledgerId: "x" }) }),
}));

import { db, getSettings, updateSettings } from "../src/store/db";
import { confirmFirstUpload } from "../src/cloud/sync";
import { setNavigator } from "../src/app/events";
import { Weekly } from "../src/screens/Weekly";

const week = (isoWeek: string): WeekAggregate => ({
  isoWeek,
  daysWithData: 7,
  indexMean: 0.4,
  daysElevated: 0,
  domainMeans: {},
  topContributors: [],
  ema: { n: 3, mood_low: 2, enjoyment: 5, energy: 5 },
  phq2: null,
  phq9: null,
  phq9Flagged: null,
  contexts: [],
  markerMeans: null,
  note: null,
});

let navigations: string[] = [];
beforeEach(async () => {
  await db.delete();
  await db.open();
  navigations = [];
  setNavigator((s) => navigations.push(s));
  await updateSettings({ cloudConsent: true, online: true, firstUploadConfirmed: false });
  for (const w of ["2026-W38", "2026-W39"]) await db.week_aggregates.put({ isoWeek: w, aggregate: week(w), uploaded: false } as never);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("first upload when the cloud refuses", () => {
  it("keeps the choice, keeps the weeks unshared and reports the failure", async () => {
    expect(await confirmFirstUpload()).toBe(false);
    expect((await getSettings()).firstUploadConfirmed).toBe(true);
    expect((await db.week_aggregates.toArray()).every((w) => !w.uploaded)).toBe(true);
  });

  it("goes back to Weekly from the preview and shows the plain summary", async () => {
    const view = render(<Weekly params={{ preview: "1" }} />);
    const share = await screen.findByText("Share weekly summaries");
    await act(async () => {
      fireEvent.click(share);
    });
    await waitFor(() => expect(navigations).toContain("weekly"));
    // The router keeps the same screen mounted and only drops the parameter.
    view.rerender(<Weekly params={{}} />);
    await screen.findByText(/In the week of .* there were 7 days with data\./);
    expect(screen.getByText(/Some weeks are not shared yet/)).toBeTruthy();
    expect(screen.queryByText(/Gemini writes a longer reflection once you have checked/)).toBeNull();
  });
});
