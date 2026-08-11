import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../testing/fakeFetcher";
import {
  blockedPlatformForHost,
  countPostings,
  findLinkedAtsBoard,
  isActionableHealth,
  isCrawlableHealth,
  isMeaningfulRedirect,
  verifySource,
} from "./SourceVerifier";
import { WWR_PLATFORM } from "../../adapters/weWorkRemotely/WeWorkRemotelyAdapter";

const GH_API = (slug: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
const SR_API = (slug: string) =>
  `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=0`;

function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}
function html(body: string) {
  return { body, contentType: "text/html" };
}

describe("isMeaningfulRedirect", () => {
  it("ignores http→https, www and trailing slashes", () => {
    expect(isMeaningfulRedirect("http://a.test/careers", "https://a.test/careers")).toBe(false);
    expect(isMeaningfulRedirect("https://www.a.test/careers", "https://a.test/careers")).toBe(
      false,
    );
    expect(isMeaningfulRedirect("https://a.test/careers/", "https://a.test/careers")).toBe(false);
  });

  it("flags a different host or path", () => {
    expect(isMeaningfulRedirect("https://a.test/careers", "https://b.test/careers")).toBe(true);
    expect(isMeaningfulRedirect("https://a.test/careers", "https://a.test/jobs")).toBe(true);
  });

  it("does not throw on a malformed URL", () => {
    expect(isMeaningfulRedirect("not a url", "also not")).toBe(true);
  });
});

describe("blockedPlatformForHost", () => {
  it.each([
    ["https://wellfound.com/jobs", "wellfound"],
    ["https://www.foundit.in/srp/results", "foundit"],
    ["https://www.monsterindia.com/x", "foundit"],
    ["https://www.iimjobs.com/j/x", "iimjobs"],
  ])("%s → %s", (url, expected) => {
    expect(blockedPlatformForHost(url)).toBe(expected);
  });

  it("returns empty for a normal host or a bad URL", () => {
    expect(blockedPlatformForHost("https://boards.greenhouse.io/x")).toBe("");
    expect(blockedPlatformForHost("nonsense")).toBe("");
  });
});

describe("countPostings", () => {
  it("reads each provider's own envelope", () => {
    expect(countPostings("greenhouse", JSON.stringify({ jobs: [1, 2, 3] }))).toBe(3);
    expect(countPostings("ashby", JSON.stringify({ jobs: [1] }))).toBe(1);
    expect(countPostings("lever", JSON.stringify([1, 2]))).toBe(2);
    expect(countPostings("smartrecruiters", JSON.stringify({ content: [] }))).toBe(0);
    expect(countPostings("workable", JSON.stringify({ jobs: [1] }))).toBe(1);
    expect(countPostings("recruitee", JSON.stringify({ offers: [1, 2] }))).toBe(2);
  });

  it("returns null for a payload that is not that provider's shape", () => {
    expect(countPostings("greenhouse", JSON.stringify({ nope: true }))).toBeNull();
    expect(countPostings("lever", JSON.stringify({ postings: [] }))).toBeNull();
    expect(countPostings("greenhouse", "<html>")).toBeNull();
  });
});

describe("findLinkedAtsBoard", () => {
  it("finds a board a careers page links out to", () => {
    expect(findLinkedAtsBoard('<a href="https://boards.greenhouse.io/acme">Openings</a>')).toBe(
      "https://boards.greenhouse.io/acme",
    );
    expect(findLinkedAtsBoard('<a href="https://jobs.lever.co/acme">x</a>')).toBe(
      "https://jobs.lever.co/acme",
    );
    expect(findLinkedAtsBoard("see https://acme.recruitee.com for roles")).toBe(
      "https://acme.recruitee.com",
    );
  });

  it("returns null when the page links to no board", () => {
    expect(findLinkedAtsBoard("<a href='/about'>About</a>")).toBeNull();
  });
});

describe("verifySource — known ATS boards", () => {
  it("returns HEALTHY with a posting count for a real board", async () => {
    const fetcher = new FakeFetcher({ [GH_API("acme")]: json({ jobs: [{ id: 1 }, { id: 2 }] }) });
    const result = await verifySource("https://boards.greenhouse.io/acme", "Acme", fetcher);

    expect(result.health).toBe("HEALTHY");
    expect(result.detectedPlatform).toBe("greenhouse");
    expect(result.postingsSeen).toBe(2);
    expect(result.httpStatus).toBe(200);
    expect(result.errorReason).toBeNull();
  });

  it("probes the SAME endpoint the crawler reads", async () => {
    const fetcher = new FakeFetcher({ [GH_API("acme")]: json({ jobs: [] }) });
    await verifySource("https://boards.greenhouse.io/acme", "Acme", fetcher);
    expect(fetcher.requested).toEqual([GH_API("acme")]);
  });

  it("keeps an operator-registered board with no openings HEALTHY, and says so", async () => {
    // Distinct from DISCOVERY, where an empty board is not evidence the board
    // exists — here a human asserted the URL, so "no openings" is a real state.
    const fetcher = new FakeFetcher({ [SR_API("acme")]: json({ content: [] }) });
    const result = await verifySource("https://careers.smartrecruiters.com/acme", "Acme", fetcher);

    expect(result.health).toBe("HEALTHY");
    expect(result.postingsSeen).toBe(0);
    expect(result.errorReason).toMatch(/no open postings/i);
  });

  it("returns BROKEN for a board that 404s", async () => {
    const fetcher = new FakeFetcher({
      [GH_API("nope")]: {
        failure: { ok: false, kind: "http", status: 404, reason: "HTTP 404 Not Found" },
      },
    });
    const result = await verifySource("https://boards.greenhouse.io/nope", "Acme", fetcher);
    expect(result.health).toBe("BROKEN");
    expect(result.httpStatus).toBe(404);
  });

  it("returns BLOCKED for a 403", async () => {
    const fetcher = new FakeFetcher({ [GH_API("acme")]: BLOCKED });
    const result = await verifySource("https://boards.greenhouse.io/acme", "Acme", fetcher);
    expect(result.health).toBe("BLOCKED");
  });

  it("returns UNAVAILABLE for a 5xx and for a timeout", async () => {
    const server = new FakeFetcher({
      [GH_API("acme")]: {
        failure: { ok: false, kind: "http", status: 503, reason: "HTTP 503" },
      },
    });
    expect((await verifySource("https://boards.greenhouse.io/acme", "A", server)).health).toBe(
      "UNAVAILABLE",
    );

    const slow = new FakeFetcher({
      [GH_API("acme")]: { failure: { ok: false, kind: "timeout", reason: "Request timed out" } },
    });
    expect((await verifySource("https://boards.greenhouse.io/acme", "A", slow)).health).toBe(
      "UNAVAILABLE",
    );
  });

  it("treats a DNS failure as BROKEN, not UNAVAILABLE", async () => {
    const fetcher = new FakeFetcher({
      [GH_API("acme")]: {
        failure: { ok: false, kind: "network", reason: "getaddrinfo ENOTFOUND boards.test" },
      },
    });
    const result = await verifySource("https://boards.greenhouse.io/acme", "Acme", fetcher);
    expect(result.health).toBe("BROKEN");
  });

  it("returns UNKNOWN when the ATS answers with an unrecognizable payload", async () => {
    const fetcher = new FakeFetcher({ [GH_API("acme")]: json({ surprise: true }) });
    const result = await verifySource("https://boards.greenhouse.io/acme", "Acme", fetcher);
    expect(result.health).toBe("UNKNOWN");
    expect(result.errorReason).toMatch(/not a recognizable job board/i);
  });

  it("returns BROKEN for a malformed careers URL without fetching", async () => {
    const fetcher = new FakeFetcher();
    const result = await verifySource("not a url", "Acme", fetcher);
    expect(result.health).toBe("BROKEN");
    expect(fetcher.requested).toHaveLength(0);
  });
});

describe("verifySource — blocked platforms", () => {
  it.each([
    ["https://wellfound.com/company/acme/jobs", /DataDome/],
    ["https://www.foundit.in/srp/results", /robots\.txt/],
    ["https://www.iimjobs.com/j/x", /JavaScript|bot detection/i],
  ])("reports %s from recorded evidence without probing", async (url, pattern) => {
    const fetcher = new FakeFetcher();
    const result = await verifySource(url, "Acme", fetcher);

    expect(result.health).toBe("BLOCKED");
    expect(result.errorReason).toMatch(pattern);
    // The whole point: no request is made to a source we know refuses us.
    expect(fetcher.requested).toHaveLength(0);
  });
});

describe("verifySource — plain careers pages", () => {
  const PAGE = "https://acme.test/careers";

  it("is HEALTHY when the page carries JobPosting markup", async () => {
    const body = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Engineer",
    })}</script>`;
    const result = await verifySource(PAGE, "Acme", new FakeFetcher({ [PAGE]: html(body) }));

    expect(result.health).toBe("HEALTHY");
    expect(result.detectedPlatform).toBe("custom_careers");
    expect(result.postingsSeen).toBe(1);
  });

  it("is HEALTHY when the page links to postings AND the sampled link actually parses", async () => {
    const body = `<a href="/jobs/backend-engineer">Backend</a><a href="/jobs/designer">Designer</a>`;
    const detail = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Backend Engineer",
    })}</script>`;
    const result = await verifySource(
      PAGE,
      "Acme",
      new FakeFetcher({
        [PAGE]: html(body),
        "https://acme.test/jobs/backend-engineer": html(detail),
      }),
    );

    expect(result.health).toBe("HEALTHY");
    expect(result.detectedPlatform).toBe("custom_careers");
    expect(result.postingsSeen).toBe(2);
  });

  // Module 10B.2.5: candidate links alone are not proof postings are
  // crawlable — this is the exact false-HEALTHY shape the MoEngage/Trakstar
  // investigation found (link discovery succeeds, but every linked page
  // fails to yield a parseable JobPosting).
  it("is UNKNOWN, not HEALTHY, when links exist but none of the sampled pages actually parse", async () => {
    const body = `<a href="/jobs/backend-engineer">Backend</a><a href="/jobs/designer">Designer</a>`;
    const result = await verifySource(
      PAGE,
      "Acme",
      new FakeFetcher({
        [PAGE]: html(body),
        "https://acme.test/jobs/backend-engineer": html("<p>No structured data here.</p>"),
      }),
    );

    expect(result.health).toBe("UNKNOWN");
    expect(result.detectedPlatform).toBeNull();
    expect(result.errorReason).toMatch(/candidate job link/i);
    expect(result.errorReason).toMatch(/no.*parseable JobPosting/i);
  });

  it("is UNKNOWN when the sampled candidate link cannot even be fetched", async () => {
    const body = `<a href="/jobs/backend-engineer">Backend</a>`;
    const result = await verifySource(
      PAGE,
      "Acme",
      new FakeFetcher({
        [PAGE]: html(body),
        "https://acme.test/jobs/backend-engineer": {
          failure: { ok: false, kind: "http", status: 404, reason: "HTTP 404 Not Found" },
        },
      }),
    );

    expect(result.health).toBe("UNKNOWN");
  });

  it("is UNKNOWN — never HEALTHY — for a page with no evidence of being a jobs board", async () => {
    const result = await verifySource(
      PAGE,
      "Acme",
      new FakeFetcher({ [PAGE]: html("<div id='root'></div>") }),
    );

    expect(result.health).toBe("UNKNOWN");
    expect(result.detectedPlatform).toBeNull();
    expect(result.errorReason).toMatch(/JavaScript/);
  });

  it("follows a linked ATS board and reports where it went", async () => {
    const fetcher = new FakeFetcher({
      [PAGE]: html(`<a href="https://boards.greenhouse.io/acme">See openings</a>`),
      [GH_API("acme")]: json({ jobs: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
    });
    const result = await verifySource(PAGE, "Acme", fetcher);

    expect(result.health).toBe("REDIRECTED");
    expect(result.detectedPlatform).toBe("greenhouse");
    expect(result.postingsSeen).toBe(3);
    expect(result.finalUrl).toBe("https://boards.greenhouse.io/acme");
    expect(result.errorReason).toMatch(/links to a greenhouse board/);
  });

  it("only follows one hop — a linked board that itself links out does not recurse", async () => {
    const fetcher = new FakeFetcher({
      [PAGE]: html(`<a href="https://boards.greenhouse.io/acme">openings</a>`),
      [GH_API("acme")]: json({ jobs: [{ id: 1 }] }),
    });
    await verifySource(PAGE, "Acme", fetcher);
    expect(fetcher.requested).toEqual([PAGE, GH_API("acme")]);
  });

  it("can be told not to follow links at all", async () => {
    const fetcher = new FakeFetcher({
      [PAGE]: html(`<a href="https://boards.greenhouse.io/acme">openings</a>`),
    });
    const result = await verifySource(PAGE, "Acme", fetcher, {}, { followLinkedAts: false });
    expect(result.health).toBe("UNKNOWN");
    expect(fetcher.requested).toEqual([PAGE]);
  });

  it("reports the linked board's failure rather than claiming health", async () => {
    const fetcher = new FakeFetcher({
      [PAGE]: html(`<a href="https://boards.greenhouse.io/acme">openings</a>`),
      [GH_API("acme")]: {
        failure: { ok: false, kind: "http", status: 404, reason: "HTTP 404 Not Found" },
      },
    });
    const result = await verifySource(PAGE, "Acme", fetcher);
    expect(result.health).toBe("BROKEN");
  });
});

describe("verifySource — config overrides", () => {
  it("honours an explicit ATS + board token", async () => {
    const fetcher = new FakeFetcher({ [GH_API("realtoken")]: json({ jobs: [{ id: 1 }] }) });
    const result = await verifySource("https://careers.acme.test/openings", "Acme", fetcher, {
      ats: "greenhouse",
      boardToken: "realtoken",
    });
    expect(result.health).toBe("HEALTHY");
    expect(result.detectedPlatform).toBe("greenhouse");
  });
});

describe("verifySource — We Work Remotely (Module 10B.2 fix)", () => {
  const FEED = "https://weworkremotely.com/remote-jobs.rss";

  function rss(items: string[]): { body: string; contentType: string } {
    const body =
      `<?xml version="1.0" encoding="UTF-8"?><rss><channel>` + items.join("") + `</channel></rss>`;
    return { body, contentType: "application/rss+xml" };
  }

  function feedItem(title: string, link: string): string {
    return `<item><title>${title}</title><link>${link}</link></item>`;
  }

  it("a valid feed with real job entries is HEALTHY", async () => {
    const fetcher = new FakeFetcher({
      [FEED]: rss([
        feedItem("Acme Inc: Backend Engineer", "https://weworkremotely.com/remote-jobs/acme-1"),
        feedItem("Acme Inc: Frontend Engineer", "https://weworkremotely.com/remote-jobs/acme-2"),
      ]),
    });

    const result = await verifySource(FEED, "We Work Remotely — All Jobs", fetcher, undefined, {
      platform: WWR_PLATFORM,
    });

    expect(result.health).toBe("HEALTHY");
    expect(result.detectedPlatform).toBe("weworkremotely");
    expect(result.postingsSeen).toBe(2);
    expect(result.errorReason).toBeNull();
  });

  it("an empty feed (no <item> entries) is not healthy", async () => {
    const fetcher = new FakeFetcher({
      [FEED]: rss([]),
    });

    const result = await verifySource(FEED, "We Work Remotely — All Jobs", fetcher, undefined, {
      platform: WWR_PLATFORM,
    });

    expect(result.health).toBe("UNKNOWN");
    expect(isCrawlableHealth(result.health)).toBe(false);
    expect(result.errorReason).toMatch(/no <item> entries|not a valid RSS/i);
  });

  it("a malformed (non-XML) response is not healthy", async () => {
    const fetcher = new FakeFetcher({
      [FEED]: { body: "<html><body>this is not a feed</body></html>", contentType: "text/html" },
    });

    const result = await verifySource(FEED, "We Work Remotely — All Jobs", fetcher, undefined, {
      platform: WWR_PLATFORM,
    });

    expect(result.health).toBe("UNKNOWN");
  });

  it("maps an HTTP failure to the same health as every other provider", async () => {
    const fetcher503 = new FakeFetcher({
      [FEED]: { failure: { ok: false, kind: "http", status: 503, reason: "HTTP 503" } },
    });
    expect(
      (await verifySource(FEED, "WWR", fetcher503, undefined, { platform: WWR_PLATFORM })).health,
    ).toBe("UNAVAILABLE");

    const fetcher404 = new FakeFetcher({
      [FEED]: { failure: { ok: false, kind: "http", status: 404, reason: "HTTP 404 Not Found" } },
    });
    expect(
      (await verifySource(FEED, "WWR", fetcher404, undefined, { platform: WWR_PLATFORM })).health,
    ).toBe("BROKEN");

    const blocked = new FakeFetcher({ [FEED]: BLOCKED });
    expect(
      (await verifySource(FEED, "WWR", blocked, undefined, { platform: WWR_PLATFORM })).health,
    ).toBe("BLOCKED");
  });

  it("never falls through to JSON-LD/HTML detection, even when the body would satisfy it", async () => {
    // This body has valid JobPosting JSON-LD (which the generic detector would
    // happily call HEALTHY/custom_careers) but no RSS <item> entries at all.
    // Under WWR verification only <item> entries count as evidence — proving
    // the generic detector never ran.
    const trickBody = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Engineer",
    })}</script>`;
    const fetcher = new FakeFetcher({
      [FEED]: { body: trickBody, contentType: "text/html" },
    });

    const result = await verifySource(FEED, "We Work Remotely — All Jobs", fetcher, undefined, {
      platform: WWR_PLATFORM,
    });

    expect(result.health).toBe("UNKNOWN");
    expect(result.detectedPlatform).not.toBe("custom_careers");
  });

  it("without the platform tag, the same URL still runs the generic detector (not RSS-aware)", async () => {
    // Proves the dispatch is opt-in via registry `platform`, not URL sniffing
    // — a source not tagged weworkremotely is never treated as one.
    const fetcher = new FakeFetcher({
      [FEED]: rss([feedItem("Acme Inc: Backend Engineer", "https://weworkremotely.com/x")]),
    });

    const result = await verifySource(FEED, "We Work Remotely — All Jobs", fetcher);

    // The generic detector sees XML it doesn't recognize as an ATS, and finds
    // no JobPosting JSON-LD or job-shaped links in it either.
    expect(result.health).toBe("UNKNOWN");
    expect(result.detectedPlatform).not.toBe("weworkremotely");
  });
});

describe("health predicates", () => {
  it("classifies crawlable vs actionable", () => {
    expect(isCrawlableHealth("HEALTHY")).toBe(true);
    expect(isCrawlableHealth("REDIRECTED")).toBe(true);
    expect(isCrawlableHealth("UNKNOWN")).toBe(false);
    expect(isCrawlableHealth("BROKEN")).toBe(false);

    expect(isActionableHealth("BROKEN")).toBe(true);
    expect(isActionableHealth("BLOCKED")).toBe(true);
    expect(isActionableHealth("UNKNOWN")).toBe(true);
    expect(isActionableHealth("HEALTHY")).toBe(false);
    // Transient: not something an operator should be nagged to fix.
    expect(isActionableHealth("UNAVAILABLE")).toBe(false);
  });
});
