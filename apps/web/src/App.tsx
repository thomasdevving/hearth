import { useEffect, useState } from "react";
import { SCREENS } from "./screens/index";
import { TimeMachineBar } from "./replay/TimeMachineBar";
import { setNavigator } from "./app/events";
import { ensureLoaded } from "./app/runtime";
import { getSettings } from "./store/db";
import { OnDeviceBanner } from "./inference/Banner";

const TABS: { id: string; label: string }[] = [
  { id: "home", label: "Today" },
  { id: "trends", label: "Trends" },
  { id: "my_plan", label: "Plan" },
  { id: "ledger", label: "Privacy" },
  { id: "settings", label: "Settings" },
];

function parseHash(): { screen: string; params: Record<string, string> } {
  const h = location.hash.replace(/^#\/?/, "");
  const [screen, query] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(query ?? ""));
  return { screen: screen || "home", params };
}

export function App() {
  const [route, setRoute] = useState(parseHash());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setNavigator((screen, params) => {
      const q = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
      location.hash = `#/${screen}${q}`;
    });
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    (async () => {
      await ensureLoaded();
      const s = await getSettings();
      const r = parseHash();
      if (!s.onboarded && !["onboarding", "plan_setup", "baseline_phq", "safety", "report", "eval_g"].includes(r.screen)) location.hash = "#/onboarding";
      setReady(true);
    })();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [route.screen]);
  const Comp = SCREENS[route.screen] ?? SCREENS.home;
  const fullScreen = route.screen === "safety" || route.screen === "report";
  return (
    <div className="app">
      {route.screen !== "report" && (
        <div className="demo-banner" role="note">
          Demo: the sensor data is simulated. Everything else is live.
        </div>
      )}
      {!fullScreen && <OnDeviceBanner />}
      {!fullScreen && (
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} aria-current={route.screen === t.id ? "page" : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
      )}
      <main className="column">{ready ? <Comp params={route.params} /> : <p className="muted">Loading…</p>}</main>
      {route.screen !== "report" && <TimeMachineBar />}
    </div>
  );
}
