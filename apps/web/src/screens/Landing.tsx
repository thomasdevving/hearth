import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { LogoMark, Wordmark } from "../ui/Logo";
import { HeroPreview } from "./HeroPreview";
import flowerWebp from "../assets/hero-flower.webp";
import flowerPng from "../assets/hero-flower.png";
import flowerLeft from "../assets/flower-left.webp";
import flowerRight from "../assets/flower-right.webp";
import flowerGarden from "../assets/flower-garden.webp";
import logoBackdrop from "../assets/hearth-logo-backdrop.svg";
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
        <img className="phone-logo" src={logoBackdrop} alt="" aria-hidden="true" width={256} height={256} />
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
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div className="landing" ref={root}>

      <div className="hero-wrap" style={{ ["--flower" as string]: `image-set(url(${flowerWebp}) type("image/webp"), url(${flowerPng}) type("image/png"))` }}>
      <nav className="land-nav" aria-label="Site">
        <Wordmark href="#/" />
        <span className="spacer" />
        <a className="navlink" href="#/" onClick={scrollTo("how")}>
          How it works
        </a>
        <a className="navlink" href="#/" onClick={scrollTo("privacy")}>
          Privacy
        </a>
        <a className="land-cta" href="#/home">
          Try the demo
        </a>
      </nav>
      <header className="hero">
        <div>
          <p className="eyebrow">Your own early-warning plan</p>
          <h1>
            Notice the change <em>before</em> it becomes a slide.
          </h1>
          <p className="lead">
            Hearth learns what your usual days look like. When they start to drift, it checks in, asks a short validated question, and shows you the plan you wrote in your own words.
            Your words never leave your device.
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
        <div className="flow-head flow-text-right" style={{ ["--bg" as string]: `url(${flowerLeft})` }}>
          <div className="flow-head-inner reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Your plan becomes the thing that watches over you.</h2>
            <p className="intro">Many people who have been through a hard period already know their own first signs. Hearth turns that knowledge into something that notices on its own.</p>
          </div>
        </div>

        <div className="features">
          <Feature
            n="01"
            title="Write your plan, in your own words"
            side="left"
            shots={<Phone src={shotPlan} alt="Plan setup: the user's words turned into cards with quotes and Keep or Not right buttons" label="Plan setup · cards from your words" />}
          >
            <p>“I go to bed later, I skip the gym, calling my sister helps.” The model on your device turns this into signs to watch, questions for your check-ins and the things that help, each with the words it came from.</p>
            <p className="feature-note">Anything you didn't actually write is removed in code. You keep or reject every card.</p>
          </Feature>

          <Feature
            n="02"
            title="It learns your usual days"
            side="right"
            shots={
              <div className="phone-pair">
                <Phone src={shotHome} alt="Today screen with the state, a check-in card and the user's own signals as small charts" label="Today" />
                <Phone src={shotTrends} alt="Trends: the change index with the usual range, holiday shaded" label="Trends" className="phone-back" />
              </div>
            }
          >
            <p>Steps, rest times, walking pace and the places you go are compared only with your own usual days, never with anyone else. The signs you named count double.</p>
            <p className="feature-note">The first two weeks it simply learns: “Learning your pattern”.</p>
          </Feature>

          <Feature
            n="03"
            title="A change gets a gentle check-in"
            side="left"
            shots={<Phone src={shotCheckin} alt="Check-in with a short opening line, three 1 to 7 scales and the user's own questions" label="Check-in · about 20 seconds" />}
          >
            <p>When several signals drift for a few days, Hearth asks how you are: three quick taps and your own questions. The opening line names what changed, in plain words.</p>
            <p className="feature-note">“Not today” and “Why am I being asked?” are always there.</p>
          </Feature>

          <Feature
            n="04"
            title="A holiday is not an alarm"
            side="right"
            shots={<Phone src={shotHoliday} alt="Question: Are you on holiday until Sunday 23 August, with the dates and Yes or No" label="One tap to set days aside" />}
          >
            <p>Write “I'm in Spain this week, back on Sunday” and Hearth asks once: on holiday until Sunday? Say yes, and those days are set aside instead of counting as a change.</p>
            <p className="feature-note">Stressful weeks are noted but never set aside: that is exactly when your signals matter.</p>
          </Feature>

          <Feature
            n="05"
            title="Your own plan, shown back"
            side="left"
            shots={<Phone src={shotMyPlan} alt="Your plan: what changed, and the actions the user wrote, in their own words" label="Your plan" />}
          >
            <p>If the change continues, a short validated questionnaire follows, exactly as published. Then your plan appears: what you said helps, in your words, with the ones that fit today on top.</p>
          </Feature>
        </div>
      </section>

      <section id="privacy" className="band" aria-labelledby="privacy-title">
        <div className="flow-head flow-text-left" style={{ ["--bg" as string]: `url(${flowerRight})` }}>
          <div className="flow-head-inner reveal">
            <p className="eyebrow">Hybrid by design</p>
            <h2 id="privacy-title">The model that reads your words lives on your device.</h2>
            <p className="intro">One rule set decides where each task runs: how personal the data is, and whether you said yes to the cloud.</p>
          </div>
        </div>
        <div className="land-section" style={{ paddingTop: 0 }}>
          <ol className="routes">
            <li className="route reveal" style={{ ["--d" as string]: "0ms" }}>
              <span className="route-number" aria-hidden="true">01</span>
              <div className="route-heading">
                <span className="where device">On this device only</span>
                <h3>Your words</h3>
              </div>
              <p>Your plan, notes, check-in text, speech and questions. Read by Gemini Nano in Chrome. Without it, a simple fallback is used; never the cloud.</p>
            </li>
            <li className="route reveal" style={{ ["--d" as string]: "120ms" }}>
              <span className="route-number" aria-hidden="true">02</span>
              <div className="route-heading">
                <span className="where consent">Device first</span>
                <h3>Single numbers</h3>
              </div>
              <p>A questionnaire total or the reason for a check-in. On-device when possible; the cloud only if you allowed it.</p>
            </li>
            <li className="route reveal" style={{ ["--d" as string]: "240ms" }}>
              <span className="route-number" aria-hidden="true">03</span>
              <div className="route-heading">
                <span className="where cloud">Cloud, with your consent</span>
                <h3>Weekly summaries</h3>
              </div>
              <p>Coarse weekly numbers you have previewed. Gemini in the cloud writes a longer reflection; offline, a short one is written on the device.</p>
            </li>
          </ol>
          <div className="features">
            <Feature
              n="06"
              title="See everything that left your device"
              side="right"
              shots={<Phone src={shotLedger} alt="Privacy ledger listing every model call, where it ran and what was sent" label="Privacy ledger" />}
            >
              <p>Every time a model is asked something, the privacy ledger records the task, where it ran and, for the cloud, the exact text that was sent. A filter shows only what left the device.</p>
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
                    <CountUp to={101} />
                  </div>
                  <p>holiday alarm days with the holiday confirmed, and without.</p>
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
            <p>Hearth is a companion for noticing: not a doctor and not a crisis line. It will sometimes ask when nothing is wrong, and some check-ins are random on purpose, so you can see whether its questions are useful for you.</p>
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

      <footer className="land-footer">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--magenta)" }}>
          <LogoMark size={20} /> Hearth
        </span>
        <span>A wellbeing and self-insight tool. Not a medical device; it gives no diagnosis or treatment advice.</span>
        <span>Built with Firebase AI Logic hybrid inference · #BuildHybridAI 2026</span>
      </footer>
    </div>
  );
}
