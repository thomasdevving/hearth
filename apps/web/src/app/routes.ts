export type Route = { screen: string; params: Record<string, string> };

export function parseHash(): Route {
  const hash = location.hash.replace(/^#\/?/, "");
  const [screen, query] = hash.split("?");
  return { screen: screen || "landing", params: Object.fromEntries(new URLSearchParams(query ?? "")) };
}
