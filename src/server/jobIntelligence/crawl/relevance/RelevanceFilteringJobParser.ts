// ── Module 10B.3 Phase 1: inserting the region-relevance gate ──
//
// Same shape as ../validate/ValidatingJobParser.ts, and for the same reason:
// Module 10A's `runPlatformCrawl` is frozen and its `ParseOutcome` is a
// strict ok/fail binary, so a THIRD outcome (excluded-by-policy) cannot be
// added to that type. Instead this wraps the parser as a decorator and
// records the real reason in a collector the orchestrator consults — exactly
// how the Validator stage already solves "skipped vs failed" without
// touching Module 10A.
//
// Deliberately generic: this class knows nothing about We Work Remotely or
// any other platform. It only ever asks "did this parsed job carry a
// `regionRelevance`, and does the shared policy allow it?" — so wrapping
// every platform's parser with it (not just WWR's) is safe and requires no
// per-platform branching anywhere in the pipeline. A platform with no
// restriction signal never sets `regionRelevance`, and an unset value is
// always allowed.

import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import { isRegionRelevant, regionExclusionReason, type RegionRelevance } from "./regionRelevance";

export type RelevanceDecision =
  { kind: "allowed" } | { kind: "excluded"; relevance: RegionRelevance; reason: string };

/** Per-run record of what the relevance gate decided for each posting, keyed by source URL. */
export class RelevanceCollector {
  private decisions = new Map<string, RelevanceDecision>();
  /**
   * Every `record()` call, independent of `decisions`' key collisions — same
   * reasoning as `ValidationCollector.recordCount` (Module 10B.2.5): a source
   * is not obligated to hand back a unique `sourceUrl` per posting, so this
   * is the ground truth for "how many postings actually reached this gate."
   * This decorator is the innermost one around the base parser, so this
   * count is also what `CrawlOrchestrator` uses as the report's `parsed`
   * total — "postings the parser turned into a structured job", regardless
   * of what the gate or the validator later decided about them.
   */
  private recordCount = 0;

  record(sourceUrl: string, decision: RelevanceDecision): void {
    this.decisions.set(sourceUrl, decision);
    this.recordCount++;
  }

  get(sourceUrl: string): RelevanceDecision | undefined {
    return this.decisions.get(sourceUrl);
  }

  get parsedCount(): number {
    return this.recordCount;
  }

  reset(): void {
    this.decisions.clear();
    this.recordCount = 0;
  }
}

export class RelevanceFilteringJobParser implements JobParser {
  constructor(
    private readonly inner: JobParser,
    private readonly collector: RelevanceCollector,
  ) {}

  get platform(): string {
    return this.inner.platform;
  }

  get version(): string {
    return this.inner.version;
  }

  parse(raw: RawJobPayload): ParseOutcome {
    const parsed = this.inner.parse(raw);
    // A parse failure never reaches this gate — there is nothing to classify.
    if (!parsed.ok) return parsed;

    const relevance = parsed.job.regionRelevance;
    if (!relevance || isRegionRelevant(relevance)) {
      this.collector.record(raw.sourceUrl, { kind: "allowed" });
      return parsed;
    }

    const reason = regionExclusionReason(relevance);
    this.collector.record(raw.sourceUrl, { kind: "excluded", relevance, reason });
    return { ok: false, reason: `Excluded by India-first region policy — ${reason}` };
  }
}
