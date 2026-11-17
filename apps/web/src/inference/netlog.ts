// Records every request the app makes, and blocks model endpoints while an on-device-only
// call runs (R3 does not depend on the SDK; docs/PLATFORM_NOTES.md §7).
import { db } from "../store/db";

const AI_HOSTS = ["firebasevertexai.googleapis.com", "generativelanguage.googleapis.com", "aiplatform.googleapis.com", "firebaseml.googleapis.com"];

interface Capture {
  task: string;
  bodies: { url: string; body: string }[];
  blockAi: boolean;
}
let capture: Capture | null = null;
let installed = false;

export function isAiUrl(url: string): boolean {
  try {
    return AI_HOSTS.includes(new URL(url, location.href).hostname);
  } catch {
    return false;
  }
}

function bodyText(body: BodyInit | null | undefined): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body as ArrayBufferView);
  return "[binary body]";
}

export function installNetworkLog(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const sameOrigin = (() => {
      try {
        return new URL(url, location.href).origin === location.origin;
      } catch {
        return true;
      }
    })();
    if (!sameOrigin) {
      const body = bodyText(init?.body ?? null);
      if (capture?.blockAi && isAiUrl(url)) {
        await db.network_log.add({ at: new Date().toISOString(), url: `BLOCKED ${url}`, method: init?.method ?? "GET", bytes: 0, task: capture.task });
        throw new Error("Blocked: an on-device-only task tried to reach the network.");
      }
      if (capture && isAiUrl(url)) capture.bodies.push({ url, body });
      void db.network_log.add({ at: new Date().toISOString(), url: url.split("?")[0], method: init?.method ?? "GET", bytes: new Blob([body]).size, task: capture?.task ?? null });
    }
    return orig(input as RequestInfo, init);
  };
}

/** Run `fn` while capturing request bodies to model endpoints. */
export async function withCapture<T>(task: string, blockAi: boolean, fn: () => Promise<T>): Promise<{ result: T | undefined; error: unknown; bodies: { url: string; body: string }[] }> {
  const c: Capture = { task, bodies: [], blockAi };
  capture = c;
  try {
    const result = await fn();
    return { result, error: null, bodies: c.bodies };
  } catch (error) {
    return { result: undefined, error, bodies: c.bodies };
  } finally {
    capture = null;
  }
}
