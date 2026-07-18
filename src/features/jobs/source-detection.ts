/**
 * App-side job-source detection for manual URL import — the dashboard mirror of
 * the extension's `extension/src/core/site-detection/SiteDetector.ts`. The two
 * bundles can't share a module, so this deliberately returns the SAME lowercase
 * site tags the extension persists (e.g. "linkedin") for recognized boards, so
 * a job imported here and one captured by the extension land on the same
 * `global_jobs.source` value (and dedupe together). Unknown hosts → "Manual",
 * the schema's default source label.
 */
export type DetectedJobSource =
  "linkedin" | "internshala" | "naukri" | "indeed" | "unstop" | "Manual";

const HOST_MAP: ReadonlyArray<{ root: string; source: DetectedJobSource }> = [
  { root: "linkedin.com", source: "linkedin" },
  { root: "internshala.com", source: "internshala" },
  { root: "naukri.com", source: "naukri" },
  { root: "indeed.com", source: "indeed" },
  { root: "unstop.com", source: "unstop" },
];

export function detectJobSource(url: string): DetectedJobSource {
  const host = hostname(url);
  if (!host) return "Manual";

  for (const { root, source } of HOST_MAP) {
    if (host === root || host.endsWith(`.${root}`)) return source;
  }
  return "Manual";
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
