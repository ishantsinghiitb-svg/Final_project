// ── Module 10B.1: inserting the Validator into Module 10A's pipeline ──
//
// The required pipeline for this module is
//   Crawler → Parser → Validator → Normalizer → Deduplicator → Database
// while Module 10A's `runPlatformCrawl` implements
//   Crawler → Parser → Normalizer → Deduplicator → Database
// and is documented as "the ONLY orchestration entry point for ingestion".
//
// Rather than fork that runner (which would leave two ingestion paths that
// could drift), the Validator is inserted as a DECORATOR around the platform's
// parser. `runPlatformCrawl` stays byte-for-byte unchanged and remains the
// single ingestion path; every posting it normalizes has necessarily been
// validated first, because it cannot reach the Normalizer any other way.
//
// The one thing a decorator loses is the ability to say "skipped" rather than
// "parse_failed" through Module 10A's `CrawlRunOutcome`. That is solved WITHOUT
// string-sniffing the reason: the decorator records each decision in a
// collector the orchestrator owns, and the orchestrator classifies outcomes by
// looking the posting up there.

import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import { validateParsedJob, type ValidationIssue } from "./JobValidator";

export type ValidationDecision =
  | { kind: "parsed"; sanitized: ValidationIssue[] }
  | { kind: "skipped"; reason: string; issues: ValidationIssue[] };

/**
 * Per-run record of what the Validator decided for each posting, keyed by
 * source URL. Postings from one crawl target have distinct URLs, which is what
 * makes the URL a usable key here.
 */
export class ValidationCollector {
  private decisions = new Map<string, ValidationDecision>();

  record(sourceUrl: string, decision: ValidationDecision): void {
    this.decisions.set(sourceUrl, decision);
  }

  get(sourceUrl: string): ValidationDecision | undefined {
    return this.decisions.get(sourceUrl);
  }

  /** Postings the parser successfully structured (whether or not validation then rejected them). */
  get parsedCount(): number {
    return this.decisions.size;
  }

  get skipped(): Array<{ sourceUrl: string; reason: string }> {
    const out: Array<{ sourceUrl: string; reason: string }> = [];
    for (const [sourceUrl, decision] of this.decisions) {
      if (decision.kind === "skipped") out.push({ sourceUrl, reason: decision.reason });
    }
    return out;
  }

  /** Fields blanked or corrected during validation, for the report's warnings. */
  get sanitizedNotes(): string[] {
    const notes: string[] = [];
    for (const [sourceUrl, decision] of this.decisions) {
      if (decision.kind !== "parsed" || decision.sanitized.length === 0) continue;
      const fields = decision.sanitized
        .map((issue) => `${issue.field} (${issue.message})`)
        .join(", ");
      notes.push(`${sourceUrl}: ${fields}`);
    }
    return notes;
  }

  reset(): void {
    this.decisions.clear();
  }
}

export class ValidatingJobParser implements JobParser {
  constructor(
    private readonly inner: JobParser,
    private readonly collector: ValidationCollector,
  ) {}

  get platform(): string {
    return this.inner.platform;
  }

  get version(): string {
    return this.inner.version;
  }

  parse(raw: RawJobPayload): ParseOutcome {
    const parsed = this.inner.parse(raw);
    // A parse failure never reaches the Validator — there is nothing to check,
    // and it must stay classified as `failed`, not `skipped`.
    if (!parsed.ok) return parsed;

    const validation = validateParsedJob(parsed.job);
    if (!validation.ok) {
      this.collector.record(raw.sourceUrl, {
        kind: "skipped",
        reason: validation.reason,
        issues: validation.issues,
      });
      return { ok: false, reason: `Validation rejected the posting — ${validation.reason}` };
    }

    this.collector.record(raw.sourceUrl, { kind: "parsed", sanitized: validation.sanitized });
    return { ok: true, job: validation.job };
  }
}
