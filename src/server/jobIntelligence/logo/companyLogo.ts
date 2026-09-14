// ── Company logo extraction ──
//
// Every crawled job should carry the employer's own logo. The trap this module
// exists to avoid is storing a PLATFORM's image instead: Workable's job pages
// advertise `og:image = https://www.workable.com/assets/facebook-preview.png`
// on every single account, and SmartRecruiters' pages carry
// `av-www.smartrecruiters.com/sr-logo/…/favicon.svg`. Both are valid-looking
// image URLs that would render as "every company's logo is Workable's logo".
//
// So extraction is two steps, always: gather candidates in order of how
// specific they are, then REJECT anything that matches a known-generic
// pattern. A company with no company-specific image ends up with null, which
// the UI already handles (initials avatar) — a wrong logo is worse than none.
//
// Evidence gathered live on 2026-09-12 against real boards:
//   greenhouse      job-boards.greenhouse.io/{token}  og:image →
//                   s101-recruiting.cdn.greenhouse.io/…/logos/…/160X40.png  ✅ company
//   lever           jobs.lever.co/{token}             og:image →
//                   lever-client-logos.s3.amazonaws.com/….png               ✅ company
//   smartrecruiters jobs.smartrecruiters.com/{tok}/{id}  itemprop="logo" →
//                   c.smartrecruiters.com/sr-company-logo-prod-…/huge       ✅ company
//   ashby           jobs.ashbyhq.com/{token}          og:image →
//                   app.ashbyhq.com/api/images/org-theme-logo/…png          ✅ company
//   workable        apply.workable.com/api/v1/accounts/{token} → `logo` →
//                   workablehr.s3.amazonaws.com/uploads/account/logo/…      ✅ company
//                   (its og:image is the generic one — never use it)

/**
 * URL fragments that identify a PLATFORM's own artwork rather than an
 * employer's. Matched case-insensitively against the whole URL.
 */
const GENERIC_IMAGE_PATTERNS: readonly RegExp[] = [
  // Observed generics, by platform. Every one of these was seen live on a
  // real posting page while building this (2026-09-12) — they are not
  // speculative.
  /workable\.com\/assets\//i,
  /workable\.com\/static\//i,
  /workable-application-form\.s3\.amazonaws\.com\/static\//i,
  /facebook-preview/i,
  /av-www\.smartrecruiters\.com\/sr-logo\//i,
  /smartrecruiters\.com\/.*\/winston\//i,
  /jobs\.lever\.co\/img\//i,
  /lever\.co\/static\//i,
  /lever-logo/i,
  /cdn\.ashbyprd\.com\/cdn_assets\//i,
  /static\.ashbyhq\.com\//i,
  /ashbyhq\.com\/assets\//i,
  /greenhouse\.io\/assets\//i,
  /recruitee\.com\/assets\//i,
  // Generic social-preview / placeholder artwork anywhere.
  /\bog[-_]?default\b/i,
  /\bdefault[-_]?og\b/i,
  /social[-_]?(share|preview|card)/i,
  /twitter[-_]?card/i,
  /share[-_]image/i,
  /\bplaceholder\b/i,
  /\bblank\.(gif|png)\b/i,
  /\bspacer\.(gif|png)\b/i,
  /\btransparent\.(gif|png)\b/i,
  /\b1x1\.(gif|png)\b/i,
  // Favicons and touch icons are platform chrome far more often than a logo.
  /favicon/i,
  /apple-touch-icon/i,
  /android-chrome/i,
  /mstile/i,
  // Google's favicon-by-domain service (see src/server/company/logo.ts) — a
  // legitimate fallback for `companies.logo_url` in its own dedicated
  // backfill script, but never a valid HTML extraction candidate: if it ever
  // shows up as a candidate here it means a caller mistakenly fed this
  // resolver an already-derived favicon URL rather than page content.
  /google\.com\/s2\/favicons/i,
  // ATS vendor "Powered by X" wordmarks — distinct from an employer's own
  // logo even when they sit in the same visual spot on the page.
  /powered[-_]?by[-_]?(ashby|lever|greenhouse|workable|smartrecruiters|recruitee)/i,
];

/** True when a URL is platform chrome or placeholder art rather than a company logo. */
export function isGenericPlatformImage(url: string | null | undefined): boolean {
  const value = (url ?? "").trim();
  if (!value) return true;
  return GENERIC_IMAGE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * A usable logo URL, or null.
 *
 * Only absolute http(s) URLs survive: the value is rendered directly by the
 * product and stored in `global_jobs.company_logo_url`, and the Validator
 * already nulls non-http(s) values — doing it here too means a bad candidate is
 * skipped in favour of the NEXT candidate rather than poisoning the result.
 * `data:` URIs are refused outright; they would bloat every row.
 */
export function normalizeLogoUrl(
  raw: string | null | undefined,
  baseUrl?: string | null,
): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.startsWith("data:")) return null;

  let absolute = value;
  if (value.startsWith("//")) {
    absolute = `https:${value}`;
  } else if (!/^https?:\/\//i.test(value)) {
    if (!baseUrl) return null;
    try {
      absolute = new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(absolute);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // HTML-escaped ampersands survive attribute extraction; the stored URL must
    // be the real one or the CDN rejects the request.
    return url.toString().replace(/&amp;/g, "&");
  } catch {
    return null;
  }
}

/** Picks the first candidate that is a real, company-specific image. */
export function pickCompanyLogo(
  candidates: Array<string | null | undefined>,
  baseUrl?: string | null,
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeLogoUrl(candidate, baseUrl);
    if (normalized && !isGenericPlatformImage(normalized)) return normalized;
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

/**
 * Loosely normalizes a company name for substring identity matching: strips
 * everything but letters/digits and lowercases. "Meesho" and "meesho-logo"
 * both normalize to a form where one contains the other. Deliberately
 * permissive — this is used to PREFER a candidate among several, never to
 * reject a candidate outright, so a loose match costs nothing on its own.
 */
function normalizeForIdentityMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when `haystack` (an alt/class attribute) plausibly names `companyName`.
 *
 * ⚠️ 2026-09-14 fix: checked in BOTH directions, not just "does the alt/class
 * text contain the company name". A logo's alt/class text is often SHORTER
 * than the company's full registered name (a brand wordmark says "Sarvam",
 * not "Sarvam AI"; a suffix like "Pvt Ltd"/"Inc"/"Technologies" is routine).
 * The one-directional version missed this: found live in the targeted Lever/
 * Ashby recovery crawl (2026-09-14) — Sarvam AI's own visible nav wordmark
 * (`alt="Sarvam"`) never matched `companyName="Sarvam AI"`, because "Sarvam"
 * does not CONTAIN "SarvamAI" as a substring, even though it obviously names
 * the same company. Checked in both directions, with a minimum length floor
 * on BOTH sides (not just the company name) so a short/generic alt or class
 * fragment can't trivially match everything.
 */
function looksLikeEmployerIdentity(haystack: string, companyName: string): boolean {
  const a = normalizeForIdentityMatch(haystack);
  const b = normalizeForIdentityMatch(companyName);
  if (a.length < 3 || b.length < 3) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Company-logo candidates found in a rendered page, most specific first:
 *
 *   1. `itemprop="logo"`        — schema.org, unambiguously the organization's logo
 *   2. JSON-LD `hiringOrganization.logo` / `organization.logo`
 *   3. an `<img>` whose alt/class names the employer (`companyName`), when known —
 *      e.g. Ashby's own nav wordmark `<img alt="Sarvam" class="_navLogoWordmarkImage_…">`
 *      names the company but never says "logo" in either attribute, so a
 *      generic "class or alt contains 'logo'" check alone would miss it
 *   4. an `<img>` whose class or alt says "logo" (no identity check — used when
 *      `companyName` isn't supplied, or as a second pass over images identity
 *      matching didn't already catch)
 *   5. `og:image` / `twitter:image` — only survives if it is not a known generic
 *
 * `companyName`, when supplied, is used ONLY to reorder/include tier-3
 * candidates ahead of the rest — it never widens what tier 5 (the social
 * preview meta tags) accepts, since there is no reliable way to check an
 * image's PIXELS against a name.
 *
 * Returns candidates in order WITHOUT filtering, so callers can log what was
 * seen; use `pickCompanyLogo` to choose.
 */
export function collectLogoCandidatesFromHtml(html: string, companyName?: string | null): string[] {
  const candidates: string[] = [];
  if (!html) return candidates;

  // 1. itemprop="logo" — either a content= attribute or an img src.
  for (const match of html.matchAll(/<[^>]*itemprop\s*=\s*["']logo["'][^>]*>/gi)) {
    const tag = match[0];
    const value = attr(tag, "content") ?? attr(tag, "src") ?? attr(tag, "href");
    if (value) candidates.push(value);
  }

  // 2. JSON-LD organization logo. Matched textually rather than by parsing
  //    every ld+json block: the blocks are frequently large, and a "logo" key
  //    inside one is always a logo URL.
  for (const match of html.matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"url"\s*:\s*"([^"]+)")/gi)) {
    const value = match[1] ?? match[2];
    if (value) candidates.push(value);
  }

  // 3 + 4. Visible images: an employer-identity match first, then a plain
  // "logo" substring match — read once, split into the two tiers below.
  const identityMatches: string[] = [];
  const genericLogoMatches: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const classes = attr(tag, "class") ?? "";
    const alt = attr(tag, "alt") ?? "";
    const src = attr(tag, "src") ?? attr(tag, "data-src");
    if (!src) continue;

    const isIdentityMatch =
      Boolean(companyName) &&
      (looksLikeEmployerIdentity(alt, companyName as string) ||
        looksLikeEmployerIdentity(classes, companyName as string));
    if (isIdentityMatch) {
      identityMatches.push(src);
      continue;
    }
    if (/logo/i.test(classes) || /logo/i.test(alt)) genericLogoMatches.push(src);
  }
  candidates.push(...identityMatches, ...genericLogoMatches);

  // 5. Social preview images.
  for (const property of ["og:image", "twitter:image"]) {
    const meta = html.match(
      new RegExp(`<meta[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`, "i"),
    );
    if (!meta) continue;
    const value = attr(meta[0], "content");
    if (value) candidates.push(value);
  }

  // 6. Embedded JSON/app-state logo fields — last resort, for boards that
  // render the visible logo entirely client-side. Ashby's board page is a
  // client-rendered SPA: the raw HTTP response has NO <img> tag anywhere
  // (confirmed live, 2026-09-14 — this class of page is why tiers 1-5 above
  // can legitimately all come back empty), but the bootstrap JSON embedded
  // in the page's own <script> tag carries the real logo URL under
  // `logoWordmarkImageUrl` regardless — that is where the genuine Sarvam
  // logo was actually found. Matched textually, the same way JSON-LD "logo"
  // is matched in tier 2, rather than parsing the whole state blob (which is
  // large and not JSON-LD shaped).
  for (const match of html.matchAll(
    /"(?:logoWordmarkImageUrl|logoSquareImageUrl|companyLogoUrl|organizationLogoUrl)"\s*:\s*"([^"]+)"/gi,
  )) {
    if (match[1]) candidates.push(match[1]);
  }

  return candidates;
}

/**
 * One-shot: the best company-specific logo in a page, or null.
 *
 * `companyName`, when supplied, only affects which VISIBLE `<img>` wins
 * among several candidates (see `collectLogoCandidatesFromHtml`) — it is
 * never required, and omitting it falls back to the plain "logo"
 * substring match this function has always used.
 */
export function extractCompanyLogoFromHtml(
  html: string,
  baseUrl?: string | null,
  companyName?: string | null,
): string | null {
  return pickCompanyLogo(collectLogoCandidatesFromHtml(html, companyName), baseUrl);
}
