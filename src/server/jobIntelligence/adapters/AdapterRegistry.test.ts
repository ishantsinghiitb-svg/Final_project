import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "./AdapterRegistry";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "./types";
import type { JobParser, ParseOutcome, RawJobPayload } from "../parsers/types";

// A minimal fake adapter proving the interfaces are implementable end to
// end — NOT a real platform crawler (Module 10A ships zero of those; see
// AdapterRegistry's own comment).
function fakeAdapter(platform: string): PlatformAdapter {
  const crawler: PlatformCrawler = {
    platform,
    async fetchRawPostings(target: CrawlTarget): Promise<RawJobPayload[]> {
      return [
        {
          platform,
          sourceUrl: target.kind === "url" ? target.url : "https://example.test/1",
          fetchedAt: new Date().toISOString(),
        },
      ];
    },
  };
  const parser: JobParser = {
    platform,
    version: "fake-1",
    parse(raw: RawJobPayload): ParseOutcome {
      return {
        ok: true,
        job: {
          source: platform,
          companyName: "Acme",
          role: "Engineer",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      };
    },
  };
  return { platform, crawler, parser };
}

describe("AdapterRegistry", () => {
  it("registers and retrieves an adapter case-insensitively", () => {
    const registry = new AdapterRegistry();
    registry.register(fakeAdapter("LinkedIn"));
    expect(registry.get("linkedin")?.platform).toBe("LinkedIn");
    expect(registry.get("LINKEDIN")?.platform).toBe("LinkedIn");
  });

  it("returns undefined for an unregistered platform", () => {
    const registry = new AdapterRegistry();
    expect(registry.get("greenhouse")).toBeUndefined();
  });

  it("rejects registering the same platform twice", () => {
    const registry = new AdapterRegistry();
    registry.register(fakeAdapter("indeed"));
    expect(() => registry.register(fakeAdapter("Indeed"))).toThrow();
  });

  it("list() reflects every registered platform", () => {
    const registry = new AdapterRegistry();
    registry.register(fakeAdapter("indeed"));
    registry.register(fakeAdapter("naukri"));
    expect(registry.list().sort()).toEqual(["indeed", "naukri"]);
  });

  it("a fake adapter's crawler + parser satisfy the pipeline contract end to end", async () => {
    const adapter = fakeAdapter("test-platform");
    const raws = await adapter.crawler.fetchRawPostings({ kind: "query", query: "engineer" });
    expect(raws).toHaveLength(1);

    const outcome = adapter.parser.parse(raws[0]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.job.companyName).toBe("Acme");
      expect(outcome.job.source).toBe("test-platform");
    }
  });
});
