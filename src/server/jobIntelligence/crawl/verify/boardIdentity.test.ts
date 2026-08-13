import { describe, expect, it } from "vitest";
import { confirmBoardIdentity, evaluateBoardIdentity } from "./boardIdentity";
import type { CrawlFetcher, FetchResult } from "../HttpFetcher";

// Fixtures are shaped like the board payloads the investigation actually saw,
// but use invented companies so no test depends on any of the 14 sources
// Module 11B registers.
//
// The governing rule under test: `autoRegisterable` is true ONLY for an
// independently corroborated board. Everything else is either rejected
// outright or held for human review — never silently registered.

const ACME_BOARD = `
  {"jobs":[
    {"title":"Senior Backend Engineer","company":"Acme Robotics","location":"Bengaluru, India",
     "absolute_url":"https://boards.greenhouse.io/acmerobotics/jobs/1"},
    {"title":"Product Designer","company":"Acme Robotics","location":"Pune, India"},
    {"content":"Acme Robotics is hiring across its India engineering centres. Apply at https://acmerobotics.com/careers"}
  ]}
`;

describe("evaluateBoardIdentity — 1. correct company board is accepted", () => {
  it("accepts when the board names the company AND links its own domain", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Acme Robotics",
      boardText: ACME_BOARD,
      expectedDomain: "acmerobotics.com",
    });
    expect(verdict.outcome).toBe("accepted");
    expect(verdict.autoRegisterable).toBe(true);
    expect(verdict.confidence).toBe("strong");
    expect(verdict.evidence.domainMatch).toBe(true);
  });

  it("matches across spacing and casing drift (SigNoz-style names)", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "WaveKit",
      boardText: `wavekit engineering. Wave-Kit is hiring. WAVEKIT platform team. https://wavekit.io`,
      expectedDomain: "wavekit.io",
    });
    expect(verdict.outcome).toBe("accepted");
  });
});

describe("evaluateBoardIdentity — 2. wrong company board is rejected", () => {
  it("rejects a board that belongs to an unrelated company", () => {
    // The real shape of the slug-coincidence false positives: the slug
    // matched, the content is someone else's business entirely.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Pinehurst Labs",
      boardText: `{"jobs":[
        {"title":"Licensed Real Estate Agent","location":"Toronto, Ontario, Canada"},
        {"title":"Mortgage Specialist","location":"Calgary, Alberta, Canada"}
      ]}`,
    });
    expect(verdict.outcome).toBe("rejected");
    expect(verdict.autoRegisterable).toBe(false);
    expect(verdict.reason).toContain("belongs to someone else");
  });

  it("does not let a board vouch for itself through its own URLs", () => {
    // A board hosted at <slug>.recruitee.com repeats the slug in every
    // self-link. Those must not count as evidence, or any guessed slug passes.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Skylark",
      boardText: `
        <a href="https://skylark.recruitee.com/o/1">Warehouse Associate</a>
        <a href="https://skylark.recruitee.com/o/2">Delivery Driver</a>
        <a href="https://skylark.recruitee.com/o/3">Store Manager</a>
      `,
    });
    expect(verdict.outcome).toBe("rejected");
    expect(verdict.evidence.nameMentions).toBe(0);
  });
});

describe("evaluateBoardIdentity — 3. ambiguous evidence is not registered", () => {
  it("holds a heavily-named board for review when nothing independent confirms it", () => {
    // THE case that forced the three-state design. Measured live: boards for a
    // UAE retailer, a US startup and a US healthcare org named the expected
    // company 40, 91 and 250 times respectively — and were all the WRONG
    // company. Name evidence cannot separate homonyms at any volume.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Meridian",
      boardText: `Meridian. Meridian careers. Meridian is hiring. Meridian benefits. Meridian team.`,
    });
    expect(verdict.outcome).toBe("needs_review");
    expect(verdict.autoRegisterable).toBe(false);
    expect(verdict.reason).toContain("no independent signal");
  });

  it("holds a single passing mention for review rather than registering it", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Harbor Analytics",
      boardText: `{"jobs":[{"title":"Data Engineer","description":"Partnering with Harbor Analytics on delivery."}]}`,
    });
    expect(verdict.autoRegisterable).toBe(false);
    expect(verdict.evidence.nameMentions).toBe(1);
  });

  it("rejects an empty board rather than passing it by default", () => {
    const verdict = evaluateBoardIdentity({ expectedCompany: "Harbor Analytics", boardText: "" });
    expect(verdict.outcome).toBe("rejected");
  });

  it("refuses to judge a name too short to be evidence", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "HP",
      boardText: "hp hp hp hp hp printers and php developers",
    });
    expect(verdict.autoRegisterable).toBe(false);
    expect(verdict.reason).toContain("too short or generic");
  });

  it("does not accept on a domain match alone when the company is never named", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Harbor Analytics",
      boardText: `{"jobs":[{"title":"Chef","apply":"https://harboranalytics.com"}]}`,
      expectedDomain: "harboranalytics.com",
    });
    expect(verdict.outcome).toBe("rejected");
  });
});

describe("evaluateBoardIdentity — 4. demo/test tenants are rejected", () => {
  it("rejects the Recruitee sample tenant", () => {
    // Verbatim shape of what google.recruitee.com actually served.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Globex",
      boardText: `{"offers":[{"title":"Senior Marketer (Sample)","city":"Amsterdam","company":"Globex"}]}`,
    });
    expect(verdict.outcome).toBe("rejected");
    expect(verdict.evidence.demoMarkers).toContain("(sample)");
  });

  it("rejects the localized demo variant", () => {
    // samsung.recruitee.com served the identical template in German.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Globex",
      boardText: `{"offers":[{"title":"Senior Marketer (Muster)","city":"Berlin","company":"Globex"}]}`,
    });
    expect(verdict.outcome).toBe("rejected");
  });

  it("rejects a demo tenant EVEN WHEN name and domain both corroborate", () => {
    // Decisive: demo detection must outrank every other signal, including the
    // domain match that would otherwise make this auto-registerable.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Globex",
      boardText: `Globex. Globex. Globex careers. Senior Marketer (Sample). https://globex.com`,
      expectedDomain: "globex.com",
    });
    expect(verdict.outcome).toBe("rejected");
    expect(verdict.autoRegisterable).toBe(false);
  });
});

describe("confirmBoardIdentity", () => {
  const fetcherReturning = (result: FetchResult): CrawlFetcher => ({
    fetchText: async () => result,
  });

  it("accepts a readable, corroborated board", async () => {
    const verdict = await confirmBoardIdentity(
      "https://boards-api.greenhouse.io/v1/boards/acmerobotics/jobs",
      "Acme Robotics",
      fetcherReturning({
        ok: true,
        status: 200,
        url: "https://boards-api.greenhouse.io/v1/boards/acmerobotics/jobs",
        body: ACME_BOARD,
        contentType: "application/json",
      }),
      "acmerobotics.com",
    );
    expect(verdict.outcome).toBe("accepted");
  });

  it("rejects when the board cannot be read — unverifiable is not verified", async () => {
    const verdict = await confirmBoardIdentity(
      "https://boards-api.greenhouse.io/v1/boards/acmerobotics/jobs",
      "Acme Robotics",
      fetcherReturning({
        ok: false,
        kind: "network",
        status: null,
        url: "https://boards-api.greenhouse.io/v1/boards/acmerobotics/jobs",
        reason: "Anti-bot challenge page returned instead of content.",
      }),
    );
    expect(verdict.outcome).toBe("rejected");
    expect(verdict.reason).toContain("could not read the board");
  });
});

// ── Module 11C-1: curated-alias awareness ──
//
// A company that legally renames itself posts under the NEW name, so a board
// naming only the new name used to read as "the content belongs to someone
// else". These use the project's REAL curated aliases (companyIdentity.ts),
// because the behaviour under test is precisely that those aliases are honoured
// — an invented fixture alias would prove nothing.
//
// The governing invariant, restated: aliases widen NAME evidence only. They can
// move a verdict rejected -> needs_review. They can never reach `accepted`
// without the employer's own domain, and they never touch the homonym
// protections, which key on URL evidence in server/company/homonyms.ts.

describe("evaluateBoardIdentity — curated aliases are honoured", () => {
  it("accepts Zomato's board when it posts as Eternal AND links zomato.com", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Zomato",
      boardText: `{"jobs":[{"title":"Backend Engineer","company":"Eternal Ltd","location":"Gurugram, India",
        "content":"Eternal is hiring across India. Apply at https://www.zomato.com/careers"}]}`,
      expectedDomain: "zomato.com",
    });
    expect(verdict.outcome).toBe("accepted");
    expect(verdict.autoRegisterable).toBe(true);
    expect(verdict.evidence.nameMentions).toBeGreaterThan(0);
  });

  it("accepts Fi Money's board when it posts as Epifi AND links fi.money", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Fi Money",
      boardText: `{"jobs":[{"title":"Android Engineer","company":"Epifi Technologies","location":"Bengaluru",
        "content":"Epifi builds the Fi app. More at https://fi.money/careers"}]}`,
      expectedDomain: "fi.money",
    });
    expect(verdict.outcome).toBe("accepted");
    expect(verdict.autoRegisterable).toBe(true);
  });

  it("counts an alias-only board as name evidence, without auto-registering it", () => {
    // The decisive case: alias recognised, but no independent domain signal.
    // Must land on needs_review — NOT accepted, and no longer a false reject.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Zomato",
      boardText: `{"jobs":[{"title":"Backend Engineer","company":"Eternal Ltd","location":"Gurugram, India"}]}`,
      expectedDomain: "zomato.com",
    });
    expect(verdict.outcome).toBe("needs_review");
    expect(verdict.autoRegisterable).toBe(false);
    expect(verdict.evidence.nameMentions).toBeGreaterThan(0);
  });

  it("still rejects a board that names neither the company nor any curated alias", () => {
    // The REAL production content of jobs.lever.co/eternal: a US athletic
    // performance company, not Zomato. Alias awareness must not rescue it.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Zomato",
      boardText: `{"jobs":[{"title":"Performance Technician - Open Interest - SF","location":"San Francisco, CA",
        "content":"We're always on the lookout for incredible people, and the athletes we serve."}]}`,
      expectedDomain: "zomato.com",
    });
    expect(verdict.outcome).toBe("rejected");
  });

  it("still rejects the real lever.co/epifi content, which belongs to Tetriz", () => {
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Fi Money",
      boardText: `{"jobs":[{"title":"Associate PMM","location":"Bangalore",
        "content":"About Tetriz. Tetriz helps engineering orgs become AI-native, faster."}]}`,
      expectedDomain: "fi.money",
    });
    expect(verdict.outcome).toBe("rejected");
  });

  it("does not treat a PARENT company's name as evidence for a subsidiary's board", () => {
    // Blinkit is Zomato-owned but hires separately; the alias set must not leak
    // the parent's name into the subsidiary's evidence.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Blinkit",
      boardText: `{"jobs":[{"company":"Zomato","title":"Backend Engineer"}]}`,
      expectedDomain: "blinkit.com",
    });
    expect(verdict.outcome).toBe("rejected");
  });

  it("leaves a company with no curated alias behaving exactly as before", () => {
    const named = evaluateBoardIdentity({
      expectedCompany: "Acme Robotics",
      boardText: ACME_BOARD,
      expectedDomain: "acmerobotics.com",
    });
    expect(named.outcome).toBe("accepted");

    const foreign = evaluateBoardIdentity({
      expectedCompany: "Acme Robotics",
      boardText: `{"jobs":[{"company":"Initech","title":"Analyst"}]}`,
      expectedDomain: "acmerobotics.com",
    });
    expect(foreign.outcome).toBe("rejected");
  });

  it("does not double-count overlapping variants of the same name", () => {
    // "Zomato" and the curated joined form "zomato eternal" both match this
    // text; longest-first alternation must count the span once.
    const verdict = evaluateBoardIdentity({
      expectedCompany: "Zomato",
      boardText: `Zomato Eternal`,
    });
    expect(verdict.evidence.nameMentions).toBe(1);
  });

  it("keeps rejecting the slug-coincidence boards Module 11B measured", () => {
    // Pine Labs' guessed slug served a Canadian real-estate agency.
    const pine = evaluateBoardIdentity({
      expectedCompany: "Pine Labs",
      boardText: `{"jobs":[{"company":"Pine Real Estate Group","title":"Listing Agent","location":"Calgary, AB"}]}`,
      expectedDomain: "pinelabs.com",
    });
    expect(pine.autoRegisterable).toBe(false);

    // Navi's guessed slug served a US startup: heavily named, still unproven.
    const navi = evaluateBoardIdentity({
      expectedCompany: "Navi",
      boardText: `Navi. Navi. Navi is hiring in Denver. Navi Navi Navi.`,
      expectedDomain: "navi.com",
    });
    expect(navi.outcome).toBe("needs_review");
    expect(navi.autoRegisterable).toBe(false);
  });
});
