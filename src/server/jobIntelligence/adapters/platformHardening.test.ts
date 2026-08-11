// ── Module 10B.2: production hardening for Ashby, Workable, WWR, Internshala ──
//
// Greenhouse/Lever/SmartRecruiters are covered by
// careerPages/ats/pagination.test.ts. This brings the same standard to the
// remaining four: completeness, malformed/empty handling, duplicate-page
// protection, and the identity/field correctness that decides whether a stored
// job is right rather than merely present.
//
// Every fixture is deterministic — no test here touches a live site.

import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../crawl/testing/fakeFetcher";
import { newObservations } from "../crawl/CrawlObservations";
import { ashbyProvider } from "./careerPages/ats/ashby";
import { workableProvider } from "./careerPages/ats/workable";
import { DEFAULT_ATS_LIMITS, type AtsBoard, type AtsPostingPayload } from "./careerPages/ats/types";
import {
  createWeWorkRemotelyAdapter,
  WeWorkRemotelyCrawler,
  WeWorkRemotelyParser,
} from "./weWorkRemotely/WeWorkRemotelyAdapter";
import { InternshalaCrawler, InternshalaParser } from "./internshala/InternshalaAdapter";
import type { CrawlTarget } from "./types";

function board(provider: AtsBoard["provider"], token: string): AtsBoard {
  return { provider, token, careersUrl: `https://example.test/${token}`, companyName: "Acme" };
}
function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}
function html(body: string) {
  return { body, contentType: "text/html" };
}
const recentIso = () => new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

// ══════════════════════════════ ASHBY ══════════════════════════════

const ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true";
const ashbyBoard = board("ashby", "acme");

describe("Ashby hardening", () => {
  const listed = {
    id: "uuid-1",
    title: "Security Engineer",
    employmentType: "FullTime",
    location: "Bengaluru, India",
    workplaceType: "Hybrid",
    isRemote: false,
    team: "Platform",
    department: "Engineering",
    publishedAt: recentIso(),
    jobUrl: "https://jobs.ashbyhq.com/acme/uuid-1",
    applyUrl: "https://jobs.ashbyhq.com/acme/uuid-1/application",
    descriptionPlain: "Keep things safe.",
  };

  async function crawl(
    payload: unknown,
    fetcher = new FakeFetcher({ [ASHBY_URL]: json(payload) }),
  ) {
    return ashbyProvider.crawl(ashbyBoard, fetcher, DEFAULT_ATS_LIMITS);
  }

  it("takes the whole board from one response and reports it complete", async () => {
    const jobs = Array.from({ length: 750 }, (_, i) => ({ ...listed, id: `id-${i}` }));
    const result = await crawl({ jobs });

    expect(result.raws).toHaveLength(750);
    expect(result.complete).toBe(true);
    expect(result.failure).toBeUndefined();
  });

  it("does not silently truncate a board bigger than the old cap", async () => {
    const jobs = Array.from({ length: 400 }, (_, i) => ({ ...listed, id: `id-${i}` }));
    const result = await crawl({ jobs });
    expect(result.raws.length).toBeGreaterThan(300);
  });

  it("marks the crawl INCOMPLETE when the cap trims the board", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ ...listed, id: `id-${i}` }));
    const result = await ashbyProvider.crawl(
      ashbyBoard,
      new FakeFetcher({ [ASHBY_URL]: json({ jobs }) }),
      {
        maxPostings: 4,
        maxDetailFetches: 4,
      },
    );

    expect(result.raws).toHaveLength(4);
    expect(result.complete).toBe(false);
  });

  it("excludes drafts and REPORTS how many it excluded", async () => {
    const result = await crawl({
      jobs: [listed, { ...listed, id: "draft", isListed: false }],
    });
    expect(result.raws).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("fails on a malformed payload rather than importing nothing quietly", async () => {
    expect((await crawl({ surprise: true })).failure).toBeDefined();
    const notJson = new FakeFetcher({ [ASHBY_URL]: html("<html>nope</html>") });
    expect((await crawl(null, notJson)).failure).toBeDefined();
  });

  it("reports an empty board without inventing a failure", async () => {
    const result = await crawl({ jobs: [] });
    expect(result.raws).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/0 postings/);
  });

  it("propagates a blocked board", async () => {
    const result = await crawl(null, new FakeFetcher({ [ASHBY_URL]: BLOCKED }));
    expect(result.failure?.blocked).toBe(true);
  });

  it("extracts identity, application URL and classification correctly", async () => {
    const result = await crawl({ jobs: [listed] });
    const outcome = ashbyProvider.parsePosting(
      result.raws[0].json as AtsPostingPayload,
      result.raws[0],
    );
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.job.source).toBe("ashby");
    expect(outcome.job.sourceJobId).toBe("uuid-1");
    expect(outcome.job.companyName).toBe("Acme");
    expect(outcome.job.role).toBe("Security Engineer");
    expect(outcome.job.city).toBe("Bengaluru");
    expect(outcome.job.country).toBe("India");
    expect(outcome.job.employmentType).toBe("Full-Time");
    expect(outcome.job.workMode).toBe("Hybrid");
    expect(outcome.job.remote).toBe(false);
    expect(outcome.job.postedAt).toBe(listed.publishedAt);
    // The APPLY url, not the listing url.
    expect(outcome.job.url).toBe("https://jobs.ashbyhq.com/acme/uuid-1/application");
  });

  it("leaves optional fields null rather than inventing them", async () => {
    const bare = { id: "x", title: "Engineer" };
    const result = await crawl({ jobs: [bare] });
    const outcome = ashbyProvider.parsePosting(
      result.raws[0].json as AtsPostingPayload,
      result.raws[0],
    );
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.job.salaryMin).toBeNull();
    expect(outcome.job.city).toBeNull();
    expect(outcome.job.employmentType).toBeNull();
    expect(outcome.job.postedAt).toBeNull();
  });
});

// ══════════════════════════════ WORKABLE ══════════════════════════════

const WORKABLE_URL = "https://apply.workable.com/api/v1/widget/accounts/acme?details=true";
const workableBoard = board("workable", "acme");

describe("Workable hardening", () => {
  const posting = {
    id: 55,
    shortcode: "ABC123",
    title: "Data Analyst",
    url: "https://apply.workable.com/acme/j/ABC123/",
    application_url: "https://apply.workable.com/acme/j/ABC123/apply/",
    published_on: recentIso().slice(0, 10),
    department: "Data",
    employment_type: "Full-time",
    telecommuting: true,
    city: "Lisbon",
    country: "Portugal",
    description: "<p>Analyse things.</p>",
  };

  async function crawl(
    payload: unknown,
    fetcher = new FakeFetcher({ [WORKABLE_URL]: json(payload) }),
  ) {
    return workableProvider.crawl(workableBoard, fetcher, DEFAULT_ATS_LIMITS);
  }

  it("takes the whole account in one response and reports it complete", async () => {
    const jobs = Array.from({ length: 120 }, (_, i) => ({ ...posting, shortcode: `S${i}` }));
    const result = await crawl({ name: "Acme", jobs });

    expect(result.raws).toHaveLength(120);
    expect(result.complete).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("marks the crawl INCOMPLETE when the cap trims it", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ ...posting, shortcode: `S${i}` }));
    const result = await workableProvider.crawl(
      workableBoard,
      new FakeFetcher({ [WORKABLE_URL]: json({ name: "Acme", jobs }) }),
      { maxPostings: 3, maxDetailFetches: 3 },
    );
    expect(result.raws).toHaveLength(3);
    expect(result.complete).toBe(false);
  });

  it("fails on a malformed payload", async () => {
    expect((await crawl({ name: "Acme" })).failure).toBeDefined();
    expect((await crawl("not an object")).failure).toBeDefined();
  });

  it("reports an empty account", async () => {
    const result = await crawl({ name: "Acme", jobs: [] });
    expect(result.raws).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/0 postings/);
  });

  it("retries/propagates a transient failure as a board failure", async () => {
    const result = await crawl(
      null,
      new FakeFetcher({
        [WORKABLE_URL]: { failure: { ok: false, kind: "http", status: 503, reason: "HTTP 503" } },
      }),
    );
    expect(result.failure?.reason).toMatch(/503/);
  });

  it("extracts identity, source id and application URL correctly", async () => {
    const result = await crawl({ name: "Acme Analytics", jobs: [posting] });
    const outcome = workableProvider.parsePosting(
      result.raws[0].json as AtsPostingPayload,
      result.raws[0],
    );
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.job.source).toBe("workable");
    // The shortcode is the stable id, not the numeric internal id.
    expect(outcome.job.sourceJobId).toBe("ABC123");
    expect(outcome.job.companyName).toBe("Acme Analytics");
    expect(outcome.job.role).toBe("Data Analyst");
    expect(outcome.job.city).toBe("Lisbon");
    expect(outcome.job.country).toBe("Portugal");
    expect(outcome.job.employmentType).toBe("Full-Time");
    expect(outcome.job.remote).toBe(true);
    expect(outcome.job.url).toBe("https://apply.workable.com/acme/j/ABC123/apply/");
    expect(outcome.job.postedAt).toBeTruthy();
  });
});

// ══════════════════════════════ WE WORK REMOTELY ══════════════════════════════

const WWR_URL = "https://weworkremotely.com/remote-jobs.rss";
const WWR_TARGET: CrawlTarget = { kind: "company", companyCareerUrl: WWR_URL };

function wwrItem(overrides: Partial<Record<string, string>> = {}) {
  const fields: Record<string, string> = {
    title: "Acme Corp: Senior Platform Engineer",
    type: "Full-Time",
    region: "Anywhere in the World",
    category: "Programming",
    description: "&lt;p&gt;Run the platform.&lt;/p&gt;",
    pubDate: new Date(Date.now() - 4 * 24 * 3600 * 1000).toUTCString(),
    link: "https://weworkremotely.com/remote-jobs/acme-senior-platform-engineer",
    ...overrides,
  };
  return `<item>${Object.entries(fields)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("")}</item>`;
}

function wwrFeed(items: string[]) {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

describe("We Work Remotely hardening", () => {
  it("reads every item in the feed and reports it complete", async () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      wwrItem({ link: `https://weworkremotely.com/remote-jobs/job-${i}` }),
    );
    const observations = newObservations();
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({ [WWR_URL]: { body: wwrFeed(items), contentType: "application/rss+xml" } }),
      300,
      observations,
    );

    const raws = await crawler.fetchRawPostings(WWR_TARGET);
    expect(raws).toHaveLength(100);
    expect(observations.complete).toBe(true);
  });

  it("marks the crawl INCOMPLETE when its own cap trims the feed", async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      wwrItem({ link: `https://weworkremotely.com/remote-jobs/job-${i}` }),
    );
    const observations = newObservations();
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({ [WWR_URL]: { body: wwrFeed(items), contentType: "application/rss+xml" } }),
      5,
      observations,
    );

    expect(await crawler.fetchRawPostings(WWR_TARGET)).toHaveLength(5);
    expect(observations.complete).toBe(false);
    expect(observations.warnings.join(" ")).toMatch(/jobs are being dropped/);
  });

  it("rejects a malformed / non-RSS response", async () => {
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({ [WWR_URL]: html("<html>not a feed</html>") }),
    );
    await expect(crawler.fetchRawPostings(WWR_TARGET)).rejects.toThrow(/no <item> entries/);
  });

  it("rejects an empty feed rather than reporting a silent zero", async () => {
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({ [WWR_URL]: { body: wwrFeed([]), contentType: "application/rss+xml" } }),
    );
    await expect(crawler.fetchRawPostings(WWR_TARGET)).rejects.toThrow(/no <item> entries/);
  });

  it("propagates a blocked feed", async () => {
    const crawler = new WeWorkRemotelyCrawler(new FakeFetcher({ [WWR_URL]: BLOCKED }));
    await expect(crawler.fetchRawPostings(WWR_TARGET)).rejects.toMatchObject({ blocked: true });
  });

  it("extracts identity, company, URL and classification correctly", async () => {
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({
        [WWR_URL]: { body: wwrFeed([wwrItem()]), contentType: "application/rss+xml" },
      }),
    );
    const raws = await crawler.fetchRawPostings(WWR_TARGET);
    const outcome = new WeWorkRemotelyParser().parse(raws[0]);
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.job.source).toBe("weworkremotely");
    expect(outcome.job.companyName).toBe("Acme Corp");
    expect(outcome.job.role).toBe("Senior Platform Engineer");
    expect(outcome.job.sourceJobId).toBe("acme-senior-platform-engineer");
    expect(outcome.job.url).toBe(
      "https://weworkremotely.com/remote-jobs/acme-senior-platform-engineer",
    );
    expect(outcome.job.employmentType).toBe("Full-Time");
    // Every posting on this board is remote by definition.
    expect(outcome.job.remote).toBe(true);
    expect(outcome.job.workMode).toBe("Remote");
    expect(outcome.job.postedAt).toBeTruthy();
  });

  it("de-duplicates nothing it should not: two DIFFERENT items stay two", async () => {
    const feed = wwrFeed([
      wwrItem({ link: "https://weworkremotely.com/remote-jobs/a" }),
      wwrItem({ link: "https://weworkremotely.com/remote-jobs/b" }),
    ]);
    const crawler = new WeWorkRemotelyCrawler(
      new FakeFetcher({ [WWR_URL]: { body: feed, contentType: "application/rss+xml" } }),
    );
    const raws = await crawler.fetchRawPostings(WWR_TARGET);
    expect(new Set(raws.map((raw) => raw.sourceUrl)).size).toBe(2);
  });

  it("builds an adapter wired to the observations sink", () => {
    const adapter = createWeWorkRemotelyAdapter(new FakeFetcher(), newObservations());
    expect(adapter.platform).toBe("weworkremotely");
  });
});

// ══════════════════════════════ INTERNSHALA ══════════════════════════════

const ISHA_LIST = "https://internshala.com/internships/";
const ishaPage = (page: number) =>
  page === 1 ? ISHA_LIST : `https://internshala.com/internships/page-${page}/`;
const ISHA_TARGET: CrawlTarget = { kind: "company", companyCareerUrl: ISHA_LIST };

function ishaCard(id: string) {
  return `<div class="individual_internship" internshipId="${id}"
      data-href='/internship/detail/role-at-co${id}'>
      <h2 class="job-internship-name"><a class="job-title-href" href="/internship/detail/role-at-co${id}">Role</a></h2>
    </div>`;
}
function ishaListing(ids: string[]) {
  return `<div class="internship_list_container">${ids.map(ishaCard).join("")}</div>`;
}
const ishaDetail = `
<h1 class="heading_2_4 heading_title">Business Development Internship</h1>
<div class="detail_view">
<div class="individual_internship" internshipId="777">
  <div class="heading_6 company_name"><a class="link_display_like_text" href="/company/acme-1">Acme Ventures</a></div>
  <div id="location_names"><span><a>Mumbai</a></span></div>
  <div class="internship_other_details_container">
    <div class="other_detail_item"><div class="item_heading"><span>Duration</span></div><div class="item_body">6 Months</div></div>
    <div class="other_detail_item stipend_container"><div class="item_heading"><span>Stipend</span></div>
      <div class="item_body"><span class="stipend">&#8377; 15,000 /month</span></div></div>
  </div>
  <div class="posted_by_container"><div class="status status-success">Posted 2 days ago</div></div>
</div>
</div>
<div class="internship_details">
  <h2 class="section_heading about_heading">About the internship</h2>
  <div class="text-container">Sell things.</div>
  <h3 class="section_heading skills_heading">Skill(s) required</h3>
  <div class="round_tabs_container"><span class="round_tabs">Sales</span></div>
</div>
<p class="section_heading">Who can apply</p>
<div class="text-container who_can_apply"><p>1. are available full time</p></div>`;

describe("Internshala hardening", () => {
  function fetcherFor(pages: Record<number, string[]>, detail = ishaDetail) {
    const routes: Record<string, { body: string; contentType: string }> = {};
    for (const [page, ids] of Object.entries(pages)) {
      routes[ishaPage(Number(page))] = html(ishaListing(ids));
    }
    for (const ids of Object.values(pages)) {
      for (const id of ids) {
        routes[`https://internshala.com/internship/detail/role-at-co${id}`] = html(detail);
      }
    }
    return new FakeFetcher(routes);
  }

  it("walks every listing page and de-duplicates ids across them", async () => {
    // Page 2 repeats one id from page 1 — it must be counted once.
    const fetcher = fetcherFor({ 1: ["1", "2"], 2: ["2", "3"] });
    const observations = newObservations();
    const raws = await new InternshalaCrawler(
      fetcher,
      { maxPages: 3, maxDetailFetches: 50 },
      observations,
    ).fetchRawPostings(ISHA_TARGET);

    expect(raws).toHaveLength(3);
  });

  it("stops cleanly at an empty page and reports the crawl complete", async () => {
    const fetcher = fetcherFor({ 1: ["1", "2"] });
    fetcher.on(ishaPage(2), html(ishaListing([])));
    const observations = newObservations();

    await new InternshalaCrawler(
      fetcher,
      { maxPages: 5, maxDetailFetches: 50 },
      observations,
    ).fetchRawPostings(ISHA_TARGET);

    expect(observations.complete).toBe(true);
  });

  it("marks the crawl INCOMPLETE when the page cap is reached with cards still coming", async () => {
    const fetcher = fetcherFor({ 1: ["1"], 2: ["2"] });
    const observations = newObservations();

    await new InternshalaCrawler(
      fetcher,
      { maxPages: 2, maxDetailFetches: 50 },
      observations,
    ).fetchRawPostings(ISHA_TARGET);

    expect(observations.complete).toBe(false);
    expect(observations.warnings.join(" ")).toMatch(/page cap/);
  });

  it("marks the crawl INCOMPLETE when a detail page cannot be fetched", async () => {
    const fetcher = fetcherFor({ 1: ["1", "2"] });
    // Remove one detail page so it 404s.
    const observations = newObservations();
    const partial = new FakeFetcher({
      [ISHA_LIST]: html(ishaListing(["1", "2"])),
      "https://internshala.com/internship/detail/role-at-co1": html(ishaDetail),
    });
    void fetcher;

    const raws = await new InternshalaCrawler(
      partial,
      { maxPages: 1, maxDetailFetches: 50 },
      observations,
    ).fetchRawPostings(ISHA_TARGET);

    expect(raws).toHaveLength(1);
    expect(observations.complete).toBe(false);
    expect(observations.warnings.join(" ")).toMatch(/detail page\(s\) could not be fetched/);
  });

  it("marks the crawl INCOMPLETE when the detail-fetch budget trims it", async () => {
    const fetcher = fetcherFor({ 1: ["1", "2", "3"] });
    const observations = newObservations();

    const raws = await new InternshalaCrawler(
      fetcher,
      { maxPages: 1, maxDetailFetches: 2 },
      observations,
    ).fetchRawPostings(ISHA_TARGET);

    expect(raws).toHaveLength(2);
    expect(observations.complete).toBe(false);
  });

  it("refuses a listing URL with a query string (robots.txt disallows it)", async () => {
    const crawler = new InternshalaCrawler(fetcherFor({ 1: ["1"] }));
    await expect(
      crawler.fetchRawPostings({ kind: "url", url: "https://internshala.com/internships/?page=2" }),
    ).rejects.toThrow(/query string/i);
  });

  it("fails on markup that yields no cards rather than reporting zero quietly", async () => {
    const crawler = new InternshalaCrawler(
      new FakeFetcher({ [ISHA_LIST]: html("<div>none</div>") }),
    );
    await expect(crawler.fetchRawPostings(ISHA_TARGET)).rejects.toThrow(/no posting cards/);
  });

  it("propagates a blocked listing", async () => {
    const crawler = new InternshalaCrawler(new FakeFetcher({ [ISHA_LIST]: BLOCKED }));
    await expect(crawler.fetchRawPostings(ISHA_TARGET)).rejects.toMatchObject({ blocked: true });
  });

  it("extracts identity, stipend-as-compensation and classification correctly", async () => {
    const fetcher = fetcherFor({ 1: ["1"] });
    const raws = await new InternshalaCrawler(fetcher, {
      maxPages: 1,
      maxDetailFetches: 5,
    }).fetchRawPostings(ISHA_TARGET);

    const outcome = new InternshalaParser().parse(raws[0]);
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.job.source).toBe("internshala");
    // The listing card's internshipid — NOT the number in the URL slug.
    expect(outcome.job.sourceJobId).toBe("1");
    expect(outcome.job.companyName).toBe("Acme Ventures");
    expect(outcome.job.role).toBe("Business Development Internship");
    expect(outcome.job.city).toBe("Mumbai");
    expect(outcome.job.country).toBe("India");
    // An internship stipend is compensation, structured like any other salary
    // — monthly, in INR — not conflated with an annual salary.
    expect(outcome.job.salaryMin).toBe(15000);
    expect(outcome.job.salaryCurrency).toBe("INR");
    expect(outcome.job.salaryPeriod).toBe("Monthly");
    expect(outcome.job.employmentType).toBe("Internship");
    expect(outcome.job.experienceLevel).toBe("Intern");
    expect(outcome.job.skills).toEqual(["Sales"]);
    expect(outcome.job.requirements).toEqual(["are available full time"]);
  });
});
