import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// ── Vitest config (Module 6 freeze) ──
//
// Deliberately STANDALONE rather than a `test` block inside vite.config.ts:
// that file is a thin wrapper around @lovable.dev/vite-tanstack-config, which
// documents that plugins must not be added by hand or the app build breaks.
// Tests need none of that pipeline — just the `@` alias and a node environment
// — so keeping them in their own config means the test setup cannot affect the
// app build at all.
//
// Scope is intentionally narrow: the AI engine's credit / cache / audit
// behaviour. These are unit tests over `runCapability` with the provider,
// context builder, prompt renderer and capability registry stubbed at the
// boundary. Everything inside that boundary — the credit service, the retry
// helper, the error mapper, the cache read/write and the run log — runs for
// real, because those are the parts a regression would silently cost money.

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The AI engine is the only tested area today; a `coverage` threshold
    // across the whole repo would report a misleading number.
    coverage: {
      include: ["src/server/ai/**"],
    },
  },
});
