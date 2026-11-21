// The InferenceRouter for web (docs/02 §5) on the Firebase JS SDK's hybrid inference.
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, type AI } from "firebase/ai";
import { mayReachCloud, parseJsonLoose, Q_CLASSIFY_CLASS, route, schemas, TASKS, verifyTask, type LedgerEntry, type RouteDecision, type TaskId } from "@hearth/engine";
import { cloudConfigured, firebaseApp, GEMINI_MODEL } from "../firebase";
import { db, getSettings, newId } from "../store/db";
import { nowStamp } from "../app/clock";
import { emitChange } from "../app/events";
import { promptFor } from "./prompts";
import { CREATE_OPTIONS, checkOnDevice, lastOnDeviceState } from "./availability";
import { withCapture } from "./netlog";
import { setModelStatus } from "./status";
import type { InferenceRouter, RunOptions, TaskResult } from "./types";

type AnyTask = TaskId | "Q_classify" | "Q_phrase";

const MODE = {
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  PREFER_IN_CLOUD: InferenceMode.PREFER_IN_CLOUD,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
} as const;

/** Tasks whose input is the user's own text: it goes between delimiters, never as instructions. */
const TEXT_TASKS = new Set<AnyTask>(["G", "G2", "H", "I", "B", "P", "Q_classify", "R", "T"]);

const STRUCTURAL = new Set(["type", "properties", "required", "enum", "items", "additionalProperties"]);
/** On-device constraint: only the structural keywords; the engine still validates everything (R8). */
export function onDeviceSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(onDeviceSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (!STRUCTURAL.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, onDeviceSchema(pv)])) : onDeviceSchema(v);
  }
  return out;
}
function cloudSchema(s: object): object {
  const { $id: _id, ...rest } = s as Record<string, unknown>;
  return rest;
}

export function buildUserMessage(task: AnyTask, input: Record<string, unknown>): string {
  if (TEXT_TASKS.has(task) && typeof input.text === "string") {
    const { text, ...rest } = input;
    const ctx = Object.keys(rest).length ? `Input:\n${JSON.stringify(rest)}\n\n` : "";
    return `${ctx}<user_text>\n${(text as string).replace(/<\/?user_text>/gi, "")}\n</user_text>\n\nReturn only JSON that matches the schema.`;
  }
  return `Input:\n${JSON.stringify(input)}\n\nReturn only JSON that matches the schema.`;
}

let queue: Promise<unknown> = Promise.resolve();

export class WebInferenceRouter implements InferenceRouter {
  private ai: AI | null = null;
  private aiInstance(): AI {
    if (!this.ai) this.ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
    return this.ai;
  }

  run<T>(task: AnyTask, input: object, opts: RunOptions = {}): Promise<TaskResult<T>> {
    // One call at a time, so every request body is attributed to the right ledger entry.
    const next = queue.then(() => this.runOne<T>(task, input, opts));
    queue = next.catch(() => undefined);
    return next;
  }

  private async runOne<T>(task: AnyTask, input: object, opts: RunOptions): Promise<TaskResult<T>> {
    const def = TASKS[(task === "Q_classify" || task === "Q_phrase" ? "Q" : task) as TaskId];
    const promptId = task === "Q" ? "Q_classify" : task;
    const prompt = promptFor(promptId);
    const schemaId = (task === "Q" ? "Q_classify" : task) as keyof typeof schemas;
    // The question in "ask your data" is raw free text: on-device only (R3).
    const dataClass = task === "Q_classify" || task === "Q" ? Q_CLASSIFY_CLASS : def.dataClass;
    const settings = await getSettings();
    const state = settings.onDeviceEnabled ? await checkOnDevice() : "unavailable";
    const onDeviceAvailable = settings.onDeviceEnabled && state === "available";
    const online = settings.online && (typeof navigator === "undefined" || navigator.onLine !== false) && cloudConfigured;
    const decision: RouteDecision = route({ dataClass, cloudConsent: settings.cloudConsent, onDeviceAvailable, online, prefersCloud: def.prefersCloud, hasLiteVariant: def.hasLiteVariant });
    const ledgerTask = (task === "Q_classify" || task === "Q_phrase" ? "Q" : task) as TaskId;
    const base = { task: ledgerTask, promptVersion: `${promptId}@${prompt.version}`, dataClass, decision };

    if (decision.run === "fallback") {
      const id = await this.ledger({ ...base, ranOn: "none", outcome: "fallback", attempts: 0, latencyMs: null, bytesSent: 0, payloadSent: null });
      setModelStatus({ last: { task: String(task), ranOn: "none" } });
      return { ok: false, reason: decision.reason, fallbackUsed: true, ledgerId: id };
    }
    // Belt and braces: an on-device mode is only used when the model is really there.
    if ((decision.mode === "ONLY_ON_DEVICE" || decision.mode === "PREFER_ON_DEVICE") && !onDeviceAvailable) {
      const id = await this.ledger({ ...base, ranOn: "none", outcome: "fallback", attempts: 0, latencyMs: null, bytesSent: 0, payloadSent: null });
      return { ok: false, reason: "no_model", fallbackUsed: true, ledgerId: id };
    }

    const variant = decision.variant;
    const finalInput = (opts.variantInput ? opts.variantInput(variant) : input) as Record<string, unknown>;
    const schema = schemas[schemaId] as object;
    const liteNote = def.hasLiteVariant ? "\n\nIf this runs on the device, always write the lite variant (at most 60 words), whatever the input says." : "";
    const model = getGenerativeModel(this.aiInstance(), {
      mode: MODE[decision.mode],
      onDeviceParams: {
        createOptions: { ...CREATE_OPTIONS, ...(opts.image ? { expectedInputs: [...CREATE_OPTIONS.expectedInputs, { type: "image" as const }] } : {}), initialPrompts: [{ role: "system", content: [{ type: "text", value: prompt.text + liteNote }] }] },
        promptOptions: { responseConstraint: onDeviceSchema(schema) as object },
      },
      inCloudParams: {
        model: GEMINI_MODEL,
        systemInstruction: prompt.text,
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: cloudSchema(schema) as { [k: string]: unknown }, temperature: 0.2, maxOutputTokens: 1024 },
      },
    });
    // App Check (and the anonymous user) must be running before a request that may go to the
    // cloud, also after a reload with consent already given. Only reached with consent (R4):
    // routing never returns a cloud mode without it.
    if (cloudConfigured && settings.cloudConsent && mayReachCloud(decision)) {
      try {
        const { startCloud } = await import("../cloud/client");
        await startCloud();
      } catch (e) {
        console.warn("cloud start", e);
      }
    }
    const message = buildUserMessage(task, finalInput);
    const blockAi = decision.mode === "ONLY_ON_DEVICE";

    let lastId = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = performance.now();
      const request = opts.image ? [message, { type: "inlineData" as const, inlineData: { mimeType: opts.image.mimeType, data: opts.image.data } }] : message;
      const res = await withCapture(String(task), blockAi, () => model.generateContent(request));
      const latencyMs = Math.round(performance.now() - t0);
      const sent = res.bodies.map((b) => b.body).join("\n");
      const ranOn: "on_device" | "cloud" = res.result?.response.inferenceSource === "on_device" ? "on_device" : res.bodies.length > 0 || res.result?.response.inferenceSource === "in_cloud" ? "cloud" : "on_device";
      const cloudFields = ranOn === "cloud" || res.bodies.length > 0 ? { bytesSent: new Blob([sent]).size, payloadSent: sent || null } : { bytesSent: 0, payloadSent: null };
      if (res.error || !res.result) {
        lastId = await this.ledger({ ...base, ranOn: res.bodies.length ? "cloud" : "on_device", outcome: "error", attempts: attempt, latencyMs, ...cloudFields });
        console.warn(`task ${task} failed`, res.error);
        if (attempt === 2) return { ok: false, reason: "error", fallbackUsed: true, ledgerId: lastId };
        continue;
      }
      let text = "";
      try {
        text = res.result.response.text();
      } catch {
        text = "";
      }
      const raw = parseJsonLoose(text);
      opts.onRaw?.(raw, text, attempt);
      const usedVariant = ranOn === "on_device" && def.hasLiteVariant ? "lite" : variant;
      const v = verifyTask(task, raw, { ...opts.verify, sourceText: opts.sourceText ?? opts.verify?.sourceText, facts: opts.verify?.facts ?? finalInput, variant: usedVariant });
      if (!v.ok) {
        lastId = await this.ledger({ ...base, ranOn, outcome: "invalid_output", attempts: attempt, latencyMs, ...cloudFields });
        if (attempt === 2) return { ok: false, reason: "invalid_output", fallbackUsed: true, ledgerId: lastId };
        continue;
      }
      lastId = await this.ledger({ ...base, ranOn, outcome: "ok", attempts: attempt, latencyMs, ...cloudFields });
      setModelStatus({ last: { task: String(task), ranOn } });
      return { ok: true, value: v.value as T, ranOn, ledgerId: lastId };
    }
    return { ok: false, reason: "error", fallbackUsed: true, ledgerId: lastId };
  }

  private async ledger(e: Omit<LedgerEntry, "id" | "at">): Promise<string> {
    const entry: LedgerEntry = { id: newId("ledger"), at: nowStamp(), ...e };
    await db.ledger.put(entry);
    emitChange();
    return entry.id;
  }
}

export { mayReachCloud, lastOnDeviceState };
