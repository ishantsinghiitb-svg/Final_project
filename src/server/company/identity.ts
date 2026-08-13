// ── Module 11A: canonical company identity ──
//
// One company should resolve to ONE `companies` row no matter which job
// posting (or which platform) it was scraped from. This module answers "what
// is this scraped company string's canonical identity" by chaining two
// ALREADY-EXISTING, already-conservative normalizers rather than inventing a
// third:
//
//   1. `normalizeCompanyName` (Module 10A, normalize/company.ts) — strips
//      legal suffixes ("Inc", "Pvt Ltd", …) and careers-site noise words
//      ("Careers", "Recruiting", …), plus a small curated alias table
//      (Google Careers → Google). Its job is turning a scraped string into a
//      clean DISPLAY name.
//   2. `resolveCompanyIdentity` (Module 10B.1.5, crawl/registry/companyIdentity.ts)
//      — a curated table of real-world renames/aliases (Zomato/Eternal,
//      Freshdesk/Freshworks, …). Originally scoped to operator-typed registry
//      names, but for a plain (non-"A / B") string it is a pure alias lookup
//      that is equally valid applied to a scraped company name — this module
//      is its second caller.
//
// Deliberately conservative: no fuzzy/similarity merging. Two names that
// aren't linked by either table above stay two distinct companies — Module
// 11A's product requirement is "leave unresolved rather than guess".

import { normalizeCompanyName } from "@/server/jobIntelligence/normalize/company";
import {
  identityKey,
  resolveCompanyIdentity,
} from "@/server/jobIntelligence/crawl/registry/companyIdentity";
import { resolveHomonym } from "./homonyms";

export type CanonicalCompany = {
  /**
   * Clean, posting-facing name (never empty for non-empty input) — what a
   * job's `company_name` should read. For a homonym entity this MAY repeat
   * across entities in the same group (that is the definition of a homonym);
   * never write this to `companies.name`. See `displayName`.
   */
  canonicalName: string;
  /**
   * Module 11C-1. The name a `companies` ROW should be given
   * (`companies.name`) — MUST be globally unique (case-insensitively), which
   * `companies_name_unique` enforces in the database and
   * `validateHomonymTable()` enforces here for every declared homonym entity.
   * Equal to `canonicalName` for every non-homonym company, and for a homonym
   * entity except where its group would otherwise collide (see homonyms.ts).
   * Any caller that creates or renames a `companies` row — the admin/crawler
   * ingestion RPC payload, or an operator script — must write THIS, never
   * `canonicalName`, to that column.
   */
  displayName: string;
  /** Stable matching key — the `companies.normalized_key` conflict target. */
  normalizedKey: string;
  /** Lowercased, `www.`-stripped hostname, or null when no usable URL was given. */
  domain: string | null;
};

/**
 * Resolves a raw, platform-scraped company name (+ optional company URL) to
 * its canonical identity. Never throws; never returns an empty
 * `canonicalName`/`normalizedKey` for non-empty input.
 *
 * `evidenceUrls` (Module 11C-1) are other URLs the posting carries — its
 * source/apply/board links. They are consulted ONLY for names on the curated
 * homonym table (see homonyms.ts), where two real employers share a name and
 * name resolution alone would collapse them into one row. Omitting them
 * reproduces the pre-11C behaviour exactly for every other company, and even
 * for a homonym they only ever select between already-declared entities —
 * they can never invent one.
 */
export function resolveCanonicalCompany(
  rawName: string,
  companyUrl?: string | null,
  evidenceUrls?: readonly (string | null | undefined)[],
): CanonicalCompany {
  const cleaned = normalizeCompanyName(rawName).canonicalName || (rawName ?? "").trim();
  const identity = resolveCompanyIdentity(cleaned);
  const canonicalName = identity.canonicalName || cleaned || (rawName ?? "").trim();
  const normalizedKey = identityKey(canonicalName);

  // A proven homonym is only ever separated by non-name evidence. When the
  // evidence identifies exactly one declared entity, that entity's identity
  // wins — including its domain, which is `null` for an entity we have no
  // trusted domain for. Falling back to `extractDomain` there would be exactly
  // the guess this table exists to prevent.
  const entity = resolveHomonym(normalizedKey, [companyUrl, ...(evidenceUrls ?? [])]);
  if (entity) {
    return {
      canonicalName: entity.canonicalName,
      displayName: entity.displayName,
      normalizedKey: entity.normalizedKey,
      domain: entity.domain,
    };
  }

  return {
    canonicalName,
    displayName: canonicalName,
    normalizedKey,
    domain: extractDomain(companyUrl),
  };
}

// `company_url` as scraped by crawler adapters routinely points at a job
// board's OWN page ABOUT the employer (an Indeed company page, a Wellfound
// listing, an ATS-hosted board) rather than the employer's own website —
// confirmed live against production data during Module 11A activation: of
// 145 companies with a captured `company_url` domain, ZERO were a genuine
// employer domain; 107 were one of these hosts. Treating one of these as
// "the company's domain" is exactly how the domain-based logo fallback
// (src/server/company/logo.ts) would end up showing a DIFFERENT company's
// (or the job board's own) icon — so they are excluded here, at the source,
// rather than trusted and filtered downstream.
const JOB_BOARD_HOSTS = [
  "indeed.com",
  "linkedin.com",
  "naukri.com",
  "glassdoor.com",
  "wellfound.com",
  "angel.co",
  "internshala.com",
  "weworkremotely.com",
  "foundit.in",
  "unstop.com",
  "timesjobs.com",
  "monster.com",
  "monsterindia.com",
  "shine.com",
  // ATS/career-page hosting domains — the BOARD's domain, not the employer's.
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "recruitee.com",
  "smartrecruiters.com",
  // Module 11C-1: further ATS/aggregator hosts observed in stored posting URLs
  // during the 11C audit. Every one is a hiring platform serving many
  // employers, so its favicon is the PLATFORM's mark — e.g.
  // `cliqonnect.darwinbox.in` and `ambilio.zohorecruit.in` were both captured
  // as if they were employer sites. Adding a host here can only make
  // `extractDomain` return null more often, never a different domain.
  "myworkdayjobs.com",
  "workday.com",
  "zohorecruit.com",
  "zohorecruit.in",
  "keka.com",
  "darwinbox.com",
  "darwinbox.in",
  "jobvite.com",
  "icims.com",
  "successfactors.com",
  "taleo.net",
  "bamboohr.com",
  "freshteam.com",
  "hibob.com",
  "kula.ai",
  "rippling.com",
  "turbohire.co",
  "skillate.com",
  "peoplehum.com",
  "jobright.ai",
  "easyapply.jobs",
  "flexiple.com",
  "grapevine.in",
  "micro1.ai",
  "hirist.tech",
  "instahyre.com",
  "cutshort.io",
  "iimjobs.com",
  "apna.co",
  "ycombinator.com",
];

/** Exported for reuse by data-cleanup scripts validating an already-stored hostname. */
export function isJobBoardHost(hostname: string): boolean {
  return JOB_BOARD_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Lowercased, `www.`-stripped hostname from a company URL — but ONLY when it
 * plausibly belongs to the company's own site. Returns null for
 * empty/unparseable input, a single-label non-domain (no dot — e.g. a
 * malformed scrape landing on the literal string "search"), or a known job
 * board/ATS host. A bad `company_url` must never break company resolution,
 * and an excluded domain must never silently degrade to a WRONG one — it
 * degrades to `null` (no domain-based logo fallback for that company), which
 * is always safe.
 */
export function extractDomain(url?: string | null): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || !hostname.includes(".")) return null;
    if (isJobBoardHost(hostname)) return null;
    return hostname;
  } catch {
    return null;
  }
}
