import { describe, expect, it } from "vitest";
import { defaultConfig } from "@baseline/engine";

describe("web workspace", () => {
  it("imports the engine from source", () => {
    expect(defaultConfig.minReferenceDays).toBe(14);
  });
});
