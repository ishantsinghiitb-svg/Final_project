import type { UniversalJob } from "../parsers/types";

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * The pipeline's validation stage: **Normalizer → Validator → persistence**.
 * A job that fails here never reaches the DuplicateResolver or the upsert (no
 * create, no update).
 *
 * Validates IDENTITY only — the fields that make a capture a real, save-able,
 * de-dupable job: title, company, a valid source URL, and at least one identity
 * key (external id or fingerprint). Everything else (description, location,
 * salary, …) is enrichment: the Normalizer already records those as soft
 * `extractionWarnings`, and `upsert_global_job` COALESCE-enriches them on a
 * later, more-complete capture of the same job.
 *
 * Description is deliberately NOT required here (Module 6C fix). On SPA job
 * boards — LinkedIn's split-pane most of all — the title + company render in
 * the top card a beat before the description hydrates (and a collapsed
 * "see more" description parses empty). Gating on description made that
 * transient state fail sync, which the content script surfaced as the
 * long-standing "No job detected" — even though a valid job was clearly on
 * screen. A job with title + company + id is detected and save-able now; the
 * description enriches on the follow-up capture once it hydrates.
 *
 * Closed/expired postings are NOT rejected here — an existing Global Job should
 * be updated to reflect the closed state rather than ignored. `isClosed` is read
 * downstream by the sync handler and the floating panel, not by this validator.
 */
export class JobValidator {
  static validate(job: UniversalJob): ValidationResult {
    if (!job.title.trim()) {
      return { valid: false, reason: "Missing job title" };
    }

    if (!job.companyName.trim()) {
      return { valid: false, reason: "Missing company name" };
    }

    if (!this.isValidUrl(job.sourceUrl)) {
      return { valid: false, reason: "Invalid source URL" };
    }

    if (!job.sourceJobId && !job.fingerprint) {
      return { valid: false, reason: "No source job ID or fingerprint available" };
    }

    return { valid: true };
  }

  private static isValidUrl(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
}
