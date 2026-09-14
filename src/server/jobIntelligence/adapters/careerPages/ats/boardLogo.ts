// ── Resolving one company logo per ATS board ──
//
// None of the six ATS posting APIs returns a company logo on the posting
// itself (verified live, 2026-09-12) — so a logo costs a request. It is
// resolved ONCE PER BOARD rather than once per posting: a 200-posting board
// gets one extra fetch, not two hundred, and every posting from that board
// shares the answer.
//
// The result is written onto the `AtsBoard` object AFTER the postings are
// fetched. Every `AtsPostingPayload` holds a reference to that same board
// object, so the pure `parsePosting` stage can read `payload.board.companyLogoUrl`
// without the Parser stage ever touching the network — which is Module 10A's
// rule (network lives in the Crawler stage and nowhere else).
//
// Per-provider strategy, each backed by a live observation:
//   workable        JSON  apply.workable.com/api/v1/accounts/{token} → `logo`
//                   (its og:image is workable.com/assets/facebook-preview.png —
//                   the same generic image for EVERY tenant, hence never HTML here)
//   greenhouse      HTML  job-boards.greenhouse.io/{token}   → og:image
//   lever           HTML  jobs.lever.co/{token}, falling back to a sample
//                         posting/apply page                → og:image
//   ashby           HTML  jobs.ashbyhq.com/{token}, falling back to a sample
//                         posting/apply page                → og:image, or a
//                         visible nav wordmark <img> matched to `companyName`
//   smartrecruiters HTML  a sample posting page              → itemprop="logo"
//                   (the board listing page redirects to the employer's own
//                   careers site and carries no logo markup)
//   recruitee       HTML  {token}.recruitee.com              → best effort
//
// Lever and Ashby fall back to a sample posting page (the run's own first
// fetched posting — never an extra request beyond what the board fetch
// already spent) because the board INDEX page does not always carry a
// company-specific image: a real Ashby board observed 2026-09-13 (Sarvam)
// has no og:image, no twitter:image, and no itemprop="logo" anywhere on the
// board page, while its individual posting/application pages render the
// employer's own nav wordmark image. `board.companyName` is passed through
// to `fetchHtmlLogo` for exactly that case: an identity-matched visible
// <img> (see `collectLogoCandidatesFromHtml`) recovers a genuine logo even
// with no reliable og:image anywhere.
//
// Every candidate still goes through `pickCompanyLogo`, so a platform that
// changes its markup to serve house artwork degrades to null rather than
// branding every employer with the ATS vendor's logo.

import type { CrawlFetcher } from "../../../crawl/HttpFetcher";
import {
  extractCompanyLogoFromHtml,
  normalizeLogoUrl,
  isGenericPlatformImage,
} from "../../../logo/companyLogo";
import type { AtsBoard } from "./types";

/** Resolved once per (provider, token) and reused for the process's lifetime. */
const cache = new Map<string, BoardIdentity>();

export type BoardIdentity = {
  companyLogoUrl: string | null;
  /** The employer's own website, when the platform exposes it (Workable does). */
  companyUrl: string | null;
};

const EMPTY: BoardIdentity = { companyLogoUrl: null, companyUrl: null };

/** Test seam — board identity is cached process-wide, so tests must be able to clear it. */
export function clearBoardLogoCache(): void {
  cache.clear();
}

function cacheKey(board: AtsBoard): string {
  return `${board.provider}:${board.token.toLowerCase()}`;
}

async function fetchHtmlLogo(
  url: string,
  fetcher: CrawlFetcher,
  companyName?: string | null,
): Promise<string | null> {
  const response = await fetcher.fetchText(url, { retries: 1 });
  if (!response.ok) return null;
  return extractCompanyLogoFromHtml(response.body, url, companyName);
}

/**
 * Falls back to a single posting's own page when the board-level page
 * yielded no logo. `samplePostingUrl` is only ever the FIRST posting fetched
 * for this board in this run (see `CareerPagesCrawler.fetchRawPostings`), so
 * this never costs more than the one extra request the board-level fetch
 * already spent — it is a fallback, not an additional per-provider strategy.
 */
async function fetchSamplePostingLogo(
  samplePostingUrl: string | null | undefined,
  fetcher: CrawlFetcher,
  companyName?: string | null,
): Promise<string | null> {
  if (!samplePostingUrl) return null;
  return fetchHtmlLogo(samplePostingUrl, fetcher, companyName);
}

/**
 * Workable's account endpoint — the ONLY company-specific image source on this
 * platform, and a free source of the employer's real website alongside it.
 */
async function resolveWorkable(board: AtsBoard, fetcher: CrawlFetcher): Promise<BoardIdentity> {
  const response = await fetcher.fetchText(
    `https://apply.workable.com/api/v1/accounts/${encodeURIComponent(board.token)}`,
    { accept: "application/json", retries: 1 },
  );
  if (!response.ok) return EMPTY;

  try {
    const body = JSON.parse(response.body) as { logo?: unknown; url?: unknown };
    const logo = typeof body.logo === "string" ? body.logo : null;
    const site = typeof body.url === "string" ? body.url : null;
    const normalizedLogo = normalizeLogoUrl(logo);
    return {
      companyLogoUrl:
        normalizedLogo && !isGenericPlatformImage(normalizedLogo) ? normalizedLogo : null,
      companyUrl: site && /^https?:\/\//i.test(site) ? site : null,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Resolves a board's company identity (logo, and website where available).
 *
 * `samplePostingUrl` is used only by SmartRecruiters, whose logo lives on a
 * posting page rather than a board page; passing it costs nothing for the
 * other providers.
 */
export async function resolveBoardIdentity(
  board: AtsBoard,
  fetcher: CrawlFetcher,
  samplePostingUrl?: string | null,
): Promise<BoardIdentity> {
  const key = cacheKey(board);
  const cached = cache.get(key);
  if (cached) return cached;

  let identity: BoardIdentity = EMPTY;

  try {
    switch (board.provider) {
      case "workable":
        identity = await resolveWorkable(board, fetcher);
        break;

      case "greenhouse":
        identity = {
          companyLogoUrl: await fetchHtmlLogo(
            `https://job-boards.greenhouse.io/${encodeURIComponent(board.token)}`,
            fetcher,
            board.companyName,
          ),
          companyUrl: null,
        };
        break;

      case "lever":
        identity = {
          companyLogoUrl:
            (await fetchHtmlLogo(
              `https://jobs.lever.co/${encodeURIComponent(board.token)}`,
              fetcher,
              board.companyName,
            )) ?? (await fetchSamplePostingLogo(samplePostingUrl, fetcher, board.companyName)),
          companyUrl: null,
        };
        break;

      case "ashby":
        // The board index page (jobs.ashbyhq.com/{token}) carries an og:image
        // on SOME boards but not all — a company-branded board with no
        // board-level social-preview image at all is a real, observed shape
        // (2026-09-13), not an edge case. When it yields nothing, fall back to
        // an individual posting/application page: Ashby always renders the
        // employer's own nav wordmark there, even with no reliable og:image
        // anywhere on the board (see the identity-match tier in
        // collectLogoCandidatesFromHtml).
        identity = {
          companyLogoUrl:
            (await fetchHtmlLogo(
              `https://jobs.ashbyhq.com/${encodeURIComponent(board.token)}`,
              fetcher,
              board.companyName,
            )) ?? (await fetchSamplePostingLogo(samplePostingUrl, fetcher, board.companyName)),
          companyUrl: null,
        };
        break;

      case "smartrecruiters":
        identity = samplePostingUrl
          ? {
              companyLogoUrl: await fetchHtmlLogo(samplePostingUrl, fetcher, board.companyName),
              companyUrl: null,
            }
          : EMPTY;
        break;

      case "recruitee":
        identity = {
          companyLogoUrl: await fetchHtmlLogo(
            `https://${encodeURIComponent(board.token)}.recruitee.com/`,
            fetcher,
            board.companyName,
          ),
          companyUrl: null,
        };
        break;

      // The JSON-LD fallback provider reads `hiringOrganization.logo` from the
      // posting itself, so there is nothing board-level to resolve.
      case "jsonld":
        identity = EMPTY;
        break;
    }
  } catch {
    // A logo is an enhancement, never a reason to fail a board's crawl.
    identity = EMPTY;
  }

  cache.set(key, identity);
  return identity;
}
