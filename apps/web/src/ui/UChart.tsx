import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/** A thin React wrapper around uPlot. Canvas only exists in a real browser. */
export function UChart({ opts, data, ariaLabel }: { opts: Omit<uPlot.Options, "width">; data: uPlot.AlignedData; ariaLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof HTMLCanvasElement === "undefined" || !(HTMLCanvasElement.prototype.getContext as unknown)) return;
    try {
      plot.current = new uPlot({ ...opts, width: el.clientWidth || 340 } as uPlot.Options, data, el);
    } catch {
      return; // no canvas (tests)
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height: opts.height })) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [opts, data]);
  return <div ref={box} className="chart" role="img" aria-label={ariaLabel} />;
}
