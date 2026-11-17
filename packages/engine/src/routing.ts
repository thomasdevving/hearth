// docs/05 §2–3: the only place where it is decided where a task runs.
import type { DataClass, RouteDecision, RouteRequest, TaskId } from "./types";
import type { SchemaId } from "./guardrails/validate";

export interface TaskDef {
  id: TaskId;
  dataClass: DataClass;
  prefersCloud: boolean;
  hasLiteVariant: boolean;
  schema: SchemaId;
  prompt: string; // file name in shared/prompts without ".md"
  priority: "P0" | "P1";
}

/** docs/05 §3. Q runs as two calls (classify, phrase); both are S2. */
export const TASKS: Record<TaskId, TaskDef> = {
  G: { id: "G", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "G", prompt: "G", priority: "P0" },
  G2: { id: "G2", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "G", prompt: "G", priority: "P1" },
  H: { id: "H", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "H", prompt: "H", priority: "P0" },
  I: { id: "I", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "I", prompt: "I", priority: "P1" },
  A: { id: "A", dataClass: "S2", prefersCloud: false, hasLiteVariant: false, schema: "A", prompt: "A", priority: "P0" },
  B: { id: "B", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "B", prompt: "B", priority: "P1" },
  C: { id: "C", dataClass: "S2", prefersCloud: false, hasLiteVariant: false, schema: "C", prompt: "C", priority: "P0" },
  K: { id: "K", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "K", prompt: "K", priority: "P1" },
  Q: { id: "Q", dataClass: "S2", prefersCloud: false, hasLiteVariant: false, schema: "Q_classify", prompt: "Q_classify", priority: "P1" },
  P: { id: "P", dataClass: "S3", prefersCloud: false, hasLiteVariant: false, schema: "P", prompt: "P", priority: "P1" },
  D: { id: "D", dataClass: "S1", prefersCloud: true, hasLiteVariant: true, schema: "D", prompt: "D", priority: "P0" },
  E: { id: "E", dataClass: "S1", prefersCloud: true, hasLiteVariant: false, schema: "E", prompt: "E", priority: "P1" },
};

/** docs/05 §2. S3 never leaves the device, whatever the input. */
export function route(req: RouteRequest): RouteDecision {
  const { dataClass, cloudConsent, onDeviceAvailable, online, prefersCloud, hasLiteVariant } = req;
  if (dataClass === "S3") {
    return onDeviceAvailable ? { run: "model", mode: "ONLY_ON_DEVICE", variant: "full" } : { run: "fallback", reason: "no_model" };
  }
  if (dataClass === "S2") {
    if (onDeviceAvailable) return { run: "model", mode: cloudConsent ? "PREFER_ON_DEVICE" : "ONLY_ON_DEVICE", variant: "full" };
    if (cloudConsent && online) return { run: "model", mode: "ONLY_IN_CLOUD", variant: "full" };
    return { run: "fallback", reason: !cloudConsent ? "no_model" : "offline" };
  }
  // S1
  if (!cloudConsent) return { run: "fallback", reason: "no_consent" };
  if (online) {
    if (prefersCloud) return hasLiteVariant ? { run: "model", mode: "PREFER_IN_CLOUD", variant: "full" } : { run: "model", mode: "ONLY_IN_CLOUD", variant: "full" };
    return onDeviceAvailable ? { run: "model", mode: "PREFER_ON_DEVICE", variant: "full" } : { run: "model", mode: "ONLY_IN_CLOUD", variant: "full" };
  }
  if (hasLiteVariant && onDeviceAvailable) return { run: "model", mode: "ONLY_ON_DEVICE", variant: "lite" };
  return { run: "fallback", reason: "offline" };
}

/** Convenience: route a task by id. */
export function routeTask(task: TaskId, flags: { cloudConsent: boolean; onDeviceAvailable: boolean; online: boolean }): RouteDecision {
  const def = TASKS[task];
  return route({ dataClass: def.dataClass, prefersCloud: def.prefersCloud, hasLiteVariant: def.hasLiteVariant, ...flags });
}

export function mayReachCloud(d: RouteDecision): boolean {
  return d.run === "model" && (d.mode === "ONLY_IN_CLOUD" || d.mode === "PREFER_IN_CLOUD" || d.mode === "PREFER_ON_DEVICE");
}
