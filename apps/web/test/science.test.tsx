import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defaultConfig } from "@hearth/engine";
import { Science } from "../src/screens/Science";

afterEach(cleanup);

describe("science screen", () => {
  it("shows the formulas with the live config values", () => {
    const { container } = render(<Science />);
    expect(screen.getByRole("heading", { name: "The science behind Hearth" })).toBeTruthy();
    const formulas = [...container.querySelectorAll(".sci-formula")].map((e) => e.textContent).join("\n");
    expect(formulas).toContain(`λ = ${defaultConfig.ewmaLambda}`);
    expect(formulas).toContain(`L = ${defaultConfig.ewmaL}`);
    expect(formulas).toContain(`C_d > ${defaultConfig.cusumH}`);
  });

  it("every citation points at a listed source", () => {
    const { container } = render(<Science />);
    const n = container.querySelectorAll(".sci-refs li").length;
    const cited = [...container.querySelectorAll(".sci-cite a")].map((a) => Number(a.textContent));
    expect(cited.length).toBeGreaterThan(10);
    for (const c of cited) expect(c >= 1 && c <= n).toBe(true);
  });

  it("never tells the user they have a condition (R9)", () => {
    const { container } = render(<Science />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/you (are|may be|might be) depressed|you have depression|relapse detected/i);
  });
});
