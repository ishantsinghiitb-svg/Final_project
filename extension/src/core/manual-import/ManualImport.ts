import { extractLinkedInJobIdFromUrl } from "../parsers/linkedin/externalId";
import { SiteDetector } from "../site-detection/SiteDetector";
import { SupportedSite } from "../site-detection/types";
import { createUniversalJob, type JobSourceTag, type UniversalJob } from "../parsers/types";

export type ManualImportInput = {
  url: string;
  title?: string | null;
  company?: string | null;
  description?: string | null;
};

/** Distinguishes manual-import jobs from parser-extracted ones in `parser_version`. */
export const MANUAL_IMPORT_VERSION = "manual-1";

/**
 * Foundation for capturing a job from a raw URL — the reusable core behind both
 * the dashboard "Import Job" modal and the extension popup importer.
 *
 * It does NOT run a site parser or fetch/scrape the page (a live DOM parse is
 * the extension content script's job; a server-side generic/URL parser is
 * Module 4B). It only detects the source from the hostname and assembles a
 * minimal `UniversalJob` from the fields the user supplied, so the result flows
 * through the exact same Normalizer → Validator → DuplicateResolver → upsert
 * pipeline as extension capture — no separate write path, same dedup.
 */
export class ManualImport {
  static build(input: ManualImportInput): UniversalJob {
    const url = input.url.trim();
    const source = this.detectSource(url);

    return createUniversalJob({
      source,
      parserVersion: MANUAL_IMPORT_VERSION,
      title: (input.title ?? "").trim(),
      companyName: (input.company ?? "").trim(),
      sourceUrl: url,
      applyUrl: url || null,
      description: input.description?.trim() ? input.description.trim() : null,
      sourceJobId: this.extractExternalId(source, url),
      isManualImport: true,
    });
  }

  /**
   * URL-only external-id extraction for recognized boards — the same
   * resolution a live parser would reach for `source_job_id`, minus anything
   * that needs a fetched DOM/JSON-LD (not available to a bare URL import).
   * Only LinkedIn has an extraction rule today; unrecognized/other boards
   * fall back to fingerprint-based dedup (see `DuplicateResolver`).
   */
  private static extractExternalId(source: JobSourceTag, url: string): string | null {
    switch (source) {
      case SupportedSite.LinkedIn:
        return extractLinkedInJobIdFromUrl(url);
      default:
        return null;
    }
  }

  /** Recognized board → its site tag; anything else → `"Manual"`. */
  static detectSource(url: string): JobSourceTag {
    const site = SiteDetector.detect(this.hostname(url));
    return site === SupportedSite.Unsupported ? "Manual" : site;
  }

  private static hostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }
}
