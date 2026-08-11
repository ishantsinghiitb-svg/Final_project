import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../../crawl/testing/fakeFetcher";
import { CrawlTargetError } from "../../crawl/errors";
import type { CrawlTarget } from "../types";
import {
  classifyWwrRegionRelevance,
  createWeWorkRemotelyAdapter,
  splitFeedTitle,
  splitSkillList,
  WeWorkRemotelyCrawler,
  WeWorkRemotelyParser,
  WWR_SOURCE,
} from "./WeWorkRemotelyAdapter";

const FEED_URL = "https://weworkremotely.com/remote-jobs.rss";
const TARGET: CrawlTarget = { kind: "company", companyCareerUrl: FEED_URL };

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss">
  <channel>
    <item>
      <media:content url="https://cdn.test/logo.gif" type="image/png"/>
      <title>SimpleTiger LLC: B2B SaaS PPC Manager</title>
      <region>Anywhere in the World</region>
      <country>🇺🇸 United States of America</country>
      <state>Florida</state>
      <skills>PPC, PPC Management, and PPC Campaigns</skills>
      <category>Sales and Marketing</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Lead paid media &amp;amp; strategy.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own budgets&lt;/li&gt;&lt;/ul&gt;</description>
      <pubDate>Fri, 07 Aug 2026 21:06:02 +0000</pubDate>
      <expires_at>Sun, 06 Sep 2026 21:06:02 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/simpletiger-llc-b2b-saas-ppc-manager</guid>
      <link>https://weworkremotely.com/remote-jobs/simpletiger-llc-b2b-saas-ppc-manager</link>
    </item>
  </channel>
</rss>`;

function feedFetcher(body = FEED): FakeFetcher {
  return new FakeFetcher({ [FEED_URL]: { body, contentType: "application/rss+xml" } });
}

describe("splitFeedTitle", () => {
  it("splits Company: Role", () => {
    expect(splitFeedTitle("Acme: Engineer")).toEqual({ company: "Acme", role: "Engineer" });
  });

  it("splits on the FIRST separator so a colon in the role survives", () => {
    expect(splitFeedTitle("Acme: Engineer: Platform")).toEqual({
      company: "Acme",
      role: "Engineer: Platform",
    });
  });

  it("returns no company when there is no separator", () => {
    expect(splitFeedTitle("Just a role")).toEqual({ company: null, role: "Just a role" });
  });

  it("does not split on a colon with no following space", () => {
    expect(splitFeedTitle("Acme:Engineer").company).toBeNull();
  });

  it("handles an empty title", () => {
    expect(splitFeedTitle("   ")).toEqual({ company: null, role: null });
  });
});

describe("splitSkillList", () => {
  it("splits an English list, dropping the trailing 'and'", () => {
    expect(splitSkillList("PPC, PPC Management, and PPC Campaigns")).toEqual([
      "PPC",
      "PPC Management",
      "PPC Campaigns",
    ]);
  });

  it("de-duplicates", () => {
    expect(splitSkillList("Go, Go, Rust")).toEqual(["Go", "Rust"]);
  });

  it("returns null for empty input", () => {
    expect(splitSkillList(null)).toBeNull();
    expect(splitSkillList("")).toBeNull();
  });
});

// ── Module 10B.3 Phase 1: India-first region relevance ──
//
// Values below are copied verbatim from a live pull of
// https://weworkremotely.com/remote-jobs.rss (2026-08), not invented: a
// single flag-emoji country for a country-specific posting, a comma-"and"
// joined list for a multi-country allowlist, and "Anywhere in the World" for
// an explicitly worldwide one.

describe("classifyWwrRegionRelevance", () => {
  it("A. classifies an India-restricted posting as india (allowed)", () => {
    expect(classifyWwrRegionRelevance("Remote", "India")).toEqual({
      classification: "india",
      restrictedTo: null,
    });
  });

  it("A. classifies India present within a multi-country allowlist as india (allowed)", () => {
    expect(
      classifyWwrRegionRelevance(
        "Remote",
        "India, United States of America, and United Kingdom of Great Britain and Northern Ireland",
      ),
    ).toEqual({ classification: "india", restrictedTo: null });
  });

  it("B. classifies an explicit 'Anywhere in the World' region as worldwide (allowed)", () => {
    expect(classifyWwrRegionRelevance("Anywhere in the World", null)).toEqual({
      classification: "worldwide",
      restrictedTo: null,
    });
  });

  it("B. worldwide wins even when a country is also present (real feed shape, see fixture below)", () => {
    expect(classifyWwrRegionRelevance("Anywhere in the World", "United States of America")).toEqual(
      { classification: "worldwide", restrictedTo: null },
    );
  });

  it("C. classifies no region and no country as unrestricted (allowed)", () => {
    expect(classifyWwrRegionRelevance(null, null)).toEqual({
      classification: "unrestricted",
      restrictedTo: null,
    });
  });

  it("C. classifies a plain 'Remote' region with no country restriction as unrestricted (allowed)", () => {
    expect(classifyWwrRegionRelevance("Remote", null)).toEqual({
      classification: "unrestricted",
      restrictedTo: null,
    });
  });

  it("D. classifies USA-only as restricted_non_india (excluded)", () => {
    expect(classifyWwrRegionRelevance("Texas", "United States of America")).toEqual({
      classification: "restricted_non_india",
      restrictedTo: "United States of America",
    });
  });

  it("E. classifies UK-only as restricted_non_india (excluded)", () => {
    expect(
      classifyWwrRegionRelevance("Remote", "United Kingdom of Great Britain and Northern Ireland"),
    ).toEqual({
      classification: "restricted_non_india",
      restrictedTo: "United Kingdom of Great Britain and Northern Ireland",
    });
  });

  it("F. classifies Canada-only as restricted_non_india (excluded)", () => {
    expect(classifyWwrRegionRelevance("Remote", "Canada")).toEqual({
      classification: "restricted_non_india",
      restrictedTo: "Canada",
    });
  });

  it("G. classifies another explicit non-India country/allowlist as restricted_non_india (excluded)", () => {
    // The exact live-feed multi-country allowlist format: comma + "and" before the last entry.
    expect(classifyWwrRegionRelevance("Remote", "Canada and United States of America")).toEqual({
      classification: "restricted_non_india",
      restrictedTo: "Canada and United States of America",
    });
  });
});

describe("WeWorkRemotelyCrawler", () => {
  it("emits one payload per feed item", async () => {
    const crawler = new WeWorkRemotelyCrawler(feedFetcher());
    const raws = await crawler.fetchRawPostings(TARGET);
    expect(raws).toHaveLength(1);
    expect(raws[0].sourceUrl).toBe(
      "https://weworkremotely.com/remote-jobs/simpletiger-llc-b2b-saas-ppc-manager",
    );
  });

  it("builds a category feed URL from a query target", async () => {
    const url = "https://weworkremotely.com/categories/remote-programming-jobs.rss";
    const fetcher = new FakeFetcher({ [url]: { body: FEED } });
    await new WeWorkRemotelyCrawler(fetcher).fetchRawPostings({
      kind: "query",
      query: "Remote Programming Jobs",
    });
    expect(fetcher.requested).toEqual([url]);
  });

  it("throws a blocked error when the feed is blocked", async () => {
    const crawler = new WeWorkRemotelyCrawler(new FakeFetcher({ [FEED_URL]: BLOCKED }));
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toThrow(CrawlTargetError);
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toMatchObject({ blocked: true });
  });

  it("throws when the response is not an RSS feed", async () => {
    const crawler = new WeWorkRemotelyCrawler(feedFetcher("<html>not a feed</html>"));
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toThrow(/no <item> entries/);
  });

  it("honours the item cap", async () => {
    const many = FEED.replace(
      "</channel>",
      `${"<item><title>A: B</title><link>https://x.test/a</link></item>".repeat(5)}</channel>`,
    );
    const raws = await new WeWorkRemotelyCrawler(feedFetcher(many), 3).fetchRawPostings(TARGET);
    expect(raws).toHaveLength(3);
  });
});

describe("WeWorkRemotelyParser", () => {
  async function parseFirst(body = FEED) {
    const raws = await new WeWorkRemotelyCrawler(feedFetcher(body)).fetchRawPostings(TARGET);
    return new WeWorkRemotelyParser().parse(raws[0]);
  }

  it("maps the whole item", async () => {
    const outcome = await parseFirst();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const job = outcome.job;
    expect(job.source).toBe(WWR_SOURCE);
    expect(job.companyName).toBe("SimpleTiger LLC");
    expect(job.role).toBe("B2B SaaS PPC Manager");
    expect(job.sourceJobId).toBe("simpletiger-llc-b2b-saas-ppc-manager");
    expect(job.employmentType).toBe("Full-Time");
    expect(job.jobFunction).toBe("Sales and Marketing");
    expect(job.skills).toEqual(["PPC", "PPC Management", "PPC Campaigns"]);
    expect(job.companyLogoUrl).toBe("https://cdn.test/logo.gif");
    expect(job.postedAt).toBe("2026-08-07T21:06:02.000Z");
    expect(job.expiryDate).toBe("2026-09-06T21:06:02.000Z");
  });

  it("asserts remote — every posting on this board is remote by definition", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.remote).toBe(true);
    expect(outcome.job.workMode).toBe("Remote");
  });

  it("strips the flag emoji from the country", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.country).toBe("United States of America");
  });

  it("never invents a city from a hiring restriction", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.city).toBeNull();
    expect(outcome.job.state).toBe("Florida");
  });

  it("decodes the double-escaped description to clean text", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.description).toBe("Lead paid media & strategy.\n\n- Own budgets");
    expect(outcome.job.description).not.toMatch(/[<>]|&lt;/);
  });

  it("warns when the region is worldwide", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.extractionWarnings?.join(" ")).toMatch(/worldwide/i);
  });

  // ── Module 10B.3 Phase 1: regionRelevance end-to-end, real raw feed XML ──

  it("attaches worldwide regionRelevance for the default fixture (Anywhere in the World + USA)", async () => {
    // The default FEED fixture already combines <region>Anywhere in the
    // World</region> with a single <country> — the real shape that makes
    // "region wins" the correct priority (see classifyWwrRegionRelevance).
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.regionRelevance).toEqual({
      classification: "worldwide",
      restrictedTo: null,
    });
  });

  it("D. end-to-end: a real USA-only <country> (no worldwide region) excludes via regionRelevance", async () => {
    const feed = FEED.replace("<region>Anywhere in the World</region>", "<region>Texas</region>");
    const outcome = await parseFirst(feed);
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.regionRelevance).toEqual({
      classification: "restricted_non_india",
      restrictedTo: "United States of America",
    });
  });

  it("A. end-to-end: a real India <country> flag-emoji entry parses to india regionRelevance", async () => {
    const feed = FEED.replace(
      "<region>Anywhere in the World</region>",
      "<region>Remote</region>",
    ).replace("<country>🇺🇸 United States of America</country>", "<country>🇮🇳 India</country>");
    const outcome = await parseFirst(feed);
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.regionRelevance).toEqual({ classification: "india", restrictedTo: null });
  });

  it("C. end-to-end: no <country> tag at all parses to unrestricted regionRelevance", async () => {
    const feed = FEED.replace(
      "<region>Anywhere in the World</region>",
      "<region>Remote</region>",
    ).replace("<country>🇺🇸 United States of America</country>", "<country></country>");
    const outcome = await parseFirst(feed);
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.regionRelevance).toEqual({
      classification: "unrestricted",
      restrictedTo: null,
    });
  });

  it("rejects an item whose title carries no company", async () => {
    const feed = FEED.replace(
      "<title>SimpleTiger LLC: B2B SaaS PPC Manager</title>",
      "<title>Standalone Role</title>",
    );
    const outcome = await parseFirst(feed);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/no company/i);
  });

  it("rejects a payload with no feed item", () => {
    const outcome = new WeWorkRemotelyParser().parse({
      platform: "weworkremotely",
      sourceUrl: "https://x.test",
      fetchedAt: new Date().toISOString(),
      json: {},
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("createWeWorkRemotelyAdapter", () => {
  it("bundles a crawler and parser under the platform tag", () => {
    const adapter = createWeWorkRemotelyAdapter(feedFetcher());
    expect(adapter.platform).toBe("weworkremotely");
    expect(adapter.crawler.platform).toBe("weworkremotely");
    expect(adapter.parser.platform).toBe("weworkremotely");
  });
});
