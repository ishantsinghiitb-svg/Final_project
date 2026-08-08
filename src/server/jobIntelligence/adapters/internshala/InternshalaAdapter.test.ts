import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../../crawl/testing/fakeFetcher";
import { CrawlTargetError } from "../../crawl/errors";
import type { CrawlTarget } from "../types";
import {
  classifyWorkMode,
  extractListingCards,
  InternshalaCrawler,
  InternshalaParser,
  INTERNSHALA_SOURCE,
  listingPageUrl,
  parseInternshalaDate,
  readDetailItems,
  readInternshipId,
} from "./InternshalaAdapter";

const LISTING_URL = "https://internshala.com/internships/";
const DETAIL_URL =
  "https://internshala.com/internship/detail/accounts-internship-at-urja1785994053";
const TARGET: CrawlTarget = { kind: "company", companyCareerUrl: LISTING_URL };

// Markup mirrors the live Internshala pages captured while probing.
const LISTING_HTML = `
<div class="internship_list_container">
  <div class="container-fluid individual_internship logged_out_jd_summary visibilityTrackerItem"
       id="individual_internship_3232915" internshipId="3232915" employment_type="internship"
       data-href='/internship/detail/accounts-internship-at-urja1785994053'>
    <div class="internship_meta">
      <h2 class="job-internship-name">
        <a class="job-title-href" href="/internship/detail/accounts-internship-at-urja1785994053">Accounts</a>
      </h2>
      <p class="company-name">Urja Talents</p>
    </div>
  </div>
  <div class="container-fluid individual_internship" id="individual_internship_3232916" internshipId="3232916">
    <h2 class="job-internship-name">
      <a class="job-title-href" href="/internship/detail/design-internship-at-beta1785994099">Design</a>
    </h2>
  </div>
</div>`;

const DETAIL_HTML = `
<h1 class="heading_2_4 heading_title">Accounts - Internship</h1>
<div class="detail_view">
<div class="container-fluid individual_internship" id="individual_internship_3221512" internshipId="3221512">
  <div class="internship_meta">
    <div class="individual_internship_header generic_header">
      <div class="company">
        <div class="heading_6 company_name">
          <div class="company_and_premium">
            <a class="link_display_like_text" href="/company/urja-talents-1705568223">Urja Talents</a>
          </div>
        </div>
      </div>
      <div class="internship_logo">
        <img loading="lazy" src="https://internshala-uploads.internshala.com/logo/abc.png.webp" alt="Urja Talents">
      </div>
    </div>
    <div class="individual_internship_details individual_internship_internship">
      <div id="location_names"><i class="ic-16-map-pin"></i><span><a>Mumbai, Thane, Navi Mumbai</a></span></div>
      <div class="internship_other_details_container">
        <div class="other_detail_item_row">
          <div class="other_detail_item">
            <div class="item_heading"><span>Start Date</span></div>
            <div class="item_body">Immediately</div>
          </div>
          <div class="other_detail_item">
            <div class="item_heading"><span>Duration</span></div>
            <div class="item_body">6 Months</div>
          </div>
        </div>
        <div class="other_detail_item_row">
          <div class="other_detail_item stipend_container">
            <div class="item_heading"><span>Stipend</span></div>
            <div class="item_body"><span class="stipend">&#8377; 12,000 - 17,000 /month</span></div>
          </div>
          <div class="other_detail_item apply_by">
            <div class="item_heading"><span>APPLY BY</span></div>
            <div class="item_body">26 Sep' 26</div>
          </div>
        </div>
      </div>
    </div>
    <div class="posted_by_container">
      <div class="status status-small status-success">Posted 1 day ago</div>
    </div>
  </div>
</div>
<div class="internship_details">
  <h2 class="section_heading about_heading">About the internship</h2>
  <div class="text-container">
    Join us as an Accounts Intern.<br />Key responsibilities:<br />1. Maintain accounts in Excel<br />2. Reconciliation
  </div>
  <h3 class="section_heading skills_heading">Skill(s) required</h3>
  <div class="round_tabs_container">
    <span class="round_tabs">Accounting</span>
    <span class="round_tabs">MS-Excel</span>
    <span class="round_tabs">Accounting</span>
  </div>
</div>
<p class="section_heading">Who can apply</p>
<div class="text-container who_can_apply">
  <p>Only those candidates can apply who:</p>
  <p>1. are available for full time (in-office) internship</p>
  <p>2. are from Mumbai, Thane, Navi Mumbai only</p>
</div>
<h2 class="section_heading">About Urja Talents</h2>
<div class="text-container company_info">
  <div class="website_link"><a href="https://www.urjatalents.com">Website</a></div>
</div>`;

function html(body: string) {
  return { body, contentType: "text/html" };
}

function crawlFetcher(): FakeFetcher {
  return new FakeFetcher({
    [LISTING_URL]: html(LISTING_HTML),
    [DETAIL_URL]: html(DETAIL_HTML),
    "https://internshala.com/internship/detail/design-internship-at-beta1785994099":
      html(DETAIL_HTML),
  });
}

describe("readInternshipId", () => {
  it("reads the internshipid attribute", () => {
    expect(readInternshipId('<div internshipId="3232915">')).toBe("3232915");
  });

  it("falls back to the element id", () => {
    expect(readInternshipId('<div id="individual_internship_555">')).toBe("555");
  });

  it("returns null when there is no numeric id", () => {
    expect(readInternshipId('<div id="something_else">')).toBeNull();
    expect(readInternshipId('<div internshipId="abc">')).toBeNull();
  });
});

describe("extractListingCards", () => {
  it("finds every card with its detail URL", () => {
    const cards = extractListingCards(LISTING_HTML, LISTING_URL);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ internshipId: "3232915", detailUrl: DETAIL_URL });
  });

  it("falls back to the title anchor when data-href is absent", () => {
    expect(extractListingCards(LISTING_HTML, LISTING_URL)[1].detailUrl).toBe(
      "https://internshala.com/internship/detail/design-internship-at-beta1785994099",
    );
  });

  it("de-duplicates by posting id", () => {
    expect(extractListingCards(LISTING_HTML + LISTING_HTML, LISTING_URL)).toHaveLength(2);
  });

  it("returns nothing for a page with no cards", () => {
    expect(extractListingCards("<div>nothing</div>", LISTING_URL)).toEqual([]);
  });
});

describe("listingPageUrl", () => {
  it("uses PATH pagination — robots.txt disallows query strings", () => {
    expect(listingPageUrl(LISTING_URL, 2)).toBe("https://internshala.com/internships/page-2/");
    expect(listingPageUrl(LISTING_URL, 2)).not.toContain("?");
  });

  it("returns the base URL for page 1", () => {
    expect(listingPageUrl(LISTING_URL, 1)).toBe(LISTING_URL);
  });
});

describe("readDetailItems", () => {
  it("maps each detail row heading to its value", () => {
    const items = readDetailItems(DETAIL_HTML);
    expect(items["duration"]).toBe("6 Months");
    expect(items["stipend"]).toBe("₹ 12,000 - 17,000 /month");
    expect(items["apply by"]).toBe("26 Sep' 26");
    expect(items["start date"]).toBe("Immediately");
  });
});

describe("parseInternshalaDate", () => {
  it("parses the short deadline format", () => {
    expect(parseInternshalaDate("26 Sep' 26")).toBe("2026-09-26T00:00:00.000Z");
  });

  it("returns null for unparseable input", () => {
    expect(parseInternshalaDate("soon")).toBeNull();
    expect(parseInternshalaDate(null)).toBeNull();
  });
});

describe("classifyWorkMode", () => {
  it("detects work from home as Remote", () => {
    expect(classifyWorkMode("Work From Home", "")).toBe("Remote");
  });

  it("detects in-office phrasing as Onsite", () => {
    expect(classifyWorkMode("Mumbai", "available for full time (in-office) internship")).toBe(
      "Onsite",
    );
  });

  it("detects hybrid", () => {
    expect(classifyWorkMode("Mumbai (Hybrid)", "")).toBe("Hybrid");
  });

  it("defaults a plain city to Onsite and an empty location to null", () => {
    expect(classifyWorkMode("Pune", "")).toBe("Onsite");
    expect(classifyWorkMode(null, "")).toBeNull();
  });
});

describe("InternshalaCrawler", () => {
  it("walks the listing then fetches each detail page", async () => {
    const fetcher = crawlFetcher();
    const raws = await new InternshalaCrawler(fetcher, {
      maxPages: 1,
      maxDetailFetches: 10,
    }).fetchRawPostings(TARGET);

    expect(raws).toHaveLength(2);
    expect(raws[0].html).toContain("About the internship");
    expect(raws[0].json).toMatchObject({ internshipId: "3232915" });
  });

  it("caps the number of detail fetches", async () => {
    const fetcher = crawlFetcher();
    const raws = await new InternshalaCrawler(fetcher, {
      maxPages: 1,
      maxDetailFetches: 1,
    }).fetchRawPostings(TARGET);
    expect(raws).toHaveLength(1);
  });

  it("walks additional pages via path pagination", async () => {
    const fetcher = crawlFetcher();
    fetcher.on("https://internshala.com/internships/page-2/", html(LISTING_HTML));
    await new InternshalaCrawler(fetcher, { maxPages: 2, maxDetailFetches: 5 }).fetchRawPostings(
      TARGET,
    );
    expect(fetcher.requested).toContain("https://internshala.com/internships/page-2/");
  });

  it("refuses a listing URL carrying a query string", async () => {
    const crawler = new InternshalaCrawler(crawlFetcher());
    await expect(
      crawler.fetchRawPostings({ kind: "url", url: "https://internshala.com/internships/?page=2" }),
    ).rejects.toThrow(/query string/i);
  });

  it("throws a blocked error when the first listing page is blocked", async () => {
    const crawler = new InternshalaCrawler(new FakeFetcher({ [LISTING_URL]: BLOCKED }));
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toMatchObject({ blocked: true });
  });

  it("throws when the listing markup yields no cards", async () => {
    const crawler = new InternshalaCrawler(
      new FakeFetcher({ [LISTING_URL]: html("<div>none</div>") }),
    );
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toThrow(/no posting cards/);
  });

  it("skips one unreachable detail page without failing the target", async () => {
    const fetcher = new FakeFetcher({
      [LISTING_URL]: html(LISTING_HTML),
      [DETAIL_URL]: html(DETAIL_HTML),
      // the second detail URL is intentionally unscripted → 404
    });
    const raws = await new InternshalaCrawler(fetcher, {
      maxPages: 1,
      maxDetailFetches: 10,
    }).fetchRawPostings(TARGET);
    expect(raws).toHaveLength(1);
  });

  it("throws when every detail fetch fails", async () => {
    const fetcher = new FakeFetcher({ [LISTING_URL]: html(LISTING_HTML) });
    const crawler = new InternshalaCrawler(fetcher, { maxPages: 1, maxDetailFetches: 10 });
    await expect(crawler.fetchRawPostings(TARGET)).rejects.toThrow(
      /every detail page fetch failed/,
    );
  });
});

describe("InternshalaParser", () => {
  async function parseFirst() {
    const raws = await new InternshalaCrawler(crawlFetcher(), {
      maxPages: 1,
      maxDetailFetches: 1,
    }).fetchRawPostings(TARGET);
    return new InternshalaParser().parse(raws[0]);
  }

  it("maps the detail page", async () => {
    const outcome = await parseFirst();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const job = outcome.job;
    expect(job.source).toBe(INTERNSHALA_SOURCE);
    expect(job.role).toBe("Accounts - Internship");
    expect(job.companyName).toBe("Urja Talents");
    expect(job.location).toBe("Mumbai, Thane, Navi Mumbai");
    expect(job.city).toBe("Mumbai");
    expect(job.country).toBe("India");
    expect(job.employmentType).toBe("Internship");
    expect(job.experienceLevel).toBe("Intern");
    expect(job.postedAgo).toBe("Posted 1 day ago");
    expect(job.expiryDate).toBe("2026-09-26T00:00:00.000Z");
    // Resolved through the URL parser, which normalizes the empty path to "/".
    expect(job.companyUrl).toBe("https://www.urjatalents.com/");
    expect(job.companyLogoUrl).toBe(
      "https://internshala-uploads.internshala.com/logo/abc.png.webp",
    );
  });

  it("uses the listing card's internshipid as source_job_id — matching the extension parser", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    // NOT the trailing number in the URL slug (1785994053) — that is a
    // different id, and using it would break dedup against extension captures.
    expect(outcome.job.sourceJobId).toBe("3232915");
    expect(outcome.job.sourceJobId).not.toBe("1785994053");
  });

  it("parses the stipend into a salary range", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.salaryMin).toBe(12000);
    expect(outcome.job.salaryMax).toBe(17000);
    expect(outcome.job.salaryCurrency).toBe("INR");
    expect(outcome.job.salaryPeriod).toBe("Monthly");
  });

  it("extracts skills with no duplicates", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.skills).toEqual(["Accounting", "MS-Excel"]);
  });

  it("stores description as clean text with no markup", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.description).toContain("Join us as an Accounts Intern.");
    expect(outcome.job.description).toContain("Maintain accounts in Excel");
    expect(outcome.job.description).not.toMatch(/[<>]/);
  });

  it("turns 'Who can apply' into requirements, dropping the preamble", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.requirements).toEqual([
      "are available for full time (in-office) internship",
      "are from Mumbai, Thane, Navi Mumbai only",
    ]);
  });

  it("classifies in-office phrasing as Onsite", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.workMode).toBe("Onsite");
    expect(outcome.job.remote).toBe(false);
  });

  it("keeps duration and start date as tags", async () => {
    const outcome = await parseFirst();
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.tags).toEqual(["Duration: 6 Months", "Starts: Immediately"]);
  });

  it("rejects a payload with no HTML", () => {
    const outcome = new InternshalaParser().parse({
      platform: "internshala",
      sourceUrl: DETAIL_URL,
      fetchedAt: new Date().toISOString(),
      json: {},
    });
    expect(outcome.ok).toBe(false);
  });

  it("rejects a page with no title", () => {
    const outcome = new InternshalaParser().parse({
      platform: "internshala",
      sourceUrl: DETAIL_URL,
      fetchedAt: new Date().toISOString(),
      html: "<div>no title here</div>",
      json: {},
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/no title/i);
  });
});
