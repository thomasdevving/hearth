import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";

const { demoMounted } = vi.hoisted(() => ({ demoMounted: vi.fn() }));
vi.mock("../src/app/DemoApp", () => ({
  default: ({ route }: { route: { screen: string } }) => {
    demoMounted(route.screen);
    return <p>Demo screen: {route.screen}</p>;
  },
}));

beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); demoMounted.mockClear(); vi.restoreAllMocks(); history.replaceState(null, "", "/"); });

describe("public website routes", () => {
  it("opens Science directly without mounting the demo", () => {
    history.replaceState(null, "", "#/science");
    render(<App />);
    expect(screen.getByRole("heading", { name: "The science behind Hearth" })).toBeTruthy();
    expect(demoMounted).not.toHaveBeenCalled();
    expect(screen.queryByText(/Demo screen:/)).toBeNull();
  });

  it("loads the demo only after entering a demo route", async () => {
    history.replaceState(null, "", "#/home");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Demo screen: home")).toBeTruthy());
    expect(demoMounted).toHaveBeenCalledWith("home");
  });
});
