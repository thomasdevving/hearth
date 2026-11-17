import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIXTURE_FNS } from "./fixture-fns";

// Golden fixtures: the contract for the iOS bridge (docs/09 M2). Regenerate with
// `npm run fixtures -w packages/engine` only when a behaviour change is intended.
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("golden fixtures", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });
  for (const file of files) {
    it(file, () => {
      const { fn, input, expectedOutput } = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(FIXTURE_FNS[fn], `unknown fn ${fn}`).toBeTypeOf("function");
      const out = FIXTURE_FNS[fn](...input);
      expect(JSON.parse(JSON.stringify(out ?? null))).toEqual(expectedOutput);
    });
  }
});
