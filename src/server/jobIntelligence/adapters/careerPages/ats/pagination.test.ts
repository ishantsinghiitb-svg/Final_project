// ── Module 10B.2: pagination + completeness, per platform ──
//
// These are the tests that separate "the crawl returned something" from "the
// crawl returned everything". Each platform's real pagination contract was
// established by probing the live API (see the module notes); the fixtures
// here reproduce that contract exactly.

import { describe, expect, it } from "vitest";
import { FakeFetcher } from "../../../crawl/testing/fakeFetcher";
import { greenhouseProvider } from "./greenhouse";
import { leverProvider } from "./lever";
import { smartRecruitersProvider } from "./smartrecruiters";
import { DEFAULT_ATS_LIMITS, type AtsBoard } from "./types";

function board(provider: AtsBoard["provider"], token: string): AtsBoard {
  return { provider, token, careersUrl: `https://example.test/${token}`, companyName: "Acme" };
}

function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

// ── Greenhouse: one response holds the whole board, verified against meta.total ──

const GH_URL = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";

describe("greenhouse completeness", () => {
  function jobs(count: number) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, title: `Role ${i + 1}` }));
  }

  it("takes the whole board from a single response", async () => {
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: jobs(550), meta: { total: 550 } }) });
    const result = await greenhouseProvider.crawl(
      board("greenhouse", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );

    expect(result.raws).toHaveLength(550);
    expect(result.failure).toBeUndefined();
    expect(fetcher.requested).toHaveLength(1);
  });

  it("does not truncate a board larger than the OLD 300 cap", async () => {
    // The pre-10B.2 cap silently dropped 250 of Stripe's 550 real postings.
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: jobs(550), meta: { total: 550 } }) });
    const result = await greenhouseProvider.crawl(
      board("greenhouse", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws.length).toBeGreaterThan(300);
    expect(result.warnings.join(" ")).not.toMatch(/capped/);
  });

  it("warns when the payload holds fewer postings than the board claims", async () => {
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: jobs(10), meta: { total: 42 } }) });
    const result = await greenhouseProvider.crawl(
      board("greenhouse", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );

    expect(result.raws).toHaveLength(10);
    expect(result.warnings.join(" ")).toMatch(/reports 42 posting\(s\) but returned 10/);
  });

  it("stays quiet when the count agrees", async () => {
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: jobs(7), meta: { total: 7 } }) });
    const result = await greenhouseProvider.crawl(
      board("greenhouse", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("says so loudly when the cap actually bites", async () => {
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: jobs(20), meta: { total: 20 } }) });
    const result = await greenhouseProvider.crawl(board("greenhouse", "acme"), fetcher, {
      maxPostings: 5,
      maxDetailFetches: 5,
    });

    expect(result.raws).toHaveLength(5);
    expect(result.warnings.join(" ")).toMatch(/capped at 5.*jobs are being dropped/i);
  });
});

// ── Lever: skip/limit paging ──

const leverPage = (skip: number) =>
  `https://api.lever.co/v0/postings/acme?mode=json&limit=100&skip=${skip}`;

describe("lever pagination", () => {
  function postings(from: number, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `job-${from + i}`,
      text: `Role ${from + i}`,
    }));
  }

  it("follows skip until a short page", async () => {
    const fetcher = new FakeFetcher({
      [leverPage(0)]: json(postings(0, 100)),
      [leverPage(100)]: json(postings(100, 100)),
      [leverPage(200)]: json(postings(200, 12)),
    });

    const result = await leverProvider.crawl(board("lever", "acme"), fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(212);
    expect(fetcher.requested).toEqual([leverPage(0), leverPage(100), leverPage(200)]);
  });

  it("stops after one request when the board fits on a page", async () => {
    const fetcher = new FakeFetcher({ [leverPage(0)]: json(postings(0, 30)) });
    const result = await leverProvider.crawl(board("lever", "acme"), fetcher, DEFAULT_ATS_LIMITS);

    expect(result.raws).toHaveLength(30);
    expect(fetcher.requested).toHaveLength(1);
  });

  it("does not loop forever when a board ignores skip", async () => {
    // Same full page every time — without de-duplication by id this would
    // page until maxPostings and import the same jobs twenty times over.
    const fetcher = new FakeFetcher({
      [leverPage(0)]: json(postings(0, 100)),
      [leverPage(100)]: json(postings(0, 100)),
    });

    const result = await leverProvider.crawl(board("lever", "acme"), fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(100);
    expect(fetcher.requested).toHaveLength(2);
  });

  it("keeps what it collected when a later page fails", async () => {
    const fetcher = new FakeFetcher({
      [leverPage(0)]: json(postings(0, 100)),
      // page 2 unscripted → 404
    });

    const result = await leverProvider.crawl(board("lever", "acme"), fetcher, DEFAULT_ATS_LIMITS);
    expect(result.raws).toHaveLength(100);
    expect(result.failure).toBeUndefined();
    expect(result.warnings.join(" ")).toMatch(/Pagination stopped at skip=100/);
  });

  it("fails the board when page 1 fails", async () => {
    const result = await leverProvider.crawl(
      board("lever", "acme"),
      new FakeFetcher(),
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws).toHaveLength(0);
    expect(result.failure).toBeDefined();
  });
});

// ── SmartRecruiters: the phantom-board rule ──

const srPage = (offset: number) =>
  `https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100&offset=${offset}`;

describe("smartrecruiters phantom boards", () => {
  function postings(from: number, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: String(from + i),
      name: `Role ${from + i}`,
    }));
  }

  it("treats an EMPTY board as a FAILURE, not a zero-result success", async () => {
    // This API answers 200 with an empty board for any slug at all, so an
    // empty first page cannot be distinguished from a board that does not
    // exist — importing nothing and reporting success would leave a mistyped
    // slug looking healthy indefinitely.
    const fetcher = new FakeFetcher({ [srPage(0)]: json({ totalFound: 0, content: [] }) });
    const result = await smartRecruitersProvider.crawl(
      board("smartrecruiters", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );

    expect(result.raws).toHaveLength(0);
    expect(result.failure).toBeDefined();
    expect(result.failure?.reason).toMatch(/empty board for ANY slug/i);
    expect(result.failure?.blocked).toBe(false);
  });

  it("never imports a phantom job", async () => {
    const fetcher = new FakeFetcher({ [srPage(0)]: json({ totalFound: 0, content: [] }) });
    const result = await smartRecruitersProvider.crawl(
      board("smartrecruiters", "nonsense"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws).toEqual([]);
  });

  it("pages until a short page and checks the total", async () => {
    const fetcher = new FakeFetcher({
      [srPage(0)]: json({ totalFound: 157, content: postings(0, 100) }),
      [srPage(100)]: json({ totalFound: 157, content: postings(100, 57) }),
    });

    const result = await smartRecruitersProvider.crawl(
      board("smartrecruiters", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws).toHaveLength(157);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when pagination ends short of the board's own total", async () => {
    const fetcher = new FakeFetcher({
      [srPage(0)]: json({ totalFound: 500, content: postings(0, 100) }),
      // page 2 unscripted → 404, so the crawl ends early
    });

    const result = await smartRecruitersProvider.crawl(
      board("smartrecruiters", "acme"),
      fetcher,
      DEFAULT_ATS_LIMITS,
    );
    expect(result.raws).toHaveLength(100);
    expect(result.warnings.join(" ")).toMatch(/Collected 100 of 500/);
  });
});
