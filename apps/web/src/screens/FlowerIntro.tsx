import { useEffect, useRef, type RefObject } from "react";

const SESSION_KEY = "hearth-flower-intro-v1";
// Background height in the supplied 1920 × 1080 hero reference frame.
const REFERENCE_ART_HEIGHT = 1002.12;

export function shouldPlayFlowerIntro() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try { return sessionStorage.getItem(SESSION_KEY) !== "seen"; } catch { return true; }
}

type Props = {
  source: string;
  poster: string;
  landing: RefObject<HTMLDivElement | null>;
  onComplete: () => void;
};

/** A real, locally served video; its ending is fitted to the existing hero art. */
export function FlowerIntro({ source, poster, landing, onComplete }: Props) {
  const overlay = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const finish = useRef<() => void>(() => {});

  useEffect(() => {
    const video = film.current;
    const root = landing.current;
    if (!video || !root) { onComplete(); return; }
    let finished = false, cancelled = false, frame = 0;
    const previousOverflow = document.body.style.overflow;
    const siblings = [...root.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay.current);
    const previousInert = siblings.map((node) => Boolean(node.inert));
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    document.body.style.overflow = "hidden";
    siblings.forEach((node) => { node.inert = true; });
    overlay.current?.focus({ preventScroll: true });

    const complete = () => {
      if (finished || cancelled) return;
      finished = true;
      window.clearTimeout(loadTimeout);
      window.clearTimeout(safetyTimeout);
      cancelAnimationFrame(frame);
      try { sessionStorage.setItem(SESSION_KEY, "seen"); } catch { /* Storage can be unavailable in private sessions. */ }
      onComplete();
      requestAnimationFrame(() => {
        const heading = root.querySelector("h1");
        if (heading && document.activeElement === document.body) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      });
    };
    finish.current = complete;
    // A slow/failed download must never leave the page behind a white screen.
    const loadTimeout = window.setTimeout(complete, 3000);
    const safetyTimeout = window.setTimeout(complete, 10000);
    const smooth = (value: number) => {
      const t = Math.max(0, Math.min(1, value));
      return t * t * (3 - 2 * t);
    };
    const fit = () => {
      if (finished || cancelled || !surface.current) return;
      const hero = root.querySelector(".hero-wrap");
      if (!hero) { complete(); return; }
      const background = getComputedStyle(hero, "::before");
      const width = overlay.current?.clientWidth ?? innerWidth;
      const height = overlay.current?.clientHeight ?? innerHeight;
      const artHeight = parseFloat(background.height);
      const progress = video.duration > 0 ? video.currentTime / video.duration : 0;
      const travel = smooth((progress - 0.2) / 0.8);
      const handoff = smooth((progress - 0.72) / 0.28);
      const startScale = Math.min(width * 0.68 / 480, height * 0.30 / 480);
      const endScale = artHeight / REFERENCE_ART_HEIGHT;
      const scale = startScale + (endScale - startScale) * travel;
      const startX = width / 2 - 960 * startScale, startY = height / 2 - 540 * startScale;
      const endX = width - 1920 * endScale;
      const x = startX + (endX - startX) * travel, y = startY * (1 - travel);
      video.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      video.style.opacity = String(1 + (parseFloat(background.opacity) - 1) * handoff);
      surface.current.style.maskImage = background.maskImage === "none" ? "none"
        : `linear-gradient(to bottom, #000 ${artHeight * 0.2}px, rgba(0,0,0,${1 - handoff}) ${artHeight}px)`;
      frame = requestAnimationFrame(fit);
    };
    const play = () => {
      window.clearTimeout(loadTimeout);
      video.muted = true;
      video.play()?.catch(complete);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") complete();
      if (event.key === "Tab") { event.preventDefault(); skip.current?.focus(); }
    };
    const motionChanged = () => { if (motion?.matches) complete(); };
    video.addEventListener("loadeddata", play);
    video.addEventListener("ended", complete);
    video.addEventListener("error", complete);
    overlay.current?.addEventListener("keydown", keyDown);
    motion?.addEventListener?.("change", motionChanged);
    frame = requestAnimationFrame(fit);
    if (video.readyState >= 2) play();
    if (video.error) complete();
    motionChanged();
    const container = overlay.current;
    return () => {
      cancelled = true;
      window.clearTimeout(loadTimeout); window.clearTimeout(safetyTimeout);
      cancelAnimationFrame(frame);
      video.pause();
      video.removeEventListener("loadeddata", play);
      video.removeEventListener("ended", complete);
      video.removeEventListener("error", complete);
      container?.removeEventListener("keydown", keyDown);
      motion?.removeEventListener?.("change", motionChanged);
      document.body.style.overflow = previousOverflow;
      siblings.forEach((node, i) => { node.inert = previousInert[i]; });
    };
  }, [landing, onComplete]);

  return (
    <div className="flower-intro" ref={overlay} role="dialog" aria-modal="true" aria-label="Hearth flower opening" tabIndex={-1}>
      <div className="flower-intro-surface" ref={surface}>
        <video ref={film} src={source} poster={poster} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
      </div>
      <button type="button" className="flower-intro-skip" ref={skip} onClick={() => finish.current()}>Skip intro</button>
    </div>
  );
}
