import { describe, expect, it } from "vitest";
import { route, routeTask, TASKS, type RouteRequest } from "../src/index";

const req = (p: Partial<RouteRequest>): RouteRequest => ({ dataClass: "S2", cloudConsent: false, onDeviceAvailable: false, online: true, prefersCloud: false, hasLiteVariant: false, ...p });

describe("routing table (docs/05 §2)", () => {
  it.each([
    [req({ dataClass: "S3", onDeviceAvailable: true }), { run: "model", mode: "ONLY_ON_DEVICE", variant: "full" }],
    [req({ dataClass: "S3", onDeviceAvailable: false, cloudConsent: true }), { run: "fallback", reason: "no_model" }],
    [req({ dataClass: "S2", onDeviceAvailable: true, cloudConsent: true }), { run: "model", mode: "PREFER_ON_DEVICE", variant: "full" }],
    [req({ dataClass: "S2", onDeviceAvailable: true, cloudConsent: false }), { run: "model", mode: "ONLY_ON_DEVICE", variant: "full" }],
    [req({ dataClass: "S2", onDeviceAvailable: false, cloudConsent: true, online: true }), { run: "model", mode: "ONLY_IN_CLOUD", variant: "full" }],
    [req({ dataClass: "S2", onDeviceAvailable: false, cloudConsent: true, online: false }), { run: "fallback", reason: "offline" }],
    [req({ dataClass: "S2", onDeviceAvailable: false, cloudConsent: false }), { run: "fallback", reason: "no_model" }],
    [req({ dataClass: "S1", cloudConsent: false, onDeviceAvailable: true }), { run: "fallback", reason: "no_consent" }],
    [req({ dataClass: "S1", cloudConsent: true, prefersCloud: true, online: true, hasLiteVariant: true }), { run: "model", mode: "PREFER_IN_CLOUD", variant: "full" }],
    [req({ dataClass: "S1", cloudConsent: true, prefersCloud: true, online: true, hasLiteVariant: false }), { run: "model", mode: "ONLY_IN_CLOUD", variant: "full" }],
    [req({ dataClass: "S1", cloudConsent: true, prefersCloud: true, online: false, hasLiteVariant: true, onDeviceAvailable: true }), { run: "model", mode: "ONLY_ON_DEVICE", variant: "lite" }],
    [req({ dataClass: "S1", cloudConsent: true, prefersCloud: true, online: false, hasLiteVariant: true, onDeviceAvailable: false }), { run: "fallback", reason: "offline" }],
    [req({ dataClass: "S1", cloudConsent: true, prefersCloud: true, online: false, hasLiteVariant: false, onDeviceAvailable: true }), { run: "fallback", reason: "offline" }],
  ])("row %#", (r, expected) => {
    expect(route(r)).toEqual(expected);
  });

  it("S3 never returns a cloud mode for any combination (property)", () => {
    const bools = [true, false];
    let n = 0;
    for (const cloudConsent of bools)
      for (const onDeviceAvailable of bools)
        for (const online of bools)
          for (const prefersCloud of bools)
            for (const hasLiteVariant of bools) {
              const d = route({ dataClass: "S3", cloudConsent, onDeviceAvailable, online, prefersCloud, hasLiteVariant });
              n++;
              if (d.run === "model") expect(d.mode).toBe("ONLY_ON_DEVICE");
              else expect(d.reason).toBe("no_model");
            }
    expect(n).toBe(32);
  });

  it("without consent nothing can reach the cloud, for any class", () => {
    for (const dataClass of ["S1", "S2", "S3"] as const)
      for (const onDeviceAvailable of [true, false])
        for (const online of [true, false])
          for (const prefersCloud of [true, false])
            for (const hasLiteVariant of [true, false]) {
              const d = route({ dataClass, cloudConsent: false, onDeviceAvailable, online, prefersCloud, hasLiteVariant });
              if (d.run === "model") expect(d.mode).toBe("ONLY_ON_DEVICE");
            }
  });

  it("uses the task table", () => {
    expect(TASKS.G.dataClass).toBe("S3");
    expect(routeTask("H", { cloudConsent: true, onDeviceAvailable: false, online: true })).toEqual({ run: "fallback", reason: "no_model" });
    expect(routeTask("D", { cloudConsent: true, onDeviceAvailable: true, online: false })).toEqual({ run: "model", mode: "ONLY_ON_DEVICE", variant: "lite" });
  });
});
