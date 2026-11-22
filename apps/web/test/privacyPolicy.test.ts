import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HOSTS, contentSecurityPolicy } from "../src/privacy/policy";

describe("provable privacy: the Content-Security-Policy", () => {
  const firebase = JSON.parse(readFileSync(join(__dirname, "../../../firebase.json"), "utf8"));
  const header = firebase.hosting.headers
    .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
    .find((h: { key: string }) => h.key === "Content-Security-Policy")?.value as string;

  it("firebase.json sends exactly the policy built from the allowed list", () => {
    expect(header).toBe(contentSecurityPolicy());
  });

  it("connect-src allows only the app itself and the listed Firebase services", () => {
    const connect = header.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"))!;
    const sources = connect.split(/\s+/).slice(1);
    expect(sources).toEqual(["'self'", ...ALLOWED_HOSTS.map((h) => h.origin)]);
    for (const s of sources.slice(1)) expect(s).toMatch(/^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|google\.com\/recaptcha\/)$/);
  });

  it("no wildcard and no plain http anywhere", () => {
    expect(header).not.toMatch(/\*|http:\/\//);
    expect(header).toContain("object-src 'none'");
    expect(header).toContain("frame-ancestors 'none'");
  });
});
