import type { GlobalJob } from "@/types";
import type { Json } from "@/types/database";
import { JobRepository } from "@/repositories/JobRepository";
import { detectJobSource } from "@/features/jobs/source-detection";
import { generateFingerprint } from "@/features/jobs/fingerprint";
import { extractExternalId } from "@/features/jobs/external-id";

// Single repository instance — no state, safe to reuse.
const jobRepo = new JobRepository();

/** Distinguishes manually-imported rows from parser-extracted ones in `parser_version`. */
const MANUAL_IMPORT_VERSION = "manual-1";

export type ManualImportInput = {
  url: string;
  title: string;
  company: string;
  description: string;
  location?: string;
};

/**
 * ManualImportService — the dashboard half of the Module 4A manual-URL import
 * foundation. It detects the source from the URL, computes the same dedup
 * fingerprint the extension uses, and writes through the SAME
 * `upsert_global_job` RPC (single write path), so a manually imported job is
 * deduped against extension-captured jobs and never creates a duplicate Global
 * Job. No page scraping happens here — a live/generic parser is Module 4B; this
 * layer is the reusable plumbing the UI (and future importers) call into.
 */
export class ManualImportService {
  async importFromUrl(input: ManualImportInput): Promise<GlobalJob> {
    const url = input.url.trim();
    const title = input.title.trim();
    const company = input.company.trim();
    const description = input.description.trim();
    const location = input.location?.trim() || null;

    if (!url) throw new Error("A job URL is required.");
    if (!isValidUrl(url)) throw new Error("Enter a valid job URL.");
    if (!title) throw new Error("A job title is required.");
    if (!company) throw new Error("A company name is required.");
    if (!description) throw new Error("A short description is required.");

    const source = detectJobSource(url);
    // Extracted whenever the URL shape allows it (currently LinkedIn only) —
    // this is the fix for the duplicate-row bug: without a matching
    // source_job_id, a manual import of a URL the extension already captured
    // fell back to a fingerprint that never matched the extension's row and
    // created a second one. See extractExternalId + DuplicateResolver.
    const sourceJobId = extractExternalId(source, url);
    const fingerprint = await generateFingerprint(title, company, location);

    // Confidence is computed (not hardcoded): a small completeness score over
    // the few fields a manual import can carry — recognized source, location,
    // description. Manual imports naturally score below dedicated parsers.
    const signals = [source !== "Manual", Boolean(location), Boolean(description)];
    const parserConfidence =
      Math.round((signals.filter(Boolean).length / signals.length) * 100) / 100;

    const payload = {
      source,
      source_job_id: sourceJobId,
      fingerprint,
      company_name: company,
      role: title,
      location,
      description,
      url,
      source_url: url,
      parser_version: MANUAL_IMPORT_VERSION,
      parser_confidence: parserConfidence,
      extraction_warnings: ["manual import — details not parsed"],
      // Irreversible-promotion flag — see upsert_global_job. If this hits an
      // existing row that a real parser already captured, it stays visible.
      is_manual_import: true,
    };

    return jobRepo.upsertGlobalJob(payload as unknown as Json);
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Singleton — import `manualImportService` instead of `new ManualImportService()`.
export const manualImportService = new ManualImportService();
