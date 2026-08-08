import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../../../crawl/testing/fakeFetcher";
import { discoverJobLinks, jsonLdBoardProvider } from "./jsonLdBoard";
import { DEFAULT_ATS_LIMITS, type AtsBoard, type AtsPostingPayload } from "./types";

const CAREERS_URL = "https://acme.test/careers";
const BOARD: AtsBoard = {
  provider: "jsonld",
  token: "acme.test",
  careersUrl: CAREERS_URL,
  companyName: "Acme",
};

function html(body: string): { body: string; contentType: string } {
  return { body, contentType: "text/html" };
}

function postingScript(overrides: Record<string, unknown> = {}): string {
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Platform Engineer",
    identifier: "REQ-1",
    description: "<p>Run the platform.</p><ul><li>On-call</li></ul>",
    datePosted: "2026-08-01",
    validThrough: "2026-09-30",
    employmentType: "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: "Acme",
      url: "https://acme.test",
      logo: "https://acme.test/l.png",
    },
    jobLocation: { "@type": "Place", address: { addressLocality: "Berlin", addressCountry: "DE" } },
    baseSalary: { currency: "EUR", value: { minValue: 70000, maxValue: 90000, unitText: "YEAR" } },
    skills: "Go, Kubernetes, Terraform",
    ...overrides,
  })}</script>`;
}

describe("discoverJobLinks", () => {
  it("finds same-host posting links", () => {
    const page = `
      <a href="/jobs/platform-engineer">One</a>
      <a href="/careers/designer">Two</a>
      <a href="https://acme.test/positions/pm">Three</a>`;
    expect(discoverJobLinks(page, CAREERS_URL)).toEqual([
      "https://acme.test/jobs/platform-engineer",
      "https://acme.test/careers/designer",
      "https://acme.test/positions/pm",
    ]);
  });

  it("rejects other hosts", () => {
    expect(discoverJobLinks(`<a href="https://elsewhere.test/jobs/x">x</a>`, CAREERS_URL)).toEqual(
      [],
    );
  });

  it("rejects chrome that merely lives under a job-ish path", () => {
    const page = `
      <a href="/jobs/search">Search</a>
      <a href="/careers/privacy">Privacy</a>
      <a href="/jobs/brochure.pdf">PDF</a>
      <a href="/jobs/real-role">Real</a>`;
    expect(discoverJobLinks(page, CAREERS_URL)).toEqual(["https://acme.test/jobs/real-role"]);
  });

  it("de-duplicates and strips fragments", () => {
    const page = `<a href="/jobs/a">1</a><a href="/jobs/a#apply">2</a><a href="/jobs/a">3</a>`;
    expect(discoverJobLinks(page, CAREERS_URL)).toEqual(["https://acme.test/jobs/a"]);
  });

  it("never returns the careers page itself", () => {
    expect(discoverJobLinks(`<a href="/careers">self</a>`, CAREERS_URL)).toEqual([]);
  });

  it("ignores non-navigational hrefs", () => {
    expect(
      discoverJobLinks(`<a href="#x">a</a><a href="javascript:void(0)">b</a>`, CAREERS_URL),
    ).toEqual([]);
  });
});

describe("jsonLdBoardProvider.crawl", () => {
  it("uses postings embedded on the index page and makes no follow-up requests", async () => {
    const fetcher = new FakeFetcher({ [CAREERS_URL]: html(`<html>${postingScript()}</html>`) });
    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);

    expect(result.raws).toHaveLength(1);
    expect(fetcher.requested).toEqual([CAREERS_URL]);
  });

  it("follows discovered links when the index has no markup", async () => {
    const fetcher = new FakeFetcher({
      [CAREERS_URL]: html(`<a href="/jobs/one">One</a><a href="/jobs/two">Two</a>`),
      "https://acme.test/jobs/one": html(postingScript({ title: "One" })),
      "https://acme.test/jobs/two": html(postingScript({ title: "Two" })),
    });

    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(2);
    expect(fetcher.requested).toHaveLength(3);
  });

  it("respects the detail-fetch budget", async () => {
    const routes: Record<string, { body: string; contentType: string }> = {
      [CAREERS_URL]: html(
        Array.from({ length: 5 }, (_, i) => `<a href="/jobs/r${i}">r${i}</a>`).join(""),
      ),
    };
    for (let i = 0; i < 5; i++) routes[`https://acme.test/jobs/r${i}`] = html(postingScript());

    const result = await jsonLdBoardProvider.crawl(BOARD, new FakeFetcher(routes), {
      maxPostings: 10,
      maxDetailFetches: 2,
    });
    expect(result.raws).toHaveLength(2);
    expect(result.warnings.join(" ")).toMatch(/fetched the first 2/);
  });

  it("skips a linked page with no markup and says how many", async () => {
    const fetcher = new FakeFetcher({
      [CAREERS_URL]: html(`<a href="/jobs/a">a</a><a href="/jobs/b">b</a>`),
      "https://acme.test/jobs/a": html(postingScript()),
      "https://acme.test/jobs/b": html("<h1>Nothing structured here</h1>"),
    });

    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/1 linked page\(s\) carried no JobPosting/);
  });

  it("fails with actionable advice when the page is JS-rendered", async () => {
    const fetcher = new FakeFetcher({ [CAREERS_URL]: html("<div id='root'></div>") });
    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);

    expect(result.raws).toHaveLength(0);
    expect(result.failure?.reason).toMatch(/renders its jobs with JavaScript/);
    expect(result.failure?.reason).toMatch(/register the company's ATS board URL/i);
  });

  it("propagates a blocked index page", async () => {
    const result = await jsonLdBoardProvider.crawl(
      BOARD,
      new FakeFetcher({ [CAREERS_URL]: BLOCKED }),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.failure?.blocked).toBe(true);
  });

  it("never guesses a posting from headings when there is no JSON-LD", async () => {
    const fetcher = new FakeFetcher({
      [CAREERS_URL]: html(`<a href="/jobs/a">a</a>`),
      "https://acme.test/jobs/a": html("<h1>Staff Engineer</h1><p>Great role</p>"),
    });
    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(0);
    expect(result.failure).toBeDefined();
  });
});

describe("jsonLdBoardProvider.parsePosting", () => {
  async function parseFirst(pageHtml: string) {
    const fetcher = new FakeFetcher({ [CAREERS_URL]: html(pageHtml) });
    const result = await jsonLdBoardProvider.crawl(BOARD, fetcher, DEFAULT_ATS_LIMITS);
    const raw = result.raws[0];
    return jsonLdBoardProvider.parsePosting(raw.json as AtsPostingPayload, raw);
  }

  it("maps the full schema.org shape", async () => {
    const outcome = await parseFirst(postingScript());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const job = outcome.job;
    expect(job.source).toBe("careers");
    expect(job.role).toBe("Platform Engineer");
    expect(job.companyName).toBe("Acme");
    expect(job.sourceJobId).toBe("REQ-1");
    expect(job.city).toBe("Berlin");
    expect(job.country).toBe("DE");
    expect(job.employmentType).toBe("Full-Time");
    expect(job.salaryMin).toBe(70000);
    expect(job.salaryCurrency).toBe("EUR");
    expect(job.salaryPeriod).toBe("Yearly");
    expect(job.postedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(job.expiryDate).toBe("2026-09-30T00:00:00.000Z");
    expect(job.companyLogoUrl).toBe("https://acme.test/l.png");
  });

  it("splits a comma-delimited skills string into items", async () => {
    const outcome = await parseFirst(postingScript());
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.skills).toEqual(["Go", "Kubernetes", "Terraform"]);
  });

  it("stores description as clean text", async () => {
    const outcome = await parseFirst(postingScript());
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.description).toBe("Run the platform.\n\n- On-call");
    expect(outcome.job.description).not.toMatch(/[<>]/);
  });

  it("detects TELECOMMUTE as remote", async () => {
    const outcome = await parseFirst(postingScript({ jobLocationType: "TELECOMMUTE" }));
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.remote).toBe(true);
    expect(outcome.job.workMode).toBe("Remote");
  });

  it("falls back to the registry company when the posting names none", async () => {
    const outcome = await parseFirst(postingScript({ hiringOrganization: undefined }));
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.companyName).toBe("Acme");
  });

  it("rejects a posting with no title", async () => {
    const outcome = await parseFirst(postingScript({ title: undefined, name: undefined }));
    expect(outcome.ok).toBe(false);
  });
});
