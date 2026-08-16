// Builds the Safari Web Extension target (Module 12) from the SAME
// extension/src source tree the Chrome/Edge build uses — no parser, panel,
// auth, or messaging logic is duplicated here.
//
// Why this doesn't reuse vite.config.ts + @crxjs/vite-plugin: CRXJS's
// content-script output is a tiny loader that does
// `import(chrome.runtime.getURL("assets/real-bundle.js"))` from inside the
// content script itself. That pattern is unverified/reported-broken in
// Safari (see the Module 12 audit). This script instead bundles each
// content script and the background service worker as a single
// self-contained IIFE (Rollup inlines every import, including React and
// the parser modules — nothing left to dynamically import at runtime), and
// builds the popup the same way Vite already does for Chrome (a normal
// HTML entry, untouched pipeline).
//
// Run: npm run build:safari  (from extension/)
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

import { build } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "dist-safari");

async function buildIife(entryRelPath, fileName, globalName) {
  await build({
    root,
    configFile: false,
    plugins: [react()],
    // Vite's `build.lib` mode (unlike its normal app-build mode, which is
    // what CRXJS uses for the Chromium popup/content-script chunks) does
    // NOT default to defining `process.env.NODE_ENV` or minifying, on the
    // assumption a library build's consumer controls both. These IIFEs are
    // the final shipped artifact, not a library, so both must be forced
    // explicitly — otherwise React ships its development build (verbose
    // console warnings, ~8x larger) instead of the production build the
    // Chromium bundle already gets for free from CRXJS's app-mode pipeline.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir,
      emptyOutDir: false,
      minify: "esbuild",
      lib: {
        entry: path.join(root, entryRelPath),
        formats: ["iife"],
        name: globalName,
        fileName: () => fileName,
      },
    },
  });
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // Content script + auth bridge + background: self-contained IIFE bundles.
  // This is the direct fix for the audit's highest-risk Safari finding (S1).
  await buildIife("src/content/index.ts", "content-script.js", "OfferLystContentScript");
  await buildIife(
    "src/content/auth-bridge/session-reader.ts",
    "session-reader.js",
    "OfferLystSessionReader",
  );
  await buildIife("src/background/service-worker.ts", "service-worker.js", "OfferLystServiceWorker");

  // Popup: a normal HTML entry, same as the Chromium build already produces
  // (untouched pipeline — react() + Vite's built-in HTML/CSS handling).
  await build({
    root,
    configFile: false,
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: path.join(root, "src/popup/index.html"),
      },
    },
  });

  // Icons, at the same relative path the manifest (and the Chromium dist)
  // already reference.
  const iconsSrc = path.join(root, "src/assets/icons");
  const iconsDest = path.join(outDir, "src/assets/icons");
  await fs.mkdir(iconsDest, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const name = `icon-${size}.png`;
    await fs.copyFile(path.join(iconsSrc, name), path.join(iconsDest, name));
  }

  // Manifest: built from manifest.safari.ts (same shared constants as
  // manifest.config.ts) via Node's native TS support, so there is exactly
  // one place the 7 supported job-board patterns and permissions are typed.
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const { buildSafariManifest } = await import(
    pathToFileURL(path.join(root, "manifest.safari.ts")).href
  );
  const manifest = buildSafariManifest(pkg.version);
  await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nSafari build written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
