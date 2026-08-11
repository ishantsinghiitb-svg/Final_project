import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher, jsonFetcher } from "../../../crawl/testing/fakeFetcher";
import type { RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import { ashbyProvider } from "./ashby";
import { greenhouseProvider } from "./greenhouse";
import { leverProvider } from "./lever";
import { recruiteeProvider } from "./recruitee";
import { smartRecruitersProvider } from "./smartrecruiters";
import { workableProvider } from "./workable";
import {
  DEFAULT_ATS_LIMITS,
  type AtsBoard,
  type AtsPostingPayload,
  type AtsProvider,
} from "./types";

// Fixtures below mirror the field names and quirks of each provider's REAL
// payload (captured while probing the live endpoints), so a parser change that
// would break against production also breaks here.

function boardFor(provider: AtsBoard["provider"], token: string, careersUrl: string): AtsBoard {
  return { provider, token, careersUrl, companyName: "Acme" };
}

/** Runs crawl → parse and returns the parsed postings. */
async function crawlAndParse(
  provider: AtsProvider,
  board: AtsBoard,
  fetcher: FakeFetcher,
): Promise<{ jobs: ParsedJobPosting[]; warnings: string[]; failure?: string }> {
  const result = await provider.crawl(board, fetcher, DEFAULT_ATS_LIMITS);
  if (result.failure)
    return { jobs: [], warnings: result.warnings, failure: result.failure.reason };

  const jobs: ParsedJobPosting[] = [];
  for (const raw of result.raws) {
    const outcome = provider.parsePosting(raw.json as AtsPostingPayload, raw);
    if (outcome.ok) jobs.push(outcome.job);
  }
  return { jobs, warnings: result.warnings };
}

// ── Greenhouse ──

const GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true";
const GREENHOUSE_BOARD = boardFor("greenhouse", "stripe", "https://boards.greenhouse.io/stripe");

describe("greenhouseProvider", () => {
  const payload = {
    jobs: [
      {
        id: 8023928,
        title: "Account Executive, Bridge",
        absolute_url: "https://stripe.com/jobs/search?gh_jid=8023928",
        company_name: "Stripe",
        first_published: "2026-07-30T06:59:38-04:00",
        updated_at: "2026-08-06T12:10:12-04:00",
        location: { name: "London, United Kingdom" },
        departments: [{ name: "Sales" }],
        // Greenhouse double-encodes: HTML entities INSIDE a JSON string.
        content: "&lt;h2&gt;Who we are&lt;/h2&gt;&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;",
        metadata: [{ name: "Employment Type", value: "Full-time" }],
      },
    ],
  };

  it("parses a posting with fully decoded, markup-free description", async () => {
    const { jobs } = await crawlAndParse(
      greenhouseProvider,
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, payload),
    );
    expect(jobs).toHaveLength(1);
    const [job] = jobs;

    expect(job.source).toBe("greenhouse");
    expect(job.sourceJobId).toBe("8023928");
    expect(job.role).toBe("Account Executive, Bridge");
    expect(job.companyName).toBe("Stripe");
    expect(job.url).toBe("https://stripe.com/jobs/search?gh_jid=8023928");
    expect(job.city).toBe("London");
    expect(job.country).toBe("United Kingdom");
    expect(job.department).toBe("Sales");
    expect(job.employmentType).toBe("Full-Time");
    expect(job.postedAt).toBe("2026-07-30T10:59:38.000Z");
    expect(job.companyCareerUrl).toBe("https://boards.greenhouse.io/stripe");
  });

  it("decodes the escaped-HTML body rather than storing the tags as text", async () => {
    const { jobs } = await crawlAndParse(
      greenhouseProvider,
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, payload),
    );
    expect(jobs[0].description).toBe("Who we are\n\nBuild & ship");
    expect(jobs[0].description).not.toMatch(/&lt;|<h2>/);
  });

  it("prefers the board's own company name over the registry's", async () => {
    const { jobs } = await crawlAndParse(
      greenhouseProvider,
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, payload),
    );
    expect(jobs[0].companyName).toBe("Stripe");
  });

  it("reports a blocked board as a failure, not zero jobs", async () => {
    const fetcher = new FakeFetcher({ [GREENHOUSE_URL]: BLOCKED });
    const result = await greenhouseProvider.crawl(GREENHOUSE_BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.failure?.blocked).toBe(true);
    expect(result.raws).toHaveLength(0);
  });

  it("warns when a board is empty", async () => {
    const { warnings } = await crawlAndParse(
      greenhouseProvider,
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, { jobs: [] }),
    );
    expect(warnings.join(" ")).toMatch(/0 postings/);
  });

  it("fails cleanly on an unexpected payload shape", async () => {
    const result = await greenhouseProvider.crawl(
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, { unexpected: true }),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.failure?.reason).toMatch(/unexpected payload/i);
  });

  it("rejects a posting with no title", () => {
    const raw: RawJobPayload = {
      platform: "greenhouse",
      sourceUrl: "https://x.test",
      fetchedAt: new Date().toISOString(),
      json: { provider: "greenhouse", board: GREENHOUSE_BOARD, posting: { id: 1 } },
    };
    const outcome = greenhouseProvider.parsePosting(raw.json as AtsPostingPayload, raw);
    expect(outcome.ok).toBe(false);
  });

  it("caps at maxPostings and says so", async () => {
    const many = { jobs: Array.from({ length: 5 }, (_, i) => ({ id: i, title: `Role ${i}` })) };
    const result = await greenhouseProvider.crawl(
      GREENHOUSE_BOARD,
      jsonFetcher(GREENHOUSE_URL, many),
      {
        maxPostings: 2,
        maxDetailFetches: 2,
      },
    );
    expect(result.raws).toHaveLength(2);
    expect(result.warnings.join(" ")).toMatch(/capped at 2/);
  });
});

// ── Lever ──

// Lever now pages with skip/limit, so the first page carries them.
const LEVER_URL = "https://api.lever.co/v0/postings/spotify?mode=json&limit=100&skip=0";
const leverPage = (skip: number) =>
  `https://api.lever.co/v0/postings/spotify?mode=json&limit=100&skip=${skip}`;
const LEVER_BOARD = boardFor("lever", "spotify", "https://jobs.lever.co/spotify");

describe("leverProvider", () => {
  const payload = [
    {
      id: "abc-123",
      text: "Senior Backend Engineer",
      hostedUrl: "https://jobs.lever.co/spotify/abc-123",
      applyUrl: "https://jobs.lever.co/spotify/abc-123/apply",
      createdAt: 1786127138000,
      country: "se",
      workplaceType: "hybrid",
      description: "<div>We are hiring.</div>",
      additional: "<div>Equal opportunity employer.</div>",
      categories: {
        commitment: "Regular Full Time (Salary)",
        department: "Engineering",
        location: "Stockholm, Sweden",
        team: "Platform",
        allLocations: ["Stockholm, Sweden"],
      },
      salaryRange: { min: 700000, max: 900000, currency: "SEK", interval: "per-year-salary" },
      lists: [
        { text: "What you'll do", content: "<li>Ship services</li><li>Own uptime</li>" },
        { text: "Qualifications", content: "<li>5 years experience</li>" },
        { text: "Perks", content: "<li>Pension</li>" },
      ],
    },
  ];

  it("reassembles description + lists + additional into one body", async () => {
    const { jobs } = await crawlAndParse(
      leverProvider,
      LEVER_BOARD,
      jsonFetcher(LEVER_URL, payload),
    );
    const [job] = jobs;
    expect(job.description).toContain("We are hiring.");
    expect(job.description).toContain("Ship services");
    expect(job.description).toContain("5 years experience");
    expect(job.description).toContain("Equal opportunity employer.");
  });

  it("routes list sections into requirements / responsibilities / benefits", async () => {
    const { jobs } = await crawlAndParse(
      leverProvider,
      LEVER_BOARD,
      jsonFetcher(LEVER_URL, payload),
    );
    const [job] = jobs;
    expect(job.responsibilities).toEqual(["Ship services", "Own uptime"]);
    expect(job.requirements).toEqual(["5 years experience"]);
    expect(job.benefits).toEqual(["Pension"]);
  });

  it("maps commitment, workplace type, salary and identity", async () => {
    const { jobs } = await crawlAndParse(
      leverProvider,
      LEVER_BOARD,
      jsonFetcher(LEVER_URL, payload),
    );
    const [job] = jobs;
    expect(job.source).toBe("lever");
    expect(job.sourceJobId).toBe("abc-123");
    expect(job.employmentType).toBe("Full-Time");
    expect(job.workMode).toBe("Hybrid");
    expect(job.experienceLevel).toBe("Senior-Level");
    expect(job.salaryMin).toBe(700000);
    expect(job.salaryPeriod).toBe("Yearly");
    expect(job.salaryCurrency).toBe("SEK");
    expect(job.url).toBe("https://jobs.lever.co/spotify/abc-123/apply");
  });

  it("reads the bare top-level array with no envelope", async () => {
    const result = await leverProvider.crawl(
      LEVER_BOARD,
      jsonFetcher(LEVER_URL, payload),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws).toHaveLength(1);
  });

  it("fails when the response is an envelope rather than an array", async () => {
    const result = await leverProvider.crawl(
      LEVER_BOARD,
      jsonFetcher(LEVER_URL, { postings: [] }),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.failure).toBeDefined();
  });
});

// ── Ashby ──

const ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true";
const ASHBY_BOARD = boardFor("ashby", "openai", "https://jobs.ashbyhq.com/openai");

describe("ashbyProvider", () => {
  const payload = {
    jobs: [
      {
        id: "uuid-1",
        title: " Security Engineer, Cloud",
        department: "Engineering",
        team: "Backend",
        employmentType: "FullTime",
        location: "New York, NY (HQ)",
        secondaryLocations: [{ location: "Remote (US)" }, { location: "Miami, FL" }],
        publishedAt: "2026-04-07T17:12:35.753+00:00",
        isListed: true,
        isRemote: true,
        workplaceType: "Hybrid",
        address: {
          postalAddress: {
            addressRegion: "NY",
            addressCountry: "USA",
            addressLocality: "New York City",
          },
        },
        jobUrl: "https://jobs.ashbyhq.com/openai/uuid-1",
        applyUrl: "https://jobs.ashbyhq.com/openai/uuid-1/application",
        descriptionPlain: "Keep the cloud safe.",
        descriptionHtml: "<p>Keep the cloud safe.</p>",
        compensation: {
          compensationTierSummary: "$200K – $300K",
          summaryComponents: [
            { compensationType: "EquityPercentage", minValue: 0.1, maxValue: 0.2 },
            {
              compensationType: "Salary",
              interval: "1 YEAR",
              currencyCode: "USD",
              minValue: 200000,
              maxValue: 300000,
            },
          ],
        },
      },
      { id: "uuid-2", title: "Draft role", isListed: false },
    ],
  };

  it("never imports an unlisted (draft) posting", async () => {
    const { jobs } = await crawlAndParse(
      ashbyProvider,
      ASHBY_BOARD,
      jsonFetcher(ASHBY_URL, payload),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].role).toBe("Security Engineer, Cloud");
  });

  it("picks the Salary component and ignores equity", async () => {
    const { jobs } = await crawlAndParse(
      ashbyProvider,
      ASHBY_BOARD,
      jsonFetcher(ASHBY_URL, payload),
    );
    const [job] = jobs;
    expect(job.salaryMin).toBe(200000);
    expect(job.salaryMax).toBe(300000);
    expect(job.salaryCurrency).toBe("USD");
    expect(job.salaryPeriod).toBe("Yearly");
    expect(job.salaryText).toBe("$200K – $300K");
  });

  it("prefers the structured postal address over the free-text location", async () => {
    const { jobs } = await crawlAndParse(
      ashbyProvider,
      ASHBY_BOARD,
      jsonFetcher(ASHBY_URL, payload),
    );
    const [job] = jobs;
    expect(job.city).toBe("New York City");
    expect(job.state).toBe("NY");
    expect(job.country).toBe("USA");
    expect(job.location).toBe("New York, NY (HQ)");
  });

  it("keeps secondary locations as tags", async () => {
    const { jobs } = await crawlAndParse(
      ashbyProvider,
      ASHBY_BOARD,
      jsonFetcher(ASHBY_URL, payload),
    );
    expect(jobs[0].tags).toEqual(["Remote (US)", "Miami, FL"]);
  });

  it("maps employmentType and workplaceType", async () => {
    const { jobs } = await crawlAndParse(
      ashbyProvider,
      ASHBY_BOARD,
      jsonFetcher(ASHBY_URL, payload),
    );
    expect(jobs[0].employmentType).toBe("Full-Time");
    expect(jobs[0].workMode).toBe("Hybrid");
    expect(jobs[0].remote).toBe(true);
  });
});

// ── SmartRecruiters ──

const SR_BOARD = boardFor("smartrecruiters", "Visa", "https://careers.smartrecruiters.com/Visa");
function srUrl(offset: number): string {
  return `https://api.smartrecruiters.com/v1/companies/Visa/postings?limit=100&offset=${offset}`;
}

describe("smartRecruitersProvider", () => {
  function posting(id: number) {
    return {
      id: String(id),
      name: `Engineer ${id}`,
      company: { name: "Visa" },
      releasedDate: "2026-06-24T10:00:11.853Z",
      location: {
        city: "Austin",
        region: "TX",
        country: "us",
        remote: false,
        hybrid: true,
        fullLocation: "Austin, TX, United States",
      },
      industry: { label: "IT" },
      department: { label: "Engineering" },
      function: { label: "Engineering" },
      typeOfEmployment: { label: "Full-time" },
      experienceLevel: { id: "mid_senior_level", label: "Mid-Senior Level" },
    };
  }

  it("maps structured fields and uppercases the ISO country code", async () => {
    const { jobs } = await crawlAndParse(
      smartRecruitersProvider,
      SR_BOARD,
      jsonFetcher(srUrl(0), { content: [posting(1)] }),
    );
    const [job] = jobs;
    expect(job.source).toBe("smartrecruiters");
    expect(job.sourceJobId).toBe("1");
    expect(job.country).toBe("US");
    expect(job.workMode).toBe("Hybrid");
    expect(job.experienceLevel).toBe("Mid-Level");
    expect(job.industry).toBe("IT");
  });

  it("records the missing-description limitation as an extraction warning", async () => {
    const { jobs } = await crawlAndParse(
      smartRecruitersProvider,
      SR_BOARD,
      jsonFetcher(srUrl(0), { content: [posting(1)] }),
    );
    expect(jobs[0].description).toBeNull();
    expect(jobs[0].extractionWarnings?.join(" ")).toMatch(/no job description/i);
  });

  it("paginates until a short page", async () => {
    const fullPage = { content: Array.from({ length: 100 }, (_, i) => posting(i)) };
    const lastPage = { content: [posting(999)] };
    const fetcher = new FakeFetcher({
      [srUrl(0)]: { body: JSON.stringify(fullPage) },
      [srUrl(100)]: { body: JSON.stringify(lastPage) },
    });

    const result = await smartRecruitersProvider.crawl(SR_BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(101);
    expect(fetcher.requested).toEqual([srUrl(0), srUrl(100)]);
  });

  it("fails the board when page 1 is blocked", async () => {
    const result = await smartRecruitersProvider.crawl(
      SR_BOARD,
      new FakeFetcher({ [srUrl(0)]: BLOCKED }),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.failure?.blocked).toBe(true);
  });

  it("degrades a mid-pagination failure to a warning and keeps what it got", async () => {
    const fullPage = { content: Array.from({ length: 100 }, (_, i) => posting(i)) };
    const fetcher = new FakeFetcher({
      [srUrl(0)]: { body: JSON.stringify(fullPage) },
      [srUrl(100)]: BLOCKED,
    });

    const result = await smartRecruitersProvider.crawl(SR_BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.failure).toBeUndefined();
    expect(result.raws).toHaveLength(100);
    expect(result.warnings.join(" ")).toMatch(/Pagination stopped at offset 100/);
  });

  it("builds a public posting URL, not the API self-link", async () => {
    const result = await smartRecruitersProvider.crawl(
      SR_BOARD,
      jsonFetcher(srUrl(0), { content: [posting(42)] }),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws[0].sourceUrl).toBe("https://jobs.smartrecruiters.com/Visa/42");
  });
});

// ── Workable ──

const WORKABLE_URL = "https://apply.workable.com/api/v1/widget/accounts/acme?details=true";
const WORKABLE_BOARD = boardFor("workable", "acme", "https://apply.workable.com/acme/");

describe("workableProvider", () => {
  const payload = {
    name: "Acme Analytics",
    jobs: [
      {
        id: 55,
        shortcode: "ABC123",
        title: "Data Analyst",
        url: "https://apply.workable.com/acme/j/ABC123/",
        application_url: "https://apply.workable.com/acme/j/ABC123/apply/",
        published_on: "2026-07-01",
        department: "Data",
        employment_type: "Full-time",
        telecommuting: true,
        city: "Lisbon",
        country: "Portugal",
        description: "<p>Analyse things.</p>",
        requirements: "<ul><li>SQL</li><li>Python</li></ul>",
        benefits: "<ul><li>Health</li></ul>",
      },
    ],
  };

  it("prefers the account's own name over the registry's", async () => {
    const { jobs } = await crawlAndParse(
      workableProvider,
      WORKABLE_BOARD,
      jsonFetcher(WORKABLE_URL, payload),
    );
    expect(jobs[0].companyName).toBe("Acme Analytics");
  });

  it("uses the shortcode as the stable source id", async () => {
    const { jobs } = await crawlAndParse(
      workableProvider,
      WORKABLE_BOARD,
      jsonFetcher(WORKABLE_URL, payload),
    );
    expect(jobs[0].sourceJobId).toBe("ABC123");
  });

  it("merges description, requirements and benefits into one body", async () => {
    const { jobs } = await crawlAndParse(
      workableProvider,
      WORKABLE_BOARD,
      jsonFetcher(WORKABLE_URL, payload),
    );
    const [job] = jobs;
    expect(job.description).toContain("Analyse things.");
    expect(job.description).toContain("SQL");
    expect(job.requirements).toEqual(["SQL", "Python"]);
    expect(job.benefits).toEqual(["Health"]);
    expect(job.remote).toBe(true);
  });
});

// ── Recruitee ──

const RECRUITEE_URL = "https://acme.recruitee.com/api/offers/";
const RECRUITEE_BOARD = boardFor("recruitee", "acme", "https://acme.recruitee.com/");

describe("recruiteeProvider", () => {
  const payload = {
    offers: [
      {
        id: 9,
        slug: "backend-dev",
        title: "Backend Developer",
        status: "published",
        careers_url: "https://acme.recruitee.com/o/backend-dev",
        published_at: "2026-05-05T00:00:00Z",
        department: "Engineering",
        employment_type_code: "fulltime",
        city: "Amsterdam",
        country: "Netherlands",
        remote: false,
        description: "<p>Build APIs.</p>",
        requirements: "<ul><li>Go</li></ul>",
        tags: ["backend", "api"],
      },
      { id: 10, title: "Closed role", status: "closed" },
    ],
  };

  it("imports only published offers", async () => {
    const { jobs } = await crawlAndParse(
      recruiteeProvider,
      RECRUITEE_BOARD,
      jsonFetcher(RECRUITEE_URL, payload),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].role).toBe("Backend Developer");
  });

  it("maps fields and keeps tags", async () => {
    const { jobs } = await crawlAndParse(
      recruiteeProvider,
      RECRUITEE_BOARD,
      jsonFetcher(RECRUITEE_URL, payload),
    );
    const [job] = jobs;
    expect(job.source).toBe("recruitee");
    expect(job.sourceJobId).toBe("9");
    expect(job.employmentType).toBe("Full-Time");
    expect(job.city).toBe("Amsterdam");
    expect(job.requirements).toEqual(["Go"]);
    expect(job.tags).toEqual(["backend", "api"]);
  });
});
