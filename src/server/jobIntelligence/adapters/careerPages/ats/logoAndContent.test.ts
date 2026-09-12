import { beforeEach, describe, expect, it } from "vitest";
import { FakeFetcher } from "../../../crawl/testing/fakeFetcher";
import type { ParsedJobPosting } from "../../../types";
import { CareerPagesCrawler, CareerPagesParser } from "../CareerPagesAdapter";
import { clearBoardLogoCache } from "./boardLogo";
import type { AtsPostingPayload } from "./types";
import { isGenericPlatformImage, pickCompanyLogo } from "../../../logo/companyLogo";

// ── Fixtures ──
//
// Every URL, field name and logo path below was captured from the LIVE
// endpoints on 2026-09-12 (see boardLogo.ts's header for the evidence table),
// so a provider or platform change that would break in production breaks here.
//
// The postings are all India-located and recently posted, because the pipeline
// now refuses anything else — a fixture that is not eligible would test nothing
// past the gate.

const RECENT = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const RECENT_DATE_ONLY = RECENT.slice(0, 10);

/** Runs the real career-pages crawler + parser over a scripted fetcher. */
async function crawlBoard(
  careersUrl: string,
  companyName: string,
  fetcher: FakeFetcher,
): Promise<ParsedJobPosting[]> {
  const crawler = new CareerPagesCrawler(fetcher).withContext({ companyName, config: {} });
  const raws = await crawler.fetchRawPostings({ kind: "company", companyCareerUrl: careersUrl });
  const parser = new CareerPagesParser();

  const jobs: ParsedJobPosting[] = [];
  for (const raw of raws) {
    const outcome = parser.parse(raw);
    if (outcome.ok) jobs.push(outcome.job);
    void (raw.json as AtsPostingPayload);
  }
  return jobs;
}

beforeEach(() => {
  // Board identity is cached process-wide; each test scripts its own board.
  clearBoardLogoCache();
});

// ── Greenhouse ──

describe("Greenhouse", () => {
  const API = "https://boards-api.greenhouse.io/v1/boards/groww/jobs?content=true";
  const BOARD_PAGE = "https://job-boards.greenhouse.io/groww";
  const LOGO =
    "https://s101-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/251/810/original/160X40.png?1727437393";

  function fetcher(): FakeFetcher {
    return new FakeFetcher({
      [API]: {
        body: JSON.stringify({
          jobs: [
            {
              id: 4528370101,
              title: "Manager - Investments",
              absolute_url: "https://job-boards.eu.greenhouse.io/groww/jobs/4528370101",
              company_name: "Groww",
              first_published: RECENT,
              location: { name: "Bengaluru-VTP, India" },
              departments: [{ name: "Investments" }],
              // Greenhouse delivers its body HTML-ESCAPED inside JSON, and uses
              // `<p><strong>` as section headings rather than real heading tags.
              content:
                "&lt;p&gt;&lt;strong&gt;About Groww&lt;/strong&gt;&lt;/p&gt;" +
                "&lt;p&gt;We make investing simple.&lt;/p&gt;" +
                "&lt;p&gt;&lt;strong&gt;Role &amp;amp; responsibilities&lt;/strong&gt;&lt;/p&gt;" +
                "&lt;ul&gt;&lt;li&gt;Own the investment thesis&lt;/li&gt;&lt;li&gt;Publish research&lt;/li&gt;&lt;/ul&gt;" +
                "&lt;p&gt;&lt;strong&gt;Preferred candidate profile&lt;/strong&gt;&lt;/p&gt;" +
                "&lt;ul&gt;&lt;li&gt;CFA charterholder&lt;/li&gt;&lt;/ul&gt;",
            },
          ],
          meta: { total: 1 },
        }),
      },
      [BOARD_PAGE]: {
        body: `<html><head><meta property="og:image" content="${LOGO}"></head>
               <body><img src="${LOGO}" alt="Groww Logo" class="logo"/></body></html>`,
      },
    });
  }

  it("1. extracts the company logo from the board page", async () => {
    const [job] = await crawlBoard("https://boards.greenhouse.io/groww", "Groww", fetcher());
    expect(job.companyLogoUrl).toBe(LOGO);
  });

  it("14. extracts the full description as structured HTML", async () => {
    const [job] = await crawlBoard("https://boards.greenhouse.io/groww", "Groww", fetcher());
    expect(job.descriptionHtml).toContain("<p><strong>About Groww</strong></p>");
    expect(job.descriptionHtml).toContain("<ul>");
    expect(job.descriptionHtml).toContain("<li>Own the investment thesis</li>");
    // Not flattened into one paragraph.
    expect((job.descriptionHtml?.match(/<p>/g) ?? []).length).toBeGreaterThan(1);
  });

  it("15. preserves responsibilities and preferred qualifications as structured fields", async () => {
    const [job] = await crawlBoard("https://boards.greenhouse.io/groww", "Groww", fetcher());
    expect(job.responsibilities).toEqual(["Own the investment thesis", "Publish research"]);
    expect(job.preferredQualifications).toEqual(["CFA charterholder"]);
  });

  it("derives plain text from the same HTML", async () => {
    const [job] = await crawlBoard("https://boards.greenhouse.io/groww", "Groww", fetcher());
    expect(job.description).toContain("We make investing simple.");
    expect(job.description).toContain("- Own the investment thesis");
    expect(job.description).not.toContain("<p>");
  });
});

// ── Lever ──

describe("Lever", () => {
  const API = "https://api.lever.co/v0/postings/zeta?mode=json&limit=100&skip=0";
  const BOARD_PAGE = "https://jobs.lever.co/zeta";
  const LOGO =
    "https://lever-client-logos.s3.amazonaws.com/1ae7615f-b504-43a9-8f3f-6311590fb6fa-1463999313297.png";

  function fetcher(): FakeFetcher {
    return new FakeFetcher({
      [API]: {
        body: JSON.stringify([
          {
            id: "db110756-b496-49a2-bde5-49ab46e963b8",
            text: "Senior Backend Engineer",
            hostedUrl: "https://jobs.lever.co/zeta/db110756",
            applyUrl: "https://jobs.lever.co/zeta/db110756/apply",
            createdAt: Date.parse(RECENT),
            country: "IN",
            workplaceType: "onsite",
            categories: { location: "Mumbai", commitment: "Full Time", team: "Core Banking" },
            description: "<div>Zeta builds modern banking infrastructure.</div>",
            lists: [
              {
                text: "What you will do",
                content: "<li>Design payment APIs</li><li>Own service reliability</li>",
              },
              { text: "Requirements", content: "<li>5+ years backend experience</li>" },
            ],
            additional: "<div>Zeta is an equal opportunity employer.</div>",
          },
        ]),
      },
      [BOARD_PAGE]: {
        body: `<html><head><meta property="og:image" content="${LOGO}"></head>
               <body><img class="footer-logo" alt="Lever logo" src="https://jobs.lever.co/img/lever-logo-refresh.svg"></body></html>`,
      },
    });
  }

  it("2. extracts the company logo and ignores Lever's own house logo", async () => {
    const [job] = await crawlBoard("https://jobs.lever.co/zeta", "Zeta", fetcher());
    expect(job.companyLogoUrl).toBe(LOGO);
    expect(job.companyLogoUrl).not.toMatch(/lever-logo-refresh/);
  });

  it("14. reassembles the body as structured HTML instead of flattening it", async () => {
    const [job] = await crawlBoard("https://jobs.lever.co/zeta", "Zeta", fetcher());
    // The opening blurb was a <div> — it must survive as a paragraph, not vanish.
    expect(job.descriptionHtml).toContain("<p>Zeta builds modern banking infrastructure.</p>");
    expect(job.descriptionHtml).toContain("<h3>What you will do</h3>");
    expect(job.descriptionHtml).toContain("<li>Design payment APIs</li>");
    expect(job.descriptionHtml).toContain("<p>Zeta is an equal opportunity employer.</p>");
  });

  it("15. splits list sections into responsibilities and requirements", async () => {
    const [job] = await crawlBoard("https://jobs.lever.co/zeta", "Zeta", fetcher());
    expect(job.responsibilities).toEqual(["Design payment APIs", "Own service reliability"]);
    expect(job.requirements).toEqual(["5+ years backend experience"]);
  });
});

// ── SmartRecruiters ──

describe("SmartRecruiters", () => {
  const LIST = "https://api.smartrecruiters.com/v1/companies/Swiggy/postings?limit=100&offset=0";
  const DETAIL = "https://api.smartrecruiters.com/v1/companies/Swiggy/postings/6000000001400034";
  const POSTING_PAGE = "https://jobs.smartrecruiters.com/Swiggy/6000000001400034";
  const LOGO =
    "https://c.smartrecruiters.com/sr-company-logo-prod-aws-dc9/6a33c3aa4e44db89564ce22d/huge";

  function fetcher(): FakeFetcher {
    return new FakeFetcher({
      [LIST]: {
        body: JSON.stringify({
          totalFound: 1,
          content: [
            {
              id: "6000000001400034",
              name: "Sales Manager I",
              releasedDate: RECENT,
              company: { identifier: "SWIGGY", name: "SWIGGY" },
              location: {
                city: "Bengaluru",
                region: "KA",
                country: "in",
                fullLocation: "Bengaluru, KA, India",
                remote: false,
              },
              department: { label: "Sales" },
              typeOfEmployment: { label: "Full-time" },
              experienceLevel: { id: "mid_senior_level" },
            },
          ],
        }),
      },
      [DETAIL]: {
        body: JSON.stringify({
          id: "6000000001400034",
          jobAd: {
            sections: {
              companyDescription: {
                title: "Company Description",
                text: "<p>Swiggy is India's leading on-demand delivery platform.</p>",
              },
              jobDescription: {
                title: "Job Description",
                text: "<p>Key Responsibilities:</p><ul><li>Grow the seller network</li></ul>",
              },
              qualifications: {
                title: "Qualifications",
                text: "<ul><li>Bachelor's degree</li><li>4-5 years experience</li></ul>",
              },
              additionalInformation: {
                title: "Additional Information",
                text: "<p>We are an equal opportunity employer.</p>",
              },
            },
          },
        }),
      },
      [POSTING_PAGE]: {
        body: `<html><head>
                 <meta property="og:image" content="https://c.smartrecruiters.com/sr-company-images-prod-aws-dc9/6a33c3aa4e44db89564ce22d/default_social_logo/300x300">
                 <link rel="icon" href="https://av-www.smartrecruiters.com/sr-logo/1.0.10/winston/favicon.ico">
               </head>
               <body><meta itemprop="logo" content="${LOGO}"></body></html>`,
      },
    });
  }

  it("3. prefers itemprop=logo over the social crop and never the SR house icon", async () => {
    const [job] = await crawlBoard(
      "https://careers.smartrecruiters.com/Swiggy",
      "Swiggy",
      fetcher(),
    );
    expect(job.companyLogoUrl).toBe(LOGO);
    expect(job.companyLogoUrl).not.toMatch(/av-www\.smartrecruiters\.com/);
  });

  it("14. fetches the detail endpoint and stores a real description (was always null)", async () => {
    const [job] = await crawlBoard(
      "https://careers.smartrecruiters.com/Swiggy",
      "Swiggy",
      fetcher(),
    );
    expect(job.description).toBeTruthy();
    expect(job.descriptionHtml).toContain("<h2>Company Description</h2>");
    expect(job.descriptionHtml).toContain("<h2>Job Description</h2>");
    expect(job.descriptionHtml).toContain("<h2>Qualifications</h2>");
    expect(job.descriptionHtml).toContain(
      "Swiggy is India&#x27;s leading on-demand delivery platform.".replace("&#x27;", "'"),
    );
  });

  it("15. keeps the named sections as structured fields", async () => {
    const [job] = await crawlBoard(
      "https://careers.smartrecruiters.com/Swiggy",
      "Swiggy",
      fetcher(),
    );
    expect(job.responsibilities).toEqual(["Grow the seller network"]);
    expect(job.requirements).toEqual(["Bachelor's degree", "4-5 years experience"]);
  });
});

// ── Ashby ──

describe("Ashby", () => {
  const API = "https://api.ashbyhq.com/posting-api/job-board/tekion?includeCompensation=true";
  const BOARD_PAGE = "https://jobs.ashbyhq.com/tekion";
  const LOGO =
    "https://app.ashbyhq.com/api/images/org-theme-logo/d6197573-d402-4d9e-9195-a8b66bc15dea/df54d822/01dd52ce.png";

  function fetcher(): FakeFetcher {
    return new FakeFetcher({
      [API]: {
        body: JSON.stringify({
          apiVersion: "1",
          jobs: [
            {
              id: "72ed7709-e5e3-47fe-acd1-da837d03e5ce",
              title: "Senior Executive Assistant",
              location: "Chennai Regional Office",
              publishedAt: RECENT,
              isListed: true,
              employmentType: "FullTime",
              workplaceType: "OnSite",
              address: {
                postalAddress: {
                  addressLocality: "Chennai",
                  addressRegion: "Tamil Nādu",
                  addressCountry: "India",
                },
              },
              jobUrl: "https://jobs.ashbyhq.com/tekion/72ed7709",
              descriptionHtml:
                "<h2><strong>About Tekion:</strong></h2><p>We build cloud-native automotive retail software.</p>" +
                "<h2><strong>Duties &amp; Responsibilities:</strong></h2><ul><li>Manage executive calendars</li></ul>" +
                "<h2><strong>Qualifications:</strong></h2><ul><li>8+ years supporting executives</li></ul>",
              descriptionPlain: "About Tekion: We build cloud-native automotive retail software.",
            },
          ],
        }),
      },
      [BOARD_PAGE]: {
        body: `<html><head><meta property="og:image" content="${LOGO}">
                 <link rel="apple-touch-icon" href="https://cdn.ashbyprd.com/cdn_assets/apple-touch-icon.png">
               </head></html>`,
      },
    });
  }

  it("4. extracts the org logo and ignores Ashby's own CDN assets", async () => {
    const [job] = await crawlBoard("https://jobs.ashbyhq.com/tekion", "Tekion", fetcher());
    expect(job.companyLogoUrl).toBe(LOGO);
    expect(job.companyLogoUrl).not.toMatch(/cdn\.ashbyprd\.com/);
  });

  it("15. preserves Duties & Responsibilities and Qualifications", async () => {
    const [job] = await crawlBoard("https://jobs.ashbyhq.com/tekion", "Tekion", fetcher());
    expect(job.responsibilities).toEqual(["Manage executive calendars"]);
    expect(job.requirements).toEqual(["8+ years supporting executives"]);
    expect(job.descriptionHtml).toContain("<h2><strong>About Tekion:</strong></h2>");
  });

  it("accepts an India address carrying a combining macron in the region", async () => {
    const [job] = await crawlBoard("https://jobs.ashbyhq.com/tekion", "Tekion", fetcher());
    // "Tamil Nādu" must not prevent the posting from being recognised as India.
    expect(job.city).toBe("Chennai");
    expect(job.country).toBe("India");
  });
});

// ── Workable ──

describe("Workable", () => {
  const API = "https://apply.workable.com/api/v1/widget/accounts/deepsource?details=true";
  const ACCOUNT = "https://apply.workable.com/api/v1/accounts/deepsource";
  const LOGO = "https://workablehr.s3.amazonaws.com/uploads/account/logo/626923/logo";

  function fetcher(): FakeFetcher {
    return new FakeFetcher({
      [API]: {
        body: JSON.stringify({
          name: "DeepSource Technologies",
          jobs: [
            {
              shortcode: "D7A7FB7832",
              title: "Application Operations Engineer",
              url: "https://apply.workable.com/deepsource/j/D7A7FB7832/",
              published_on: RECENT_DATE_ONLY,
              created_at: RECENT_DATE_ONLY,
              employment_type: "Full-time",
              department: "Engineering",
              industry: "Information Technology and Services",
              city: "Bengaluru",
              state: "Karnataka",
              country: "India",
              locations: [
                { country: "India", countryCode: "IN", city: "Bengaluru", region: "Karnataka" },
              ],
              description:
                "<h3>Job Summary</h3><p>Support platform stability.</p>" +
                "<h3>Responsibilities</h3><ul><li>Run incident response</li></ul>",
            },
          ],
        }),
      },
      [ACCOUNT]: {
        body: JSON.stringify({
          id: 626923,
          logo: LOGO,
          subdomain: "deepsource",
          name: "DeepSource Technologies",
          url: "http://www.deepsource.ai",
        }),
      },
    });
  }

  it("5. takes the logo from the account API, never Workable's generic og:image", async () => {
    const [job] = await crawlBoard(
      "https://apply.workable.com/deepsource/",
      "DeepSource",
      fetcher(),
    );
    expect(job.companyLogoUrl).toBe(LOGO);
  });

  it("also picks up the employer's own website from the account API", async () => {
    const [job] = await crawlBoard(
      "https://apply.workable.com/deepsource/",
      "DeepSource",
      fetcher(),
    );
    expect(job.companyUrl).toBe("http://www.deepsource.ai");
  });

  it("14/15. keeps the body's headings and lists instead of flattening to text", async () => {
    const [job] = await crawlBoard(
      "https://apply.workable.com/deepsource/",
      "DeepSource",
      fetcher(),
    );
    expect(job.descriptionHtml).toContain("<h3>Job Summary</h3>");
    expect(job.descriptionHtml).toContain("<li>Run incident response</li>");
    expect(job.responsibilities).toEqual(["Run incident response"]);
  });
});

// ── The generic-image guard itself ──

describe("generic platform artwork is never stored as a company logo", () => {
  const generic = [
    "https://www.workable.com/assets/facebook-preview.png",
    "https://www.workable.com/static/ms-icon-144x144.png",
    "https://workable-application-form.s3.amazonaws.com/static/favicon.png",
    "https://av-www.smartrecruiters.com/sr-logo/1.0.10/winston/apple-touch-icon.png",
    "https://cdn.ashbyprd.com/cdn_assets/favicon.svg",
    "https://jobs.lever.co/img/lever-logo-refresh.svg",
  ];

  for (const url of generic) {
    it(`rejects ${url.split("/").slice(2, 4).join("/")}`, () => {
      expect(isGenericPlatformImage(url)).toBe(true);
      expect(pickCompanyLogo([url])).toBeNull();
    });
  }

  it("keeps a real company asset even when the path contains 'default_social_logo'", () => {
    // SmartRecruiters serves the employer's OWN image under that name; the
    // company id in the path is what makes it company-specific.
    const url =
      "https://c.smartrecruiters.com/sr-company-images-prod-aws-dc9/6a33c3aa4e44db89564ce22d/default_social_logo/300x300";
    expect(isGenericPlatformImage(url)).toBe(false);
  });

  it("falls through to the next candidate when the first is generic", () => {
    expect(
      pickCompanyLogo([
        "https://www.workable.com/assets/facebook-preview.png",
        "https://workablehr.s3.amazonaws.com/uploads/account/logo/626923/logo",
      ]),
    ).toBe("https://workablehr.s3.amazonaws.com/uploads/account/logo/626923/logo");
  });

  it("returns null rather than a data: URI", () => {
    expect(pickCompanyLogo(["data:image/png;base64,iVBORw0KGgo="])).toBeNull();
  });
});
