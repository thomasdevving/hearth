import type { InferenceRouter, TaskResult } from "./types";

/** Until a real router is installed every task uses its fallback (M4: templates only). */
class FallbackRouter implements InferenceRouter {
  async run<T>(): Promise<TaskResult<T>> {
    return { ok: false, reason: "no_model", fallbackUsed: true, ledgerId: "" };
  }
}

let current: InferenceRouter = new FallbackRouter();
export function setRouter(r: InferenceRouter): void {
  current = r;
}
export function router(): InferenceRouter {
  return current;
}
