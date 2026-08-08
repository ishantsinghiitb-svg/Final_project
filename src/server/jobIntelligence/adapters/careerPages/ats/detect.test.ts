import { describe, expect, it } from "vitest";
import { detectAtsBoard, isAtsProviderId, readCareerPagesConfig } from "./detect";

function board(url: string, config: unknown = {}) {
  const detection = detectAtsBoard(url, "Acme", config);
  if (!detection.ok) throw new Error(detection.reason);
  return detection.board;
}

describe("detectAtsBoard — host detection", () => {
  it.each([
    ["https://boards.greenhouse.io/stripe", "greenhouse", "stripe"],
    ["https://job-boards.greenhouse.io/figma", "greenhouse", "figma"],
    ["https://boards.eu.greenhouse.io/acme", "greenhouse", "acme"],
    ["https://boards-api.greenhouse.io/v1/boards/databricks/jobs", "greenhouse", "databricks"],
    ["https://jobs.lever.co/spotify", "lever", "spotify"],
    ["https://jobs.lever.co/spotify/some-post-id", "lever", "spotify"],
    ["https://jobs.ashbyhq.com/openai", "ashby", "openai"],
    ["https://careers.smartrecruiters.com/Visa", "smartrecruiters", "Visa"],
    ["https://api.smartrecruiters.com/v1/companies/Visa/postings", "smartrecruiters", "Visa"],
    ["https://apply.workable.com/acme/", "workable", "acme"],
    ["https://acme.recruitee.com/", "recruitee", "acme"],
  ])("%s → %s/%s", (url, provider, token) => {
    const resolved = board(url);
    expect(resolved.provider).toBe(provider);
    expect(resolved.token).toBe(token);
  });

  it("keeps the careers URL and company name verbatim", () => {
    const resolved = board("https://boards.greenhouse.io/stripe");
    expect(resolved.careersUrl).toBe("https://boards.greenhouse.io/stripe");
    expect(resolved.companyName).toBe("Acme");
  });

  it("falls back to the jsonld provider for an unknown host", () => {
    const resolved = board("https://acme.test/careers");
    expect(resolved.provider).toBe("jsonld");
    expect(resolved.token).toBe("acme.test");
  });

  it("reads a workable subdomain when there is no path token", () => {
    expect(board("https://acme.workable.com/").token).toBe("acme");
  });

  it("decodes a percent-encoded token", () => {
    expect(board("https://jobs.lever.co/a%20b").token).toBe("a b");
  });
});

describe("detectAtsBoard — failures", () => {
  it("rejects a non-URL", () => {
    const detection = detectAtsBoard("not a url", "Acme");
    expect(detection.ok).toBe(false);
    if (!detection.ok) expect(detection.reason).toMatch(/not a valid URL/i);
  });

  it("rejects a non-http protocol", () => {
    const detection = detectAtsBoard("ftp://a.test/x", "Acme");
    expect(detection.ok).toBe(false);
    if (!detection.ok) expect(detection.reason).toMatch(/http/i);
  });

  it("rejects a known ATS host with no board token", () => {
    const detection = detectAtsBoard("https://jobs.lever.co/", "Acme");
    expect(detection.ok).toBe(false);
    if (!detection.ok) expect(detection.reason).toMatch(/no board token/i);
  });
});

describe("detectAtsBoard — config overrides", () => {
  it("lets config.ats override host detection", () => {
    const resolved = board("https://careers.acme.test/openings", {
      ats: "greenhouse",
      boardToken: "acme",
    });
    expect(resolved.provider).toBe("greenhouse");
    expect(resolved.token).toBe("acme");
  });

  it("lets config.boardToken override a detected token", () => {
    expect(board("https://boards.greenhouse.io/wrong", { boardToken: "right" }).token).toBe(
      "right",
    );
  });

  it("fails when config.ats needs a token that cannot be derived", () => {
    const detection = detectAtsBoard("https://careers.acme.test/", "Acme", { ats: "greenhouse" });
    expect(detection.ok).toBe(false);
    if (!detection.ok) expect(detection.reason).toMatch(/config\.boardToken/);
  });

  it("allows config.ats jsonld with no token", () => {
    expect(board("https://acme.test/jobs", { ats: "jsonld" }).provider).toBe("jsonld");
  });

  it("ignores a malformed config rather than throwing", () => {
    expect(board("https://boards.greenhouse.io/stripe", null).provider).toBe("greenhouse");
    expect(board("https://boards.greenhouse.io/stripe", "nope").provider).toBe("greenhouse");
    expect(board("https://boards.greenhouse.io/stripe", { ats: "bogus" }).provider).toBe(
      "greenhouse",
    );
  });
});

describe("readCareerPagesConfig", () => {
  it("reads valid keys and drops the rest", () => {
    expect(readCareerPagesConfig({ ats: "lever", boardToken: " x ", other: 1 })).toEqual({
      ats: "lever",
      boardToken: "x",
    });
  });

  it("returns an empty object for non-objects", () => {
    expect(readCareerPagesConfig(null)).toEqual({});
    expect(readCareerPagesConfig([1, 2])).toEqual({});
  });

  it("drops an empty boardToken", () => {
    expect(readCareerPagesConfig({ boardToken: "   " }).boardToken).toBeUndefined();
  });
});

describe("isAtsProviderId", () => {
  it("accepts known providers and rejects others", () => {
    expect(isAtsProviderId("ashby")).toBe(true);
    expect(isAtsProviderId("workday")).toBe(false);
    expect(isAtsProviderId(7)).toBe(false);
  });
});
