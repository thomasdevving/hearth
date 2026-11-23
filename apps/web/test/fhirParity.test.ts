// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFhirBundle, type FhirInput } from "../src/export/fhir";

// The FHIR export must be the same on the web and on iOS (apps/ios/Hearth/App/FhirExport.swift).
// Both build it from fixtures/fhir-input.json; the iOS test compares its output with
// fixtures/fhir-web.json, which this test keeps in step with src/export/fhir.ts.
const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** urn:uuid values are random; number them in order of appearance. */
function numberUuids(json: string): string {
  const seen = new Map<string, string>();
  return json.replace(/urn:uuid:[0-9a-zA-Z-]+/g, (u) => {
    if (!seen.has(u)) seen.set(u, `urn:uuid:${seen.size + 1}`);
    return seen.get(u)!;
  });
}

describe("FHIR export parity fixture", () => {
  it("fhir-web.json is the web's output for fhir-input.json", () => {
    const input = JSON.parse(readFileSync(`${dir}fhir-input.json`, "utf8")) as FhirInput;
    const out = numberUuids(JSON.stringify(buildFhirBundle(input), null, 2)) + "\n";
    if (process.env.UPDATE_FIXTURES) writeFileSync(`${dir}fhir-web.json`, out);
    expect(out).toBe(readFileSync(`${dir}fhir-web.json`, "utf8"));
  });
});
