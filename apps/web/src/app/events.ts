// A tiny change signal so screens re-read the store after the loop or an action writes.
type Listener = () => void;
const listeners = new Set<Listener>();
export function onChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function emitChange(): void {
  for (const l of [...listeners]) l();
}

type NavListener = (screen: string, params?: Record<string, string>) => void;
let navigator: NavListener | null = null;
export function setNavigator(n: NavListener): void {
  navigator = n;
}
/** Navigate to a screen id (docs/01 §4). */
export function navigate(screen: string, params?: Record<string, string>): void {
  navigator?.(screen, params);
}
