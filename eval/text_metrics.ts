// docs/10 metric 8 (date resolution in code, given correct hints) and metric 9 (keywords).
//   npx tsx eval/text_metrics.ts
import { readFileSync, writeFileSync } from "node:fs";
import { CONTEXT_TABLE, defaultConfig, detectCrisis, resolveContextPeriod } from "../packages/engine/src/index";

const h = JSON.parse(readFileSync(new URL("./task_h.json", import.meta.url), "utf8"));
const c = JSON.parse(readFileSync(new URL("./crisis.json", import.meta.url), "utf8"));
const out: string[] = [];
const log = (s = "") => (out.push(s), console.log(s));

let ok = 0;
let n = 0;
const misses: string[] = [];
for (const x of h.cases) {
  if (x.context === "none") continue;
  n++;
  const p = resolveContextPeriod(x.start_hint, x.end_hint, h.today, CONTEXT_TABLE[x.context].kind, defaultConfig);
  const endOk = x.end === null ? !p.endResolved : p.end === x.end;
  if (p.start === x.start && endOk) ok++;
  else misses.push(`"${x.start_hint}" / "${x.end_hint}" → ${p.start}..${p.endResolved ? p.end : "(unresolved)"}, expected ${x.start}..${x.end ?? "(unresolved)"}`);
}
log("## Metric 8 · Task H date resolution in code (given correct hints)");
log(`${ok} of ${n} context sentences resolve to the expected start and end.`);
for (const m of misses) log(`- miss: ${m}`);
log("Label accuracy needs the on-device model: run it on the #/eval_g screen in Chrome.");

const hit = c.crisis.filter((s: string) => detectCrisis(s));
const fp = c.neutral.filter((s: string) => detectCrisis(s));
log("\n## Metric 9 · Crisis detection, keywords alone");
log(`Crisis sentences detected: ${hit.length} of ${c.crisis.length}. Neutral sentences flagged: ${fp.length} of ${c.neutral.length}.`);
for (const s of c.crisis.filter((x: string) => !detectCrisis(x))) log(`- missed: "${s}"`);
for (const s of fp) log(`- false positive: "${s}"`);
writeFileSync(new URL("./results/text_metrics.md", import.meta.url), out.join("\n") + "\n");
