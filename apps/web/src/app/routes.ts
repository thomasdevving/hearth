export type Route = { screen: string; params: Record<string, string> };

/** Clean paths that open a public page directly (vercel.json serves index.html for them). */
const PUBLIC_PATHS: Record<string, string> = { "/science": "science" };

export function parseHash(): Route {
  const path = location.pathname.replace(/\/+$/, "");
  if (!location.hash && PUBLIC_PATHS[path]) return { screen: PUBLIC_PATHS[path], params: {} };
  const hash = location.hash.replace(/^#\/?/, "");
  const [screen, query] = hash.split("?");
  return { screen: screen || "landing", params: Object.fromEntries(new URLSearchParams(query ?? "")) };
}
