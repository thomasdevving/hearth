import { defineConfig } from "tsup";

// Two outputs: ESM for the web app and Node, and one IIFE bundle (dist/engine.js) that
// exposes `BaselineEngine` as a global for JavaScriptCore on iOS.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    target: "es2020",
    sourcemap: true,
  },
  {
    entry: { engine: "src/index.ts" },
    format: ["iife"],
    globalName: "BaselineEngine",
    target: "es2019",
    platform: "neutral",
    noExternal: [/.*/],
    outExtension: () => ({ js: ".js" }),
    minify: false,
    clean: false,
  },
]);
