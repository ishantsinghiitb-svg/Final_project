/**
 * Deterministic dedup key for jobs that don't expose a stable external ID.
 * Same title+company+location always hashes to the same fingerprint, so the
 * same posting resolves to the same global_jobs row across separate scrapes
 * (e.g. opened again next month) — see upsert_global_job in
 * supabase/migrations/20260716000001_add_global_job_dedup_and_sync.sql.
 */
export class FingerprintGenerator {
  static async generate(
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
}
