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
    service_worker: "src/background/index.ts",
    type: "module",
  },
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
  ],
});
