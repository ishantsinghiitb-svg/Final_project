import { describe, expect, it } from "vitest";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { ParsedJobPosting } from "../../types";
import { RelevanceCollector, RelevanceFilteringJobParser } from "./RelevanceFilteringJobParser";
import type { RegionRelevance } from "./regionRelevance";

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

describe("RelevanceFilteringJobParser", () => {
  it("allows a posting with no regionRelevance at all — the default for every non-WWR source", () => {
    const collector = new RelevanceCollector();
    const parser = new RelevanceFilteringJobParser(new FakeParser(), collector);

    const outcome = parser.parse(raw(job()));

    expect(outcome.ok).toBe(true);
    expect(collector.get("https://example.test/jobs/1")).toEqual({ kind: "allowed" });
  });

  it.each<RegionRelevance["classification"]>(["india", "worldwide", "unrestricted"])(
    "allows a %s posting",
    (classification) => {
      const collector = new RelevanceCollector();
      const parser = new RelevanceFilteringJobParser(new FakeParser(), collector);

      const outcome = parser.parse(
        raw(job({ regionRelevance: { classification, restrictedTo: null } })),
      );

      expect(outcome.ok).toBe(true);
    },
  );

  it("excludes a restricted_non_india posting and records why", () => {
    const collector = new RelevanceCollector();
    const parser = new RelevanceFilteringJobParser(new FakeParser(), collector);

    const outcome = parser.parse(
      raw(
        job({
          regionRelevance: { classification: "restricted_non_india", restrictedTo: "Canada" },
        }),
      ),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/Explicitly restricted to Canada/);
    expect(collector.get("https://example.test/jobs/1")).toMatchObject({
      kind: "excluded",
      reason: "Explicitly restricted to Canada.",
    });
  });

  it("a genuine parse failure never reaches the gate", () => {
    class FailingParser implements JobParser {
      readonly platform = "test";
      readonly version = "test-1.0.0";
      parse(): ParseOutcome {
        return { ok: false, reason: "boom" };
      }
    }
    const collector = new RelevanceCollector();
    const parser = new RelevanceFilteringJobParser(new FailingParser(), collector);

    const outcome = parser.parse(raw(job()));

    expect(outcome.ok).toBe(false);
    expect(collector.get("https://example.test/jobs/1")).toBeUndefined();
  });

  it("parsedCount reflects every record() call, matching ValidationCollector's duplicate-URL fix", () => {
    const collector = new RelevanceCollector();
    const parser = new RelevanceFilteringJobParser(new FakeParser(), collector);
    const sharedUrl = "https://example.test/jobs/shared";

    parser.parse(raw(job({ sourceJobId: "1", sourceUrl: sharedUrl, role: "Backend" })));
    parser.parse(raw(job({ sourceJobId: "2", sourceUrl: sharedUrl, role: "Frontend" })));

    expect(collector.parsedCount).toBe(2);
  });

  it("reset() clears both decisions and the counter", () => {
    const collector = new RelevanceCollector();
    const parser = new RelevanceFilteringJobParser(new FakeParser(), collector);
    parser.parse(raw(job()));

    collector.reset();

    expect(collector.parsedCount).toBe(0);
    expect(collector.get("https://example.test/jobs/1")).toBeUndefined();
  });
});
