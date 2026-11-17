import type { MouseEvent } from "react";
import { LogoMark, Wordmark } from "../ui/Logo";
import flowerWebp from "../assets/hero-flower.webp";
import flowerJpg from "../assets/hero-flower.jpg";

/** In-page links scroll instead of changing the hash, which is the app's router. */
const scrollTo = (id: string) => (e: MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/** The front door (#/). No data, no model calls, no network. */
export function Landing() {
  return (
    <div className="landing">

      <div className="hero-wrap" style={{ ["--flower" as string]: `image-set(url(${flowerWebp}) type("image/webp"), url(${flowerJpg}) type("image/jpeg"))` }}>
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
        <div className="hero-side" aria-hidden="true">
          <div className="hero-card">
            <div className="k">Today · a change from your usual pattern</div>
            <div className="v">Later evenings, fewer gym visits</div>
            <div className="k">You said this helps</div>
            <div>Call my sister · A walk in the morning</div>
          </div>
        </div>
      </header>
      </div>

      <section className="land-section" id="how" aria-labelledby="how-title">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">Your plan becomes the thing that watches over you.</h2>
        <p className="intro">Many people who have been through a hard period already know their own first signs. Hearth turns that knowledge into something that notices on its own.</p>
        <div className="steps">
          <div className="step">
            <h3>Write your plan</h3>
            <p>“I go to bed later, I skip the gym, calling my sister helps.” The on-device model turns your words into signs to watch and things that help. You confirm each card.</p>
          </div>
          <div className="step">
            <h3>It learns your usual</h3>
            <p>Steps, rest times, walking pace and the places you go are compared only with your own usual days, never with anyone else.</p>
          </div>
          <div className="step">
            <h3>A change gets a check-in</h3>
            <p>When several signals drift for a few days, Hearth asks how you are. A holiday or visitors? One tap and those days are set aside.</p>
          </div>
          <div className="step">
            <h3>Your own plan, shown back</h3>
            <p>If the change continues, a short validated questionnaire follows, and your plan appears: what you said helps, in your words.</p>
          </div>
        </div>
      </section>

      <section className="band" id="privacy" aria-labelledby="privacy-title">
        <div className="land-section">
          <p className="eyebrow">Hybrid by design</p>
          <h2 id="privacy-title">The model that reads your words lives on your device.</h2>
          <p className="intro">
            Every task is routed by one rule set: how personal the data is, and whether you said yes to the cloud. The privacy ledger shows every call, where it ran, and exactly what left the device.
          </p>
          <div className="routes">
            <div className="route">
              <span className="where device">On this device only</span>
              <h3>Your words</h3>
              <p>Your plan, notes, check-in text, speech and questions. Read by Gemini Nano in Chrome. Without it, a simple fallback is used; never the cloud.</p>
            </div>
            <div className="route">
              <span className="where consent">Device first</span>
              <h3>Single numbers</h3>
              <p>A questionnaire total or the reason for a check-in. On-device when possible; the cloud only if you allowed it.</p>
            </div>
            <div className="route">
              <span className="where cloud">Cloud, with your consent</span>
              <h3>Weekly summaries</h3>
              <p>Coarse weekly numbers you have previewed. Gemini in the cloud writes a longer reflection; offline, a short one is written on the device.</p>
            </div>
          </div>
          <div className="facts">
            <div className="fact">
              <div className="n">0</div>
              <p>requests leave the browser while the cloud is off, in a full 150-day demo run.</p>
            </div>
            <div className="fact">
              <div className="n">7 days</div>
              <p>median time to notice the demo person's gradual change, on 50 simulated people.</p>
            </div>
            <div className="fact">
              <div className="n">0</div>
              <p>holiday alarms once the holiday is confirmed, against 101 alarm days without.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="land-section" aria-labelledby="not-title">
        <p className="eyebrow">Honest about what it is</p>
        <h2 id="not-title">A companion for noticing. Not a doctor, not a crisis line.</h2>
        <div className="notlist">
          <div className="step plain">
            <h3>It will sometimes ask when nothing is wrong</h3>
            <p>That's fine, and some check-ins are random on purpose, so you can see later whether its questions are useful for you.</p>
          </div>
          <div className="land-help">
            <h3>
              <strong>Need help right now?</strong>
            </h3>
            <p>
              In the US, call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline). If you are in immediate danger, call <a href="tel:911">911</a>. Inside the app, “I need help now” is always one tap away, also offline.
            </p>
          </div>
        </div>
      </section>

      <section className="land-section land-final" aria-labelledby="final-title">
        <h2 id="final-title">Follow Sam through 150 days in a few minutes.</h2>
        <p className="intro" style={{ marginLeft: "auto", marginRight: "auto" }}>
          The demo runs the real app on a made-up person. The sensor data is simulated; the models, check-ins, questionnaires and the privacy ledger are live.
        </p>
        <div className="ctas">
          <a className="land-cta" href="#/home">
            Start the demo
          </a>
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
