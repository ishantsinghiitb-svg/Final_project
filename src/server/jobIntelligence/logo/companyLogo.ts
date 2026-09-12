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
 * Company-logo candidates found in a rendered page, most specific first:
 *
 *   1. `itemprop="logo"`        — schema.org, unambiguously the organization's logo
 *   2. JSON-LD `hiringOrganization.logo` / `organization.logo`
 *   3. an `<img>` whose class or alt says "logo"
 *   4. `og:image` / `twitter:image` — only survives if it is not a known generic
 *
 * Returns candidates in order WITHOUT filtering, so callers can log what was
 * seen; use `pickCompanyLogo` to choose.
 */
export function collectLogoCandidatesFromHtml(html: string): string[] {
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

  // 3. A visible logo image.
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const classes = attr(tag, "class") ?? "";
    const alt = attr(tag, "alt") ?? "";
    if (!/logo/i.test(classes) && !/logo/i.test(alt)) continue;
    const src = attr(tag, "src") ?? attr(tag, "data-src");
    if (src) candidates.push(src);
  }

  // 4. Social preview images — last, because this is where the generics live.
  for (const property of ["og:image", "twitter:image"]) {
    const meta = html.match(
      new RegExp(`<meta[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`, "i"),
    );
    if (!meta) continue;
    const value = attr(meta[0], "content");
    if (value) candidates.push(value);
  }

  return candidates;
}

/** One-shot: the best company-specific logo in a page, or null. */
export function extractCompanyLogoFromHtml(html: string, baseUrl?: string | null): string | null {
  return pickCompanyLogo(collectLogoCandidatesFromHtml(html), baseUrl);
}
