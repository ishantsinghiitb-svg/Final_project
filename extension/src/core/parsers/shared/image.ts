/**
 * Site-agnostic "read the real image URL off an `<img>`" helper, shared by the
 * dedicated board parsers (Internshala, Naukri) that need to pull a company
 * logo straight out of the live DOM.
 *
 * Mirrors the lazy-load handling the LinkedIn parser already relies on
 * (`structuredFields.firstImageUrl`) — the true URL can live in `src`, a
 * `data-*` lazy attribute, or the first `srcset` candidate — but stays free of
 * any LinkedIn-specific person/ghost-image heuristics so it can be reused as-is.
 * Data-URI and obvious placeholder/default images are skipped so a grey
 * placeholder is never persisted as if it were a real logo.
 */
const LAZY_SRC_ATTRS = ["src", "data-src", "data-original", "data-lazy-src", "data-delayed-url"];

const PLACEHOLDER_IMAGE_PATTERN =
  /ghost|placeholder|default[-_]?(logo|company|image)|company[-_]?default|no[-_]?image/i;

export function isPlaceholderImage(url: string): boolean {
  return url.startsWith("data:") || PLACEHOLDER_IMAGE_PATTERN.test(url);
}

/**
 * Best available image URL for a single `<img>` element (or `null`). Reads
 * `src` → lazy `data-*` attrs → first `srcset` candidate, skipping
 * placeholders. Accepts the element directly (callers already scope their own
 * `querySelector`) rather than a selector list, so it can never widen a
 * caller's intended scope.
 */
export function readImageUrl(el: Element | null | undefined): string | null {
  if (!el) return null;

  for (const attr of LAZY_SRC_ATTRS) {
    const value = el.getAttribute(attr)?.trim();
    if (value && !isPlaceholderImage(value)) return value;
  }

  const srcset = el.getAttribute("srcset")?.trim();
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    if (first && !isPlaceholderImage(first)) return first;
  }

  return null;
}
