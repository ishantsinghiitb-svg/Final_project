/**
 * App-side mirror of the extension's
 * `extension/src/core/parsers/linkedin/externalId.ts` — URL-only LinkedIn
 * job-id extraction, usable without a fetched DOM/JSON-LD. MUST stay
 * byte-for-byte identical to the extension's regex so a job manually imported
 * here resolves to the same `global_jobs` row as one the extension captures
 * (see `ManualImportService` and `upsert_global_job`'s (source, source_job_id)
 * lookup).
 */
export function extractLinkedInJobId(url: string): string | null {
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

/** Dispatches to the right board's extractor. Only LinkedIn has one today. */
export function extractExternalId(source: string, url: string): string | null {
  switch (source) {
    case "linkedin":
      return extractLinkedInJobId(url);
    default:
      return null;
  }
}
