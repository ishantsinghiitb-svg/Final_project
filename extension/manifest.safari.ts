// Safari Web Extension manifest — built by scripts/build-safari.mjs, NOT by
// @crxjs/vite-plugin (that plugin's content-script loader relies on a
// dynamic `import(chrome.runtime.getURL(...))` from within the content
// script itself, which is unverified/unsupported in Safari — see the Module
// 12 cross-browser audit). This file supplies the same manifest DATA as
// manifest.config.ts (same shared constants, same permissions, same 7
// supported job-board host patterns), pointed at the self-contained IIFE
// bundles scripts/build-safari.mjs produces instead of CRXJS's loader
// chunks. manifest.config.ts (the Chrome/Edge manifest) is untouched by
// this file's existence.
import {
  EXTENSION_DESCRIPTION,
  EXTENSION_NAME,
  JOB_BOARD_MATCH_PATTERNS,
  TRUSTED_APP_ORIGINS,
} from "./src/shared/constants.ts";

const icons = {
  16: "src/assets/icons/icon-16.png",
  32: "src/assets/icons/icon-32.png",
  48: "src/assets/icons/icon-48.png",
  128: "src/assets/icons/icon-128.png",
};

export function buildSafariManifest(version: string) {
  return {
    manifest_version: 3,
    name: EXTENSION_NAME,
    description: EXTENSION_DESCRIPTION,
    version,
    icons,
    action: {
      default_title: EXTENSION_NAME,
      default_popup: "src/popup/index.html",
      default_icon: icons,
    },
    // No `type: "module"` — scripts/build-safari.mjs bundles this as a
    // self-contained IIFE (no top-level import/export survives), which
    // sidesteps Safari's `background.scripts` vs `background.service_worker`
    // + `preferred_environment` selection question entirely (see audit S3).
    background: {
      service_worker: "service-worker.js",
    },
    // Identical to manifest.config.ts: no <all_urls>, no `tabs` permission.
    // TRUSTED_APP_ORIGINS (shared/constants.ts) kept in sync with
    // manifest.config.ts — one shared list, not two copies to drift apart.
    permissions: ["storage", "scripting"],
    host_permissions: [...JOB_BOARD_MATCH_PATTERNS, ...TRUSTED_APP_ORIGINS],
    content_scripts: [
      {
        matches: [...JOB_BOARD_MATCH_PATTERNS],
        js: ["content-script.js"],
        run_at: "document_idle",
      },
      {
        matches: [...TRUSTED_APP_ORIGINS],
        js: ["session-reader.js"],
        run_at: "document_idle",
      },
    ],
    // No `web_accessible_resources` — that key exists in the Chromium
    // manifest ONLY to expose CRXJS's dynamically-imported chunk files to
    // the page origin. These IIFE bundles are self-contained (verified: no
    // `chrome.runtime.getURL(` call site and no dynamic `import()` anywhere
    // in extension/src), so nothing needs to be web-accessible.
  };
}
