import { useEffect, useState } from "react";
import { SCREENS } from "../screens/index";
import { TimeMachineBar } from "../replay/TimeMachineBar";
import { ensureLoaded } from "./runtime";
import { getSettings } from "../store/db";
import { OnDeviceBanner } from "../inference/Banner";
import { Wordmark } from "../ui/Logo";
import { parseHash, type Route } from "./routes";

const TABS = [
  { id: "home", label: "Today" },
  { id: "trends", label: "Trends" },
  { id: "my_plan", label: "Plan" },
  { id: "ledger", label: "Privacy" },
  { id: "settings", label: "Settings" },
];

/** Only mounted after entering the demo; public pages do not load a persona. */
export default function DemoApp({ route }: { route: Route }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureLoaded();
      const settings = await getSettings();
      if (cancelled) return;
      const current = parseHash();
      if (!settings.onboarded && !["onboarding", "plan_setup", "baseline_phq", "safety", "report", "eval_g"].includes(current.screen)) location.hash = "#/onboarding";
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);
  const Comp = SCREENS[route.screen] ?? SCREENS.home;
  const fullScreen = route.screen === "safety" || route.screen === "report";
  // First run: no tabs until the plan is set up, so there is one clear way forward.
  const firstRun = route.screen === "onboarding" || route.screen === "baseline_phq" || (route.screen === "plan_setup" && route.params.first === "1");
  return (
    <div className="app">
      <header className="app-header"><Wordmark /></header>
      {!fullScreen && <OnDeviceBanner />}
      {!fullScreen && !firstRun && (
        <nav className="tabs" aria-label="Main">
          {TABS.map((tab) => <a key={tab.id} href={`#/${tab.id}`} aria-current={route.screen === tab.id ? "page" : undefined}>{tab.label}</a>)}
        </nav>
      )}
      <main className="column">{ready ? <Comp params={route.params} /> : <p className="muted">Loading…</p>}</main>
      {route.screen !== "report" && <TimeMachineBar />}
    </div>
  );
}
