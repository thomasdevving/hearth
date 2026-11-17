import { useCallback, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowerIntro, shouldPlayFlowerIntro } from "../src/screens/FlowerIntro";

let motion: EventTarget & { matches: boolean };
function Page() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(shouldPlayFlowerIntro);
  const complete = useCallback(() => setActive(false), []);
  return <div ref={root}>
    {active && <FlowerIntro source="/flower.mp4" poster="/bud.webp" landing={root} onComplete={complete} />}
    <header><h1>Hearth</h1><a href="#/home">Open app</a></header>
  </div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  motion = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => motion);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.style.overflow = ""; });

describe("flower opening introduction", () => {
  it("keeps page controls inert until the real video ends, then restores scrolling and skips later visits", () => {
    const first = render(<Page />);
    expect(first.container.querySelector("header")!.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const video = first.container.querySelector("video")!;
    fireEvent.loadedData(video);
    expect(video.play).toHaveBeenCalled();
    fireEvent.ended(video);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(first.container.querySelector("header")!.inert).toBe(false);
    expect(document.body.style.overflow).toBe("");
    first.unmount();
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("honours reduced motion before requesting a video and while it plays", () => {
    motion.matches = true;
    const first = render(<Page />);
    expect(first.container.querySelector("video")).toBeNull();
    first.unmount();
    motion.matches = false;
    render(<Page />);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => { motion.matches = true; motion.dispatchEvent(new Event("change")); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["button", "escape", "error", "timeout", "autoplay"])("reveals the page on %s instead of trapping visitors", async (reason) => {
    const { container } = render(<Page />);
    if (reason === "button") fireEvent.click(screen.getByRole("button", { name: "Skip intro" }));
    if (reason === "escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    if (reason === "error") fireEvent.error(container.querySelector("video")!);
    if (reason === "timeout") act(() => { vi.advanceTimersByTime(3000); });
    if (reason === "autoplay") {
      vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("Playback blocked"));
      await act(async () => { fireEvent.loadedData(container.querySelector("video")!); });
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("header")!.inert).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});
