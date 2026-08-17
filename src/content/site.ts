/**
 * Canonical site origin for absolute URLs (canonical links, og:url, JSON-LD).
 *
 * Deliberately NOT hardcoded to a guessed domain — this repo has no record of
 * the real production domain anywhere (checked README, package.json,
 * .env.example). Set VITE_SITE_URL in production to the real domain once it
 * is known; until then `absoluteUrl` degrades to a relative path, which is
 * still valid for a canonical link (resolves against the page's own URL) even
 * though it is not best-practice for og:url/JSON-LD.
 */
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "").replace(
  /\/$/,
  "",
);

/** Absolute URL when SITE_URL is configured, otherwise the path unchanged. */
export function absoluteUrl(path: string): string {
  return SITE_URL ? `${SITE_URL}${path}` : path;
}

/**
 * Per-page SEO meta (title/description/OG/Twitter) + canonical link, built
 * from one set of inputs so every public page emits the same shape instead
 * of hand-duplicated tag lists that can silently drift (e.g. og:url or a
 * twitter override quietly missing from one page but not another).
 */
export function pageSeo({
  path,
  title,
  description,
  ogDescription,
}: {
  /** Route path, e.g. "/features". Used for canonical + og:url. */
  path: string;
  title: string;
  description: string;
  /** Shorter/punchier variant for social cards. Falls back to `description`. */
  ogDescription?: string;
}) {
  const social = ogDescription ?? description;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: social },
      { property: "og:url", content: absoluteUrl(path) },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: social },
    ],
    links: [{ rel: "canonical", href: absoluteUrl(path) }],
  };
}
