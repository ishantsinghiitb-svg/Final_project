import { describe, expect, it } from "vitest";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { ParsedJobPosting } from "../../types";
import { QualityCollector, QualityFilteringJobParser } from "./QualityFilteringJobParser";

function job(overrides: Partial<ParsedJobPosting> = {}): ParsedJobPosting {
  return {
    source: "greenhouse",
    sourceJobId: "1",
    sourceUrl: "https://example.test/jobs/1",
    companyName: "Acme",
    role: "Software Engineer",
    parserVersion: "test-1.0.0",
    ...overrides,
  };
}

class FakeParser implements JobParser {
  readonly platform = "test";
  readonly version = "test-1.0.0";
  parse(raw: RawJobPayload): ParseOutcome {
    return { ok: true, job: raw.json as ParsedJobPosting };
  }
}

class FailingParser implements JobParser {
  readonly platform = "test";
  readonly version = "test-1.0.0";
  parse(): ParseOutcome {
    return { ok: false, reason: "boom" };
  }
}

function raw(posting: ParsedJobPosting): RawJobPayload {
  return {
    platform: "test",
    sourceUrl: posting.sourceUrl!,
    fetchedAt: new Date().toISOString(),
    json: posting,
  };
}

describe("QualityFilteringJobParser", () => {
  it("allows a high-quality role and records why", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FakeParser(), collector);

    const outcome = parser.parse(raw(job({ role: "Product Manager" })));

    expect(outcome.ok).toBe(true);
    const record = collector.get("https://example.test/jobs/1");
    expect(record?.kind).toBe("allowed");
    expect(collector.lowQualityCount).toBe(0);
  });

  it("rejects a low-signal role and records the classifier's reason", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FakeParser(), collector);

    const outcome = parser.parse(raw(job({ role: "Telecaller", source: "internshala" })));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/Low-signal listing/);
    const record = collector.get("https://example.test/jobs/1");
    expect(record?.kind).toBe("low_quality");
    expect(collector.lowQualityCount).toBe(1);
  });

  it("applies the platform-specific threshold via the job's own source, not the raw payload's platform", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FakeParser(), collector);

    // A neutral title: retained on Greenhouse's permissive threshold, but
    // rejected on Internshala's strict one — driven by `job.source`.
    const greenhouseOutcome = parser.parse(
      raw(job({ role: "Office Coordinator", source: "greenhouse", sourceUrl: "https://x/1" })),
    );
    const internshalaOutcome = parser.parse(
      raw(job({ role: "Office Coordinator", source: "internshala", sourceUrl: "https://x/2" })),
    );

    expect(greenhouseOutcome.ok).toBe(true);
    expect(internshalaOutcome.ok).toBe(false);
  });

  it("a genuine parse failure never reaches the gate", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FailingParser(), collector);

    const outcome = parser.parse(raw(job()));

    expect(outcome.ok).toBe(false);
    expect(collector.get("https://example.test/jobs/1")).toBeUndefined();
  });

  it("platform/version are passed through from the inner parser", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FakeParser(), collector);

    expect(parser.platform).toBe("test");
    expect(parser.version).toBe("test-1.0.0");
  });

  it("reset() clears both decisions and the counter", () => {
    const collector = new QualityCollector();
    const parser = new QualityFilteringJobParser(new FakeParser(), collector);
    parser.parse(raw(job({ role: "Telecaller", source: "internshala" })));

    collector.reset();

    expect(collector.lowQualityCount).toBe(0);
    expect(collector.get("https://example.test/jobs/1")).toBeUndefined();
  });
});
