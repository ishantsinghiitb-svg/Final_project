// ── Module 10B.1.5: what counts as a VERIFIED source ──
//
// `verifySource` reports what a URL is. This module decides whether that is
// good enough to enable for crawling. The two are separate on purpose:
//
//   verifySource   — descriptive. "This board answered with 0 postings."
//   seedRules      — a policy judgement. "That is not enough to crawl on."
//
// The distinction matters because the same verdict means different things
// depending on how the URL was obtained:
//
//   An OPERATOR-REGISTERED board with no open roles is genuinely healthy —
//   a human asserted the URL and the company simply is not hiring today.
//
//   A board DISCOVERED by trying a candidate slug is a different matter. Some
//   ATS APIs answer 200 with an empty board for any slug whatsoever — verified
//   live against SmartRecruiters, where
//   `/v1/companies/<nonsense>/postings` returns `{"totalFound":0,"content":[]}`.
//   So for a guessed slug, only actual postings prove the board exists.
//
// These rules generated the registry seed, and the same rules are what an
// operator-facing "is this source good?" check should apply.

import type { SourceHealth, SourceVerification } from "./SourceVerifier";

/**
 * How many postings/job links a company-hosted careers page must show before
 * it counts as a jobs board. One match is almost always a navigation item
 * ("Careers" in a footer), not a listing.
 */
export const MIN_CUSTOM_PAGE_EVIDENCE = 3;

const CAREERS_PATH =
  /(career|job|opening|open-position|position|vacanc|recruit|hiring|work-with|join-us)/i;

/** True when a URL still looks like a careers destination. */
export function isCareersUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return CAREERS_PATH.test(parsed.pathname) || CAREERS_PATH.test(parsed.host);
  } catch {
    return false;
  }
}

/**
 * Whether a verification is strong enough to enable the source for crawling.
 *
 * Deliberately strict: the governing rule for this phase is that a company
 * marked UNKNOWN is better than a company pointed at a URL that only looked
 * like a jobs board.
 */
export function acceptsAsVerifiedSource(verification: SourceVerification): boolean {
  if (verification.health !== "HEALTHY" && verification.health !== "REDIRECTED") return false;

  const platform = verification.detectedPlatform;
  if (!platform) return false;

  if (platform !== "custom_careers") {
    return (verification.postingsSeen ?? 0) > 0;
  }

  // Judge where it LANDED, not where it was pointed: siemens.com/careers
  // redirects to /company/about, a page with plenty of links and no jobs.
  const landed = verification.finalUrl ?? verification.url;
  return (verification.postingsSeen ?? 0) >= MIN_CUSTOM_PAGE_EVIDENCE && isCareersUrl(landed);
}

/**
 * The health status actually stored for a source, after acceptance.
 *
 * A page that loaded fine but showed two job-ish links is reported HEALTHY by
 * `verifySource` — that is the honest DESCRIPTION of the fetch. But storing
 * HEALTHY on a row we then refuse to crawl produces a registry where "healthy"
 * and "enabled" disagree, and the first question an operator asks is "if it's
 * healthy, why isn't it running?".
 *
 * So a positive verdict that failed acceptance is downgraded to UNKNOWN — we
 * genuinely do not know that it is a jobs board. Real failures (BLOCKED,
 * BROKEN, UNAVAILABLE) keep their status: those are informative and actionable
 * exactly as reported.
 *
 * Invariant this establishes: health ∈ {HEALTHY, REDIRECTED} ⟺ crawlable.
 */
export function effectiveHealth(verification: SourceVerification): {
  health: SourceHealth;
  detectedPlatform: string | null;
  errorReason: string | null;
} {
  if (acceptsAsVerifiedSource(verification)) {
    return {
      health: verification.health,
      detectedPlatform: verification.detectedPlatform,
      errorReason: verification.errorReason,
    };
  }

  if (verification.health === "HEALTHY" || verification.health === "REDIRECTED") {
    return {
      health: "UNKNOWN",
      // Not confirmed as a jobs board, so we do not claim to know what it is.
      detectedPlatform: null,
      errorReason:
        "Reached, but no jobs board confirmed here — too few postings to be sure, " +
        "or the page redirected somewhere that is not a careers page.",
    };
  }

  return {
    health: verification.health,
    detectedPlatform: verification.detectedPlatform,
    errorReason: verification.errorReason,
  };
}
