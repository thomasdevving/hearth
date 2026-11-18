import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { SiteNav, SiteFooter } from "../ui/SiteLayout";
import { HeroPreview } from "./HeroPreview";
import flowerWebp from "../assets/hero-flower.webp";
import flowerPng from "../assets/hero-flower.png";
import flowerPlan from "../assets/flower-plan-long.webp";
import flowerPrivacy from "../assets/flower-privacy.png";
import flowerGarden from "../assets/flower-garden.webp";
import shotPlan from "../assets/shots/plan.webp";
import shotHome from "../assets/shots/home.webp";
import shotTrends from "../assets/shots/trends.webp";
import shotCheckin from "../assets/shots/checkin.webp";
import shotHoliday from "../assets/shots/holiday.webp";
import shotMyPlan from "../assets/shots/myplan.webp";
import shotLedger from "../assets/shots/ledger.webp";
import shotSafety from "../assets/shots/safety.webp";

/** In-page links scroll instead of changing the hash, which is the app's router. */
const scrollTo = (id: string) => (e: MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/** Adds `in` to every `.reveal` element when it scrolls into view (once). */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>(".reveal")];
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      items.forEach((i) => i.classList.add("in"));
      return;
    }
    el.classList.add("js-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/** Counts up to `to` once visible. */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || to === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") return setN(to);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

/** A real screen of the app in a phone-shaped frame. */
function Phone({ src, alt, label, className = "" }: { src: string; alt: string; label: string; className?: string }) {
  return (
    <figure className={`phone ${className}`}>
      <div className="phone-art">
        <span className="phone-petal" aria-hidden="true" />
        <div className="phone-body">
          <div className="phone-screen">
            <div className="phone-notch" aria-hidden="true" />
            <img src={src} alt={alt} loading="lazy" decoding="async" width={600} height={1298} />
          </div>
        </div>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Feature({ n, title, children, side, shots }: { n: string; title: string; children: ReactNode; side: "left" | "right"; shots: ReactNode }) {
  return (
    <article className={`feature feature-${side}`}>
      <div className="feature-copy reveal">
        <span className="feature-n">{n}</span>
        <h3>{title}</h3>
        {children}
      </div>
      <div className={`feature-shots reveal from-${side === "left" ? "right" : "left"}`}>{shots}</div>
    </article>
  );
}

/** The front door (#/). No data, no model calls, no network. */
export function Landing({ section }: { section?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useEffect(() => {
    if (section !== "how" && section !== "privacy") return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) document.getElementById(section)?.scrollIntoView({ block: "start" });
    });
    return () => { cancelled = true; };
  }, [section]);
  return (
    <div className="landing" ref={root}>

      <div className="hero-wrap" style={{ ["--flower" as string]: `image-set(url(${flowerWebp}) type("image/webp"), url(${flowerPng}) type("image/png"))` }}>
      <SiteNav />
      <header className="hero">
        <div>
          <p className="eyebrow">Your own early-warning plan</p>
          <h1>
            When your days drift, <em>Hearth notices</em> and reminds you what helps.
          </h1>
          <p className="lead">
            Hearth learns your usual days. When they change, it checks in and shows the plan you wrote, in your own words. What you write stays on your device.
          </p>
          <div className="ctas">
            <a className="land-cta" href="#/home">
              Try the demo
            </a>
            <a className="land-cta ghost" href="#/" onClick={scrollTo("how")}>
              How it works
            </a>
          </div>
        </div>
        <div className="hero-side">
          <HeroPreview />
        </div>
      </header>
      </div>

      <section id="how" aria-labelledby="how-title">
        <div className="flow-head flow-text-right plan-intro" style={{ ["--bg" as string]: `url(${flowerPlan})` }}>
          <div className="flow-head-inner reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Research-based signals, sharpened by the signs you know.</h2>
            <p className="intro">Signals research links to harder periods: sleep, activity, daily rhythm, heart rate and the places you go. The signs you know from experience make it sharper.</p>
          </div>
        </div>

        <div className="features">
          <Feature
            n="01"
            title="Your plan: your own signs, plus the science"
            side="left"
            shots={<Phone src={shotPlan} alt="Plan setup: the user's words turned into cards, each with its quote and a tick to keep it" label="Plan setup · cards from your words" />}
          >
            <p>Write what you, or people close to you, notice first: “I go to bed later, I skip the gym, calling my sister helps.” The model on your device turns it into cards. You can also tick research-based signs, or skip this step.</p>
            <p className="feature-note">Every card shows where it came from. Anything you didn't write is removed in code.</p>
          </Feature>

          <Feature
            n="02"
            title="It learns your usual days"
            side="right"
            shots={
              <div className="phone-gallery">
                <div className="phone-pair" role="region" aria-label="Today and Trends app previews" tabIndex={0}>
                  <Phone src={shotHome} alt="Today screen with the state, a check-in card and the user's own signals as small charts" label="Today" />
                  <Phone src={shotTrends} alt="Trends: the change index with the usual range, holiday shaded" label="Trends" className="phone-back" />
                </div>
                <p className="phone-pair-hint">Swipe to see Today and Trends <span aria-hidden="true">↔</span></p>
              </div>
            }
          >
            <p>Steps, sleep, daily rhythm, walking pace, heart rate and the places you go are compared only with your own usual days, never with anyone else. The signs you named weigh more.</p>
            <p className="feature-note">The first two weeks it simply learns: “Learning your pattern”.</p>
          </Feature>

          <Feature
            n="03"
            title="A change gets a gentle check-in"
            side="left"
            shots={<Phone src={shotCheckin} alt="Check-in with a short opening line, three 1 to 7 scales and the user's own questions" label="Check-in · about 20 seconds" />}
          >
            <p>When your days stay outside your usual range for a few days, Hearth opens your plan and asks how you are: three taps and your own questions. The opening line says what changed.</p>
            <p className="feature-note">Some check-ins are random on purpose. “Not today” is always there.</p>
          </Feature>

          <Feature
            n="04"
            title="A holiday is not an alarm"
            side="right"
            shots={<Phone src={shotHoliday} alt="Question: Are you on holiday until Sunday 23 August, with the dates and Yes or No" label="One tap to set days aside" />}
          >
            <p>Write “I'm in Spain this week, back on Sunday” and Hearth asks once: on holiday until Sunday? Say yes, and your location signals for those days are set aside, so a different city doesn't count as a change.</p>
            <p className="feature-note">Stressful weeks are noted but never set aside: that is exactly when your signals matter.</p>
          </Feature>

          <Feature
            n="05"
            title="Your own plan, then a validated question"
            side="left"
            shots={<Phone src={shotMyPlan} alt="Your plan: what changed, and the actions the user wrote, in their own words" label="Your plan" />}
          >
            <p>As soon as a change starts, your plan opens, with what fits today on top. If the change continues, a short validated questionnaire follows, worded exactly as published.</p>
          </Feature>
        </div>
      </section>

      <section id="privacy" aria-labelledby="privacy-title">
        <div className="flow-head flow-text-left privacy-intro" style={{ ["--bg" as string]: `url(${flowerPrivacy})` }}>
          <div className="flow-head-inner">
            <div className="privacy-copy">
              <div className="reveal">
                <p className="eyebrow">Hybrid by design</p>
                <h2 id="privacy-title">The model that reads your words lives on your device.</h2>
                <p className="intro">Personal words stay here. You choose what reaches the cloud.</p>
              </div>
              <ul className="routes">
                <li className="route reveal" style={{ ["--d" as string]: "0ms" }}>
                  <h3>Your words stay on this device</h3>
                  <p>Gemini Nano in Chrome reads your plan, notes and check-ins. Without it, simple rules take over. Never the cloud.</p>
                </li>
                <li className="route reveal" style={{ ["--d" as string]: "120ms" }}>
                  <h3>Everything else: device first</h3>
                  <p>Check-in lines and explanations run on your device too. The cloud only with your consent.</p>
                </li>
                <li className="route reveal" style={{ ["--d" as string]: "240ms" }}>
                  <h3>Weekly numbers, if you choose</h3>
                  <p>You see them first. Gemini writes a longer reflection; offline, your device writes a short one.</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="land-section" style={{ paddingTop: 0 }}>
          <div className="features">
            <Feature
              n="06"
              title="See everything that left your device"
              side="right"
              shots={<Phone src={shotLedger} alt="Privacy ledger listing every model call, where it ran and what was sent" label="Privacy ledger" />}
            >
              <p>The privacy ledger records every model call: the task, where it ran and, for the cloud, the exact text sent.</p>
              <div className="facts">
                <div className="fact reveal">
                  <div className="n">
                    <CountUp to={0} />
                  </div>
                  <p>requests left the browser with the cloud off, in a full 150-day demo run.</p>
                </div>
                <div className="fact reveal" style={{ ["--d" as string]: "120ms" }}>
                  <div className="n">
                    <CountUp to={7} suffix=" days" />
                  </div>
                  <p>median time to notice the demo person's gradual change, on 50 simulated people.</p>
                </div>
                <div className="fact reveal" style={{ ["--d" as string]: "240ms" }}>
                  <div className="n">
                    0<span className="vs"> vs </span>
                    <CountUp to={92} />
                  </div>
                  <p>holiday alarm days with the holiday confirmed, and without, across 20 simulated people.</p>
                </div>
              </div>
            </Feature>
          </div>
        </div>
      </section>

      <section className="land-section" aria-labelledby="not-title">
        <div className="features">
          <Feature
            n="07"
            title="Help is one tap away, even offline"
            side="left"
            shots={<Phone src={shotSafety} alt="Support screen with the 988 Suicide and Crisis Lifeline call button and 911 for immediate danger" label="Support screen" />}
          >
            <p>Hearth is a companion for noticing, not a doctor or a crisis line. The support screen works offline and is always one tap away.</p>
            <div className="land-help">
              <p>
                <strong>Need help right now?</strong> In the US, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline). If you are in immediate danger, call <a href="tel:911">911</a>.
              </p>
            </div>
          </Feature>
        </div>
      </section>

      <section className="land-final" aria-labelledby="final-title" style={{ ["--bg" as string]: `url(${flowerGarden})` }}>
        <div className="land-final-inner reveal">
          <h2 id="final-title">Follow Sam through 150 days in a few minutes.</h2>
          <p className="intro">The demo runs the real app on a made-up person. The sensor data is simulated; the models, check-ins, questionnaires and the privacy ledger are live.</p>
          <div className="ctas">
            <a className="land-cta" href="#/home">
              Start the demo
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
