import { describe, expect, it } from "vitest";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { ParsedJobPosting } from "../../types";
import { ValidatingJobParser, ValidationCollector } from "./ValidatingJobParser";

function job(overrides: Partial<ParsedJobPosting> = {}): ParsedJobPosting {
  return {
    source: "test",
    sourceJobId: "1",
    sourceUrl: "https://example.test/jobs/1",
    companyName: "Acme",
    role: "Software Engineer",
    parserVersion: "test-1.0.0",
    ...overrides,
  };
}

/** A parser that always succeeds with whatever job it's given. */
class FakeParser implements JobParser {
  readonly platform = "test";
  readonly version = "test-1.0.0";
  parse(raw: RawJobPayload): ParseOutcome {
    return { ok: true, job: raw.json as ParsedJobPosting };
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

describe("ValidationCollector.parsedCount", () => {
  it("counts one record per parse, even when two postings share a sourceUrl", () => {
    // Module 10B.2.5: We Work Remotely's feed has been observed to repeat a
    // <link> across two distinct postings. `decisions` is a Map keyed by
    // sourceUrl for outcome-classification lookups, so two records with the
    // same key collapse to one entry there — but parsedCount must still
    // reflect that TWO postings were genuinely parsed.
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(new FakeParser(), collector);

    const sharedUrl = "https://example.test/jobs/shared";
    const first = job({ sourceJobId: "1", sourceUrl: sharedUrl, role: "Backend Engineer" });
    const second = job({ sourceJobId: "2", sourceUrl: sharedUrl, role: "Frontend Engineer" });

    const r1 = parser.parse(raw(first));
    const r2 = parser.parse(raw(second));

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(collector.parsedCount).toBe(2);
    // The classification map still only keeps the latest decision per URL —
    // a known, pre-existing limitation this fix does not attempt to solve.
    expect(collector.get(sharedUrl)?.kind).toBe("parsed");
  });

  it("counts each record once for distinct sourceUrls (no regression on the normal case)", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(new FakeParser(), collector);

    parser.parse(raw(job({ sourceJobId: "1", sourceUrl: "https://example.test/jobs/1" })));
    parser.parse(raw(job({ sourceJobId: "2", sourceUrl: "https://example.test/jobs/2" })));
    parser.parse(raw(job({ sourceJobId: "3", sourceUrl: "https://example.test/jobs/3" })));

    expect(collector.parsedCount).toBe(3);
  });

  it("counts a validator rejection as parsed too", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(new FakeParser(), collector);

    const outcome = parser.parse(raw(job({ role: "test" })));

    expect(outcome.ok).toBe(false);
    expect(collector.parsedCount).toBe(1);
    expect(collector.get("https://example.test/jobs/1")?.kind).toBe("skipped");
  });

  it("does not count a genuine parse failure — record() is never called", () => {
    class FailingParser implements JobParser {
      readonly platform = "test";
      readonly version = "test-1.0.0";
      parse(): ParseOutcome {
        return { ok: false, reason: "boom" };
      }
    }
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(new FailingParser(), collector);

    parser.parse(raw(job()));

    expect(collector.parsedCount).toBe(0);
  });

  it("reset() zeroes the counter along with the decisions map", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(new FakeParser(), collector);

    parser.parse(raw(job()));
    expect(collector.parsedCount).toBe(1);

    collector.reset();
    expect(collector.parsedCount).toBe(0);
    expect(collector.get("https://example.test/jobs/1")).toBeUndefined();
  });
});
