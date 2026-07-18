/**
 * App-side fallback dedup key for jobs without a stable external id — an exact
 * mirror of the extension's
 * `extension/src/core/fingerprint/FingerprintGenerator.ts`. The normalization
 * (trim → lowercase → collapse whitespace → join with "|") and SHA-256 hex
 * output MUST stay byte-for-byte identical to the extension's so the same
 * posting resolves to the same `global_jobs` row no matter which surface
 * created it (see `upsert_global_job`).
 */
export async function generateFingerprint(
  title: string,
  companyName: string,
  location: string | null,
): Promise<string> {
  const normalized = [title, companyName, location ?? ""]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
