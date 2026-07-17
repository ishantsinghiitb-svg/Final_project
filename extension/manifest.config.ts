import { defineManifest } from "@crxjs/vite-plugin";

import { version } from "./package.json";
import { EXTENSION_DESCRIPTION, EXTENSION_NAME } from "./src/shared/constants";

const icons = {
  16: "src/assets/icons/icon-16.png",
  48: "src/assets/icons/icon-48.png",
  128: "src/assets/icons/icon-128.png",
};

export default defineManifest({
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
  background: {
    // Must NOT share a basename with any content script entry (e.g. "index.ts") —
    // @crxjs/vite-plugin's manifest-generation step names the emitted chunk via
    // `basename(file)` with the directory stripped, so a name collision between
    // the background and a content script causes the generated manifest to wire
    // both entries to the same generated bundle.
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: ["storage"],
  content_scripts: [
    {
      matches: [
        "*://*.linkedin.com/*",
        "*://wellfound.com/*",
        "*://*.wellfound.com/*",
        "*://boards.greenhouse.io/*",
        "*://jobs.lever.co/*",
        "*://jobs.ashbyhq.com/*",
      ],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
    {
      // Auth bridge only — reads the NextOffer web app's own Supabase
      // session from localStorage. Localhost-only for now; add the
      // production app origin here once it's deployed.
      matches: ["http://localhost:*/*", "http://127.0.0.1:*/*"],
      js: ["src/content/auth-bridge/session-reader.ts"],
      run_at: "document_idle",
    },
  ],
});
