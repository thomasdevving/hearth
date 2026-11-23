import { useEffect, useRef, useState, type MouseEvent } from "react";
import { SiteNav, SiteFooter } from "../ui/SiteLayout";
import { HeroDrift } from "./HeroDrift";
import { Workflow, type WorkflowStep } from "./Workflow";
import flowerWebp from "../assets/hero-flower.webp";
import flowerPng from "../assets/hero-flower.png";
import flowerPlan from "../assets/flower-plan-long.webp";
import flowerPrivacy from "../assets/flower-privacy.png";
import flowerGarden from "../assets/flower-garden.webp";
import shotPlan from "../assets/shots/plan.webp";
import shotHome from "../assets/shots/home.webp";
import shotCheckin from "../assets/shots/checkin.webp";
import shotHoliday from "../assets/shots/holiday.webp";
import shotMyPlan from "../assets/shots/myplan.webp";
import shotLedger from "../assets/shots/ledger.webp";
import shotSafety from "../assets/shots/safety.webp";
import shotWhy from "../assets/shots/why.webp";
import shotHelped from "../assets/shots/helped.webp";
import shotPeople from "../assets/shots/people.webp";
import shotGp from "../assets/shots/gp.webp";

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

const howSteps: WorkflowStep[] = [
  {
    n: "01",
    title: "Turn the signs you know into your own plan",
    shot: shotPlan,
    alt: "Plan setup: the user's words turned into cards, each with its quote and a tick to keep it",
    label: "Plan setup: cards made from your words",
    body: (
      <>
        <p>Write what you, or people close to you, notice first: “I go to bed later, I skip the gym, calling my sister helps.” The model on your device turns it into cards. You can also tick research-based signs, or skip this step.</p>
        <p className="feature-note">Every card shows where it came from. Anything you didn't write is removed in code.</p>
      </>
    ),
  },
  {
    n: "02",
    title: "Hearth learns what your usual days look like",
    shot: shotHome,
    alt: "Today screen with the state, a check-in card, the user's people and their own signals",
    label: "Today",
    body: (
      <>
        <p>Steps, sleep, daily rhythm, walking pace, heart rate and the places you go are compared only with your own usual days, never with anyone else. The signs you named weigh more.</p>
        <p className="feature-note">The first two weeks it simply learns: “Learning your pattern”.</p>
      </>
    ),
  },
  {
    n: "03",
    title: "When your days change, Hearth checks in gently",
    shot: shotCheckin,
    alt: "Check-in with a short opening line, three 1 to 7 scales and the user's own questions",
    label: "A check-in takes about 20 seconds",
    body: (
      <>
        <p>When your days stay outside your usual range for a few days, Hearth opens your plan and asks how you are: three taps and your own questions. The opening line says what changed.</p>
        <p className="feature-note">Some check-ins are random on purpose. “Not today” is always there.</p>
      </>
    ),
  },
  {
    n: "04",
    title: "“Why?” shows you exactly what changed",
    shot: shotWhy,
    alt: "Why screen: one signal drawn against the shaded band of the user's usual range, with the day Hearth noticed",
    label: "Your signal against your usual range",
    body: (
      <>
        <p>Each change comes with its reason. Your signal is drawn against the band of your own usual days, next to the words you wrote. One day that stands out does not count; Hearth asks only when the trend crosses the line.</p>
        <p className="feature-note">Your plan also shows which signs moved first in a hard stretch, worked out by code, not a model.</p>
      </>
    ),
  },
  {
    n: "05",
    title: "A holiday doesn't count as a change",
    shot: shotHoliday,
    alt: "Question: Are you on holiday until Sunday 23 August, with the dates and Yes or No",
    label: "One tap sets the holiday aside",
    body: (
      <>
        <p>Write “I'm in Spain this week, back on Sunday” and Hearth asks once: on holiday until Sunday? Say yes, and your location signals for those days are set aside, so a different city doesn't count as a change.</p>
        <p className="feature-note">Stressful weeks are noted but never set aside: that is exactly when your signals matter.</p>
      </>
    ),
  },
];

const supportSteps: WorkflowStep[] = [
  {
    n: "06",
    title: "Your plan opens first, then a short questionnaire",
    shot: shotMyPlan,
    alt: "Your plan: what changed, one action for today with a smaller version, and the user's people",
    label: "Your plan",
    body: (
      <>
        <p>As soon as a change starts, your plan opens, with what fits today on top. Too much today? Write your own smaller step once, and Hearth offers it on a hard day. If the change continues, a short validated questionnaire follows, worded exactly as published.</p>
      </>
    ),
  },
  {
    n: "07",
    title: "Hearth reminds you what helped last time",
    shot: shotHelped,
    alt: "After a check-in: the user's saved note about what helped last time, and a drafted text to a friend",
    label: "What helped you last time",
    body: (
      <>
        <p>After a hard stretch, save a sentence or a voice note about what helped. When the same sign shows up in a check-in, the model on your device recognises it by meaning, brings your note back and can draft the text for you.</p>
        <p className="feature-note">Hearth never sends anything. You choose if and when.</p>
      </>
    ),
  },
  {
    n: "08",
    title: "Add the people you would want to call",
    shot: shotPeople,
    alt: "My people: one to three trusted people, each with a phone number and a message of the user's own",
    label: "My people",
    body: (
      <>
        <p>Add one to three people you could call or message, each with a message of your own. They appear on Today when your days change, on your plan and on the support screen.</p>
        <p className="feature-note">They stay on this device. Hearth never contacts anyone.</p>
      </>
    ),
  },
  {
    n: "09",
    title: "Take your plan to your GP",
    shot: shotGp,
    alt: "A one-page relapse prevention plan for the GP: current status and the plan by phase",
    label: "Your plan on one page for your GP",
    body: (
      <>
        <p>Your plan on one printable page, by phase: stable, early signs, crisis. Or as a FHIR file their system can read. Both are made on this device, and you decide whether to hand them over.</p>
      </>
    ),
  },
];

const privacySteps: WorkflowStep[] = [
  {
    n: "10",
    title: "See everything that left your device",
    shot: shotLedger,
    alt: "Privacy ledger with a 'Don't take our word for it' test and every model call, where it ran and what was sent",
    label: "Privacy ledger",
    body: (
      <>
        <p>The privacy ledger records every model call: the task, where it ran and, for the cloud, the exact text sent.</p>
        <p className="feature-note">Don't take our word for it: your browser only lets Hearth reach the listed Firebase services. “Test it” tries another website, and you watch it fail.</p>
      </>
    ),
  },
  {
    n: "11",
    title: "Help is always one tap away, even offline",
    shot: shotSafety,
    alt: "Support screen with the 988 Suicide and Crisis Lifeline call and text buttons, 911 for immediate danger, and the user's people",
    label: "Support screen",
    body: (
      <>
        <p>Hearth is a companion for noticing, not a doctor or a crisis line. The support screen works offline and is always one tap away.</p>
        <div className="land-help">
          <p>
            <strong>Need help right now?</strong> In the US, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline). If you are in immediate danger, call <a href="tel:911">911</a>.
          </p>
        </div>
      </>
    ),
  },
];

/** Tells CSS how tall the plan intro is, so the first walkthrough can continue its flower exactly. */
function usePlanIntroHeight(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    const intro = el?.querySelector<HTMLElement>(".plan-intro");
    if (!el || !intro || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => el.style.setProperty("--plan-intro-h", `${intro.offsetHeight}px`));
    ro.observe(intro);
    return () => ro.disconnect();
  }, [root]);
}

/** The front door (#/). No data, no model calls, no network. */
export function Landing({ section }: { section?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  usePlanIntroHeight(root);
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
            When your days drift, <em>Hearth notices</em>.
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
          <HeroDrift />
        </div>
      </header>
      </div>

      <section id="how" aria-labelledby="how-title">
        <div className="flow-head flow-text-right plan-intro" style={{ ["--bg" as string]: `url(${flowerPlan})` }}>
          <div className="flow-head-inner reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Research-based signals, sharpened by the signs you know.</h2>
            <p className="intro">Signals research links to harder periods: sleep, activity, daily rhythm, heart rate and the places you go. The signs you know from experience make it sharper.</p>
            <div className="flow-actions">
              <a className="flow-link" href="#/science">
                See the research behind each signal<span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>

        <Workflow eyebrow="Step by step" title="From the signs you know to a check-in at the right moment" steps={howSteps} art={flowerPlan} />
        <Workflow eyebrow="When your days change" title="What Hearth does when a harder stretch starts" steps={supportSteps} side="left" />
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
        <Workflow eyebrow="Privacy you can check" title="See what left your device, and get help even without internet" steps={privacySteps} />
        <div className="land-section facts-section">
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
