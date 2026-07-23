import { env } from "./env";

/**
 * Dashboard deep-link for an AI Job Match action (Module 6C). Shared by the
 * floating panel (content script) and the popup so the URL shape stays in one
 * place. Carries the selected resume (`?resume=`) so the dashboard preselects
 * it, plus an intent so a single extension click can land the user directly on
 * the credit confirmation:
 *   analyze   → ?analyze=1
 *   reanalyze → ?analyze=1&force=1
 *   view      → (no analysis params)
 * The analysis runs on the dashboard via the shared ResumeMatchService — never
 * in the extension (no provider key here, by design).
 */
export function buildMatchUrl(
  globalJobId: string,
  resumeId: string | null,
  intent: "view" | "analyze" | "reanalyze",
): string {
  const params = new URLSearchParams();
  if (resumeId) params.set("resume", resumeId);
  if (intent === "analyze" || intent === "reanalyze") params.set("analyze", "1");
  if (intent === "reanalyze") params.set("force", "1");
  const qs = params.toString();
  return `${env.appUrl}/dashboard/jobs/${globalJobId}${qs ? `?${qs}` : ""}`;
}
