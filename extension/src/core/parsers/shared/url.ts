/**
 * Site-agnostic canonical-URL resolution: prefer the page's own
 * `<link rel="canonical">`, else the current URL stripped of query/hash.
 * Internshala and Naukri each already inline this exact logic for their own
 * `sourceUrl`; this is the shared copy for parsers (the Generic Parser) that
 * don't have a site-specific reason to keep their own.
 */
export function canonicalUrl(document: Document, url: string): string {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim();
  if (canonical) return canonical;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}
