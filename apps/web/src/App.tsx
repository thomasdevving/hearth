import { lazy, Suspense, useEffect, useState } from "react";
import { setNavigator } from "./app/events";
import { parseHash } from "./app/routes";
import { Landing } from "./screens/Landing";
import { Science } from "./screens/Science";

const DemoApp = lazy(() => import("./app/DemoApp"));

export function App() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    setNavigator((screen, params) => {
      const query = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
      location.hash = `#/${screen}${query}`;
    });
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { window.scrollTo?.(0, 0); }, [route.screen]);
  if (route.screen === "landing") return <Landing section={route.params.section} />;
  if (route.screen === "science") return <Science />;
  return (
    <Suspense fallback={<main className="column"><p role="status">Loading the demo…</p></main>}>
      <DemoApp route={route} />
    </Suspense>
  );
}
