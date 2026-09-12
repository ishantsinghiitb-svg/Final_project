// ── Inserting the catalog-eligibility gate into the crawl pipeline ──
//
// Same decorator shape as ../validate/ValidatingJobParser.ts and
// ../relevance/RelevanceFilteringJobParser.ts, for the same reason: Module
// 10A's `runPlatformCrawl` is frozen and its `ParseOutcome` is a strict
// ok/fail binary, so a third outcome kind ("ineligible for this catalog") is
// expressed by a collector the orchestrator consults rather than by widening a
// frozen type.
//
// Composed BETWEEN the two existing decorators:
//
//   ValidatingJobParser( Eligibility( RelevanceFiltering( baseParser ) ) )
//
// — relevance stays innermost so its `parsedCount` remains the report's
// "postings the parser turned into a structured job" total, and eligibility
// runs before validation so an out-of-scope posting never spends validator
// effort. Knows nothing about any platform: it only asks the shared rules in
// ../../eligibility/ about the job every adapter already produces.

import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import { checkJobEligibility, type EligibilityOptions } from "../../eligibility/jobEligibility";

export type EligibilityDecisionRecord =
  { kind: "allowed" } | { kind: "ineligible"; rule: "location" | "freshness"; reason: string };

/** Per-run record of what the eligibility gate decided, keyed by source URL. */
export class EligibilityCollector {
  private decisions = new Map<string, EligibilityDecisionRecord>();
  private locationRejections = 0;
  private freshnessRejections = 0;

  record(sourceUrl: string, decision: EligibilityDecisionRecord): void {
    this.decisions.set(sourceUrl, decision);
    if (decision.kind === "ineligible") {
      if (decision.rule === "location") this.locationRejections++;
      else this.freshnessRejections++;
    }
  }

  get(sourceUrl: string): EligibilityDecisionRecord | undefined {
    return this.decisions.get(sourceUrl);
  }

  /** Counts by rule, so the crawl report can say WHY a board yielded so little. */
  get counts(): { location: number; freshness: number } {
    return { location: this.locationRejections, freshness: this.freshnessRejections };
  }

  reset(): void {
    this.decisions.clear();
    this.locationRejections = 0;
    this.freshnessRejections = 0;
  }
}

export class EligibilityFilteringJobParser implements JobParser {
  constructor(
    private readonly inner: JobParser,
    private readonly collector: EligibilityCollector,
    private readonly options: EligibilityOptions = {},
  ) {}

  get platform(): string {
    return this.inner.platform;
  }

  get version(): string {
    return this.inner.version;
  }

  parse(raw: RawJobPayload): ParseOutcome {
    const parsed = this.inner.parse(raw);
    // A parse failure (or an earlier gate's rejection) never reaches this gate.
    if (!parsed.ok) return parsed;

    const decision = checkJobEligibility(parsed.job, this.options);
    if (decision.eligible) {
      this.collector.record(raw.sourceUrl, { kind: "allowed" });
      return parsed;
    }

    this.collector.record(raw.sourceUrl, {
      kind: "ineligible",
      rule: decision.kind,
      reason: decision.reason,
    });
    return {
      ok: false,
      reason:
        decision.kind === "location"
          ? `Not an India job — ${decision.reason}`
          : `Outside the freshness window — ${decision.reason}`,
    };
  }
}
