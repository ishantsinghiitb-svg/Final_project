import type { UniversalJob } from "../parsers/types";

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * The pipeline's validation stage: **Normalizer → Validator → persistence**.
 * A job that fails here never reaches the DuplicateResolver or the upsert (no
 * create, no update).
 *
 * Closed/expired postings are NOT rejected here — they still have a title,
 * company, and description, and per the sync spec an existing Global Job
 * should be updated to reflect the closed state rather than being ignored.
 * `UniversalJob.isClosed` is read downstream by the sync handler and the
 * floating panel, not by this validator.
 */
export class JobValidator {
  static validate(job: UniversalJob): ValidationResult {
    if (!job.title.trim()) {
      return { valid: false, reason: "Missing job title" };
    }

    if (!job.companyName.trim()) {
      return { valid: false, reason: "Missing company name" };
    }

    if (!job.description || !job.description.trim()) {
      return { valid: false, reason: "Missing job description" };
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
