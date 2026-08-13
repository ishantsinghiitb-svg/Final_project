import { describe, expect, it } from "vitest";
import { extractDomain, isJobBoardHost, resolveCanonicalCompany } from "./identity";

describe("resolveCanonicalCompany", () => {
  it("resolves the task's own worked example: legal-suffix/noise variants collapse to one canonical name", () => {
    // "Freshworks", "Freshworks Inc." and "Freshworks Careers" all reduce via
    // normalizeCompanyName's legal-suffix/noise stripping — same canonical
    // name, same normalizedKey.
    const a = resolveCanonicalCompany("Freshworks");
    const b = resolveCanonicalCompany("Freshworks Inc.");
    const c = resolveCanonicalCompany("Freshworks Careers");
    expect(a.canonicalName).toBe("Freshworks");
    expect(b.normalizedKey).toBe(a.normalizedKey);
    expect(c.normalizedKey).toBe(a.normalizedKey);
  });

  it("resolves a known curated rename (Module 10B.1.5 alias table) even from a scraped string", () => {
    const freshdesk = resolveCanonicalCompany("Freshdesk");
    const freshworks = resolveCanonicalCompany("Freshworks");
    expect(freshdesk.canonicalName).toBe("Freshworks");
    expect(freshdesk.normalizedKey).toBe(freshworks.normalizedKey);
  });

  it("resolves Zomato/Eternal the same way", () => {
    expect(resolveCanonicalCompany("Eternal Ltd").canonicalName).toBe("Zomato");
    expect(resolveCanonicalCompany("Eternal Ltd").normalizedKey).toBe(
      resolveCanonicalCompany("Zomato").normalizedKey,
    );
  });

  it("does NOT merge companies that only look similar (conservative by construction)", () => {
    // "Freshworks India" and "Freshworks Technologies" are not in either
    // curated alias table and are not legal-suffix/noise variants of
    // "Freshworks" — they must stay distinct rather than being guessed into
    // the same identity.
    const freshworks = resolveCanonicalCompany("Freshworks");
    const freshworksIndia = resolveCanonicalCompany("Freshworks India");
    expect(freshworksIndia.normalizedKey).not.toBe(freshworks.normalizedKey);
  });

  it("keeps two genuinely different companies distinct", () => {
    const a = resolveCanonicalCompany("Infosys");
    const b = resolveCanonicalCompany("Infosys BPM");
    expect(a.normalizedKey).not.toBe(b.normalizedKey);
  });

  it("is case/whitespace-insensitive for the same company", () => {
    expect(resolveCanonicalCompany("  freshworks  ").normalizedKey).toBe(
      resolveCanonicalCompany("Freshworks").normalizedKey,
    );
  });

  it("never returns an empty canonicalName/normalizedKey for non-empty input", () => {
    const result = resolveCanonicalCompany("Xyz Unknown Startup");
    expect(result.canonicalName).toBe("Xyz Unknown Startup");
    expect(result.normalizedKey).toBeTruthy();
  });

  it("attaches the extracted domain when a company URL is given", () => {
    expect(resolveCanonicalCompany("Acme", "https://www.acme.com/careers").domain).toBe("acme.com");
  });

  it("has a null domain when no URL is given", () => {
    expect(resolveCanonicalCompany("Acme").domain).toBeNull();
  });

  // ── Module 11C-1 ──
  it("gives a plain (non-homonym) company the same displayName as canonicalName", () => {
    // companies.name gets `displayName`, not `canonicalName` (see
    // company/homonyms.ts) — for the overwhelming majority of companies,
    // which are never homonyms, the two must be identical or every ordinary
    // company row would silently get a different name than before.
    const result = resolveCanonicalCompany("Freshdesk");
    expect(result.displayName).toBe(result.canonicalName);
    expect(result.displayName).toBe("Freshworks");
  });

  it("gives a homonym entity found via evidence its qualified displayName, not the bare canonicalName", () => {
    // The Slice US entity's canonicalName is plain "Slice" (what postings are
    // titled) but its displayName is qualified (what the companies row is
    // named) — the fix for the companies_name_unique 23505.
    const result = resolveCanonicalCompany("Slice", null, [
      "https://boards.greenhouse.io/slice",
      "https://slice.careers/careers-listing?gh_jid=1",
    ]);
    expect(result.canonicalName).toBe("Slice");
    expect(result.displayName).toBe("Slice (slice.careers)");
    expect(result.displayName).not.toBe(result.canonicalName);
  });
});

describe("extractDomain", () => {
  it("lowercases and strips a leading www.", () => {
    expect(extractDomain("https://WWW.Example.com/careers")).toBe("example.com");
  });

  it("adds a scheme when the input is bare", () => {
    expect(extractDomain("example.com/jobs")).toBe("example.com");
  });

  it("returns null for empty/missing input", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain(undefined)).toBeNull();
    expect(extractDomain("")).toBeNull();
    expect(extractDomain("   ")).toBeNull();
  });

  it("returns null rather than throwing for an unparseable URL", () => {
    expect(extractDomain("not a url at all ://")).toBeNull();
  });

  it("returns null for a single-label non-domain (no dot)", () => {
    // Found live in production: malformed company_url scrapes landing on
    // the bare word "search" or "company" — not a real, fetchable domain.
    expect(extractDomain("https://search")).toBeNull();
    expect(extractDomain("company")).toBeNull();
  });

  it("returns null for a known job-board host — never the board's own domain", () => {
    // company_url routinely points at a job board's page ABOUT the company,
    // not the company's own site (confirmed live: 107 of 145 production
    // companies had exactly this). Treating it as "the company's domain"
    // would show the BOARD's icon via the favicon fallback, not the
    // employer's — see logo.ts.
    expect(extractDomain("https://in.indeed.com/cmp/some-company")).toBeNull();
    expect(extractDomain("https://www.linkedin.com/company/acme")).toBeNull();
    expect(extractDomain("https://wellfound.com/company/acme")).toBeNull();
    expect(extractDomain("https://boards.greenhouse.io/acme")).toBeNull();
  });

  it("still resolves a genuine employer domain that happens to share a job-board word", () => {
    // Guards against an over-broad substring match — only an exact host or
    // real subdomain of a listed job board is excluded.
    expect(extractDomain("https://www.myindeedjob.example.com")).toBe("myindeedjob.example.com");
  });
});

describe("isJobBoardHost", () => {
  it("matches the exact host and any real subdomain of it", () => {
    expect(isJobBoardHost("indeed.com")).toBe(true);
    expect(isJobBoardHost("in.indeed.com")).toBe(true);
  });

  it("does not match a domain that merely contains the word", () => {
    expect(isJobBoardHost("myindeedjob.example.com")).toBe(false);
  });

  it("does not match an unrelated employer domain", () => {
    expect(isJobBoardHost("acme.com")).toBe(false);
  });
});
