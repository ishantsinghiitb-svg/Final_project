// ── Module 10B.1: declared platform limitations ──
//
// Three of the six platforms in this phase's scope CANNOT be crawled reliably
// from a server. Each verdict below was reached by probing the live site, and
// the evidence is recorded next to it. The module's standing instruction is to
// report such a limitation rather than build a fragile workaround, so these
// platforms are REGISTERED (they appear in the admin UI and in crawl reports)
// but implemented as `BlockedPlatformAdapter`: selecting one produces an
// explicit, reasoned "not supported" entry in the crawl report instead of a
// silent zero-job run or an unstable scraper that breaks weekly.
//
// Making them registered-but-blocked rather than simply absent is the point:
// an operator who wonders "why is there no Wellfound data?" gets the answer
// from the product, and the day a platform ships a public API, the only change
// is swapping the adapter — the registry, orchestrator, report and UI are
// already wired for it.

export type PlatformLimitation = {
  platform: string;
  /** Human-facing platform name for the admin UI. */
  displayName: string;
  /** Why it cannot be crawled — shown verbatim in the crawl report. */
  reason: string;
  /** What was actually observed while probing, so a future revisit starts informed. */
  evidence: string;
  /** What would have to change for this platform to become supportable. */
  unblockedBy: string;
};

export const PLATFORM_LIMITATIONS: Record<string, PlatformLimitation> = {
  wellfound: {
    platform: "wellfound",
    displayName: "Wellfound",
    reason:
      "Protected by DataDome CAPTCHA and a Cloudflare browser challenge. Job listing and " +
      "detail pages are not reachable without executing the challenge JavaScript.",
    evidence:
      "GET /company/{slug}/jobs → HTTP 403 Cloudflare 'Just a moment...'; GET /sitemap.xml → " +
      "HTTP 403 DataDome interstitial (geo.captcha-delivery.com); GET /jobs → HTTP 200 but the " +
      "body is a Cloudflare Turnstile shim, not postings.",
    unblockedBy:
      "An official Wellfound partner/API credential, or a licensed data feed. Solving the " +
      "challenge with a headless browser would be an anti-bot circumvention, not an integration.",
  },
  foundit: {
    platform: "foundit",
    displayName: "Foundit",
    reason:
      "The only endpoint that returns job data is disallowed by Foundit's robots.txt, and the " +
      "publicly sanctioned job pages are blocked at the edge.",
    evidence:
      "GET /job/{slug}-{id} (URLs taken from Foundit's OWN todays-jobs sitemap) → HTTP 403 " +
      "'Access Denied'. The internal /middleware/jobsearch API does return full JSON, but " +
      "robots.txt contains 'Disallow: /middleware/' for User-agent: *, so crawling it would " +
      "violate the site's stated policy.",
    unblockedBy:
      "Foundit lifting the edge block on its sitemap-listed job pages, or granting API access. " +
      "The middleware API is deliberately NOT used despite working.",
  },
  iimjobs: {
    platform: "iimjobs",
    displayName: "IIMJobs",
    reason:
      "No job data is server-rendered. Both the job feed and individual job pages load their " +
      "content from a private API after page load, behind bot detection.",
    evidence:
      "GET /j/{slug}-{id} → HTTP 200, but the job title appears 0 times in the returned HTML; " +
      "__NEXT_DATA__ carries an empty jobMandateInfo and an initialState.botDetection block with " +
      "a captcha site-key slot. The feed API host (gladiator.iimjobs.com) returns 404 on every " +
      "unauthenticated path probed. robots.txt also sets Crawl-delay: 10.",
    unblockedBy:
      "A documented public API, or server-rendered job pages. A headless browser plus bot-detection " +
      "evasion is explicitly out of scope.",
  },
};

/** Platform tags this module knowingly does not crawl. */
export const BLOCKED_PLATFORMS = Object.keys(PLATFORM_LIMITATIONS);

export function getPlatformLimitation(platform: string): PlatformLimitation | undefined {
  return PLATFORM_LIMITATIONS[platform.toLowerCase()];
}
