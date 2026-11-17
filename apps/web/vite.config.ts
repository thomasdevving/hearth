import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The engine is imported from source, so the web build does not need a prior engine build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@hearth/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)) },
  },
  server: { fs: { allow: ["../.."] } },
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: { environment: "jsdom", server: { deps: { inline: [/firebase/, /@firebase/] } }, alias: [{ find: /^@firebase\/ai$/, replacement: fileURLToPath(new URL("../../node_modules/@firebase/ai/dist/esm/index.esm.js", import.meta.url)) }], include: ["test/**/*.test.ts", "test/**/*.test.tsx"], setupFiles: ["test/setup.ts"], testTimeout: 120000 },
});
