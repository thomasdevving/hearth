// System prompts from shared/prompts, one per task, each with a `version:` line (docs/05 §6).
const files = import.meta.glob("../../../../shared/prompts/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface Prompt {
  id: string;
  version: string;
  text: string;
}

export const PROMPTS: Record<string, Prompt> = {};
for (const [path, raw] of Object.entries(files)) {
  const id = path.split("/").pop()!.replace(/\.md$/, "");
  const m = raw.match(/^version:\s*(\S+)\s*\n/);
  PROMPTS[id] = { id, version: m ? m[1] : "unknown", text: (m ? raw.slice(m[0].length) : raw).trim() };
}

/** Remote Config may override the active version label; the text is the bundled one. */
let overrides: Record<string, string> = {};
export function setPromptVersionOverrides(o: Record<string, string>): void {
  overrides = { ...o };
}
export function promptFor(id: string): Prompt {
  const p = PROMPTS[id];
  if (!p) throw new Error(`no prompt ${id}`);
  return overrides[id] ? { ...p, version: overrides[id] } : p;
}
