// ── Job quality gate: inserting the classifier into the crawl pipeline ──
//
// Same decorator shape as ../eligibility/EligibilityFilteringJobParser.ts and
// ../relevance/RelevanceFilteringJobParser.ts, for the same reason: Module
// 10A's `runPlatformCrawl` is frozen and its `ParseOutcome` is a strict
// ok/fail binary, so this third-again outcome ("low quality for this
// catalog") is expressed by a collector the orchestrator consults rather
// than by widening a frozen type.
//
// Composed OUTSIDE eligibility, INSIDE validation:
//
//   ValidatingJobParser( Quality( Eligibility( RelevanceFiltering( base ) ) ) )
//
// — quality runs on postings that already passed the India/freshness gate
// (no point scoring a job we're going to discard anyway for being stale or
// non-India), and runs BEFORE structural validation (no point validating the
// field completeness of a title we've already decided not to keep). Knows
// nothing about any platform's raw shape — it only asks the shared,
// deterministic classifier in ../../quality/jobQuality.ts about the
// `ParsedJobPosting` every adapter already produces.

import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import { classifyJobQuality, type QualityDecision } from "../../quality/jobQuality";

export type QualityDecisionRecord =
  | { kind: "allowed"; decision: QualityDecision }
  | { kind: "low_quality"; decision: QualityDecision };

/** Per-run record of what the quality gate decided, keyed by source URL. */
export class QualityCollector {
  private decisions = new Map<string, QualityDecisionRecord>();
  private rejectedCount = 0;

  record(sourceUrl: string, record: QualityDecisionRecord): void {
    this.decisions.set(sourceUrl, record);
    if (record.kind === "low_quality") this.rejectedCount++;
  }

  get(sourceUrl: string): QualityDecisionRecord | undefined {
    return this.decisions.get(sourceUrl);
  }

  get lowQualityCount(): number {
    return this.rejectedCount;
  }

  reset(): void {
    this.decisions.clear();
    this.rejectedCount = 0;
  }
}

export class QualityFilteringJobParser implements JobParser {
  constructor(
    private readonly inner: JobParser,
    private readonly collector: QualityCollector,
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

    const decision = classifyJobQuality({
      role: parsed.job.role,
      description: parsed.job.description,
      skills: parsed.job.skills,
      technologies: parsed.job.technologies,
      department: parsed.job.department,
      jobFunction: parsed.job.jobFunction,
      source: parsed.job.source,
    });

    if (decision.retain) {
      this.collector.record(raw.sourceUrl, { kind: "allowed", decision });
      return parsed;
    }

    this.collector.record(raw.sourceUrl, { kind: "low_quality", decision });
    return { ok: false, reason: `Low-signal listing — ${decision.reason}` };
  }
}
