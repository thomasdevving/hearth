import { useEffect, useRef, useState, type ReactNode } from "react";

export type WorkflowStep = {
  n: string;
  title: string;
  body: ReactNode;
  shot: string;
  alt: string;
  label: string;
};

/** iOS status bar icons (cellular, Wi-Fi, battery), drawn to sit beside the Dynamic Island. */
function StatusIcons() {
  return (
    <svg className="phone-status-icons" viewBox="0 0 66 12" aria-hidden="true">
      <g fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="4.5" y="6" width="3" height="6" rx="0.8" />
        <rect x="9" y="3.5" width="3" height="8.5" rx="0.8" />
        <rect x="13.5" y="1" width="3" height="11" rx="0.8" />
        <path d="M29 3.2a9.6 9.6 0 0 1 6.6 2.6l1.2-1.3A11.4 11.4 0 0 0 29 1.4a11.4 11.4 0 0 0-7.8 3.1l1.2 1.3A9.6 9.6 0 0 1 29 3.2Zm0 3.4a6.2 6.2 0 0 1 4.2 1.6l1.2-1.3A8 8 0 0 0 29 4.8a8 8 0 0 0-5.4 2.1l1.2 1.3A6.2 6.2 0 0 1 29 6.6Zm0 3.4a2.8 2.8 0 0 1 1.8.6L29 12.4l-1.8-1.8a2.8 2.8 0 0 1 1.8-.6Z" />
        <rect x="41" y="1.5" width="21" height="9.5" rx="2.6" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="42.6" y="3.1" width="15.6" height="6.3" rx="1.4" />
        <path d="M63.4 4.6v3.3a1.8 1.8 0 0 0 0-3.3Z" fillOpacity="0.45" />
      </g>
    </svg>
  );
}

/**
 * An iPhone 17 Pro-style frame (titanium rim, side buttons, Dynamic Island, status bar,
 * glass) tilted in 3D. Children are the screen's contents.
 */
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone-tilt">
      <div className="phone-body">
        <span className="phone-btn btn-action" aria-hidden="true" />
        <span className="phone-btn btn-vol-up" aria-hidden="true" />
        <span className="phone-btn btn-vol-down" aria-hidden="true" />
        <span className="phone-btn btn-side" aria-hidden="true" />
        <span className="phone-btn btn-camera" aria-hidden="true" />
        <div className="phone-screen">
          <div className="phone-status" aria-hidden="true">
            <span className="phone-time">9:41</span>
            <StatusIcons />
          </div>
          <div className="phone-notch" aria-hidden="true" />
          {children}
          <span className="phone-glare" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** A real screen of the app in an iPhone frame. */
export function Phone({ src, alt, label, className = "" }: { src: string; alt: string; label: string; className?: string }) {
  return (
    <figure className={`phone ${className}`}>
      <div className="phone-art">
        <span className="phone-petal" aria-hidden="true" />
        <PhoneFrame>
          <img src={src} alt={alt} loading="lazy" decoding="async" width={600} height={1298} />
        </PhoneFrame>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const DESKTOP = "(min-width: 861px) and (min-height: 621px)";

/**
 * A pinned, scroll-driven walkthrough: the steps on one side, one phone on the other.
 * Scrolling through the section opens each step in turn and swaps the screen; the line under
 * the open step shows how far you are. Below 861 px it becomes a plain list, each step with
 * its own phone. `art` is an image layer that stays pinned with the section (the plan
 * flower's stem continues into the first walkthrough).
 */
export function Workflow({ eyebrow, title, steps, side = "right", art }: { eyebrow: string; title: string; steps: WorkflowStep[]; side?: "left" | "right"; art?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mq = window.matchMedia?.(DESKTOP);
    let frame = 0;
    const update = () => {
      frame = 0;
      if (mq && !mq.matches) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      if (total <= 0) return;
      const f = Math.min(0.9999, Math.max(0, -r.top / total)) * steps.length;
      const i = Math.floor(f);
      setActive(i);
      bars.current.forEach((b, j) => b?.style.setProperty("--p", String(j < i ? 1 : j === i ? f - i : 0)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mq?.addEventListener?.("change", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq?.removeEventListener?.("change", onScroll);
    };
  }, [steps.length]);

  /** Scrolls to the point in the section where step i opens. */
  const open = (i: number) => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia && !window.matchMedia(DESKTOP).matches) return setActive(i);
    const total = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY + (total * (i + 0.04)) / steps.length;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={`wf wf-phone-${side}`} ref={root} style={{ ["--n" as string]: steps.length }}>
      <div className="wf-stage">
        {art && (
          <div className="wf-art" aria-hidden="true">
            <div className="wf-art-img" style={{ backgroundImage: `url(${art})` }} />
          </div>
        )}
        <div className="wf-pin">
          <div className="wf-text">
            <div className="wf-head">
              <p className="wf-eyebrow">{eyebrow}</p>
              <h3 className="wf-title">{title}</h3>
            </div>
            <ol className="wf-steps">
              {steps.map((s, i) => (
                <li key={s.n} className={i === active ? "is-active" : undefined} aria-current={i === active ? "step" : undefined}>
                  <button type="button" className="wf-step-head" aria-expanded={i === active} onClick={() => open(i)}>
                    <span className="wf-n">{s.n}</span>
                    <span className="wf-step-title">{s.title}</span>
                  </button>
                  <div className="wf-body">
                    <div className="wf-body-inner">
                      {s.body}
                      <Phone className="wf-inline-phone" src={s.shot} alt={s.alt} label={s.label} />
                    </div>
                  </div>
                  <span className="wf-bar" aria-hidden="true">
                    <span ref={(b) => { bars.current[i] = b; }} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="wf-device" aria-live="polite">
            <figure className="phone">
              <div className="phone-art">
                <span className="phone-petal" aria-hidden="true" />
                <PhoneFrame>
                  {steps.map((s, i) => (
                    <img
                      key={s.n}
                      className={i === active ? "is-active" : undefined}
                      src={s.shot}
                      alt={i === active ? s.alt : ""}
                      aria-hidden={i !== active}
                      decoding="async"
                      width={600}
                      height={1298}
                    />
                  ))}
                </PhoneFrame>
              </div>
              <figcaption>
                <span className="wf-count">{String(active + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span> {steps[active].label}
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
}
