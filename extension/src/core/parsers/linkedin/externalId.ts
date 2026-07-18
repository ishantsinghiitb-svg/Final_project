/**
 * URL-only LinkedIn job-id extraction — the one piece of `source_job_id`
 * resolution that needs no DOM/JSON-LD, so it's usable from a bare URL string
 * (manual import) as well as from a live page (`LinkedInParser`). Kept as its
 * own module so both call sites share exactly one regex instead of drifting.
 *
 * This is also the fix for the Module 4A duplicate-import bug: manual import
 * previously never populated `source_job_id`, so a manually-imported LinkedIn
 * URL could never match an extension-captured row by id and fell back to a
 * fingerprint that also didn't match (the extension only computes a
 * fingerprint when no id is available) — producing a second `global_jobs` row
 * for the same posting. Extracting the same id here for manual import closes
 * that gap; see `DuplicateResolver`.
 */
export function extractLinkedInJobIdFromUrl(url: string): string | null {
  const fromPath = /\/jobs\/view\/(\d+)/.exec(url);
  if (fromPath) return fromPath[1];

  try {
    const parsed = new URL(url);
    const currentJobId = parsed.searchParams.get("currentJobId");
    if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
  } catch {
    // Not a parseable URL — no id extractable this way.
  }

  return null;
}
