/**
 * Unstop is a server-rendered Angular app. Its runtime class names are hashed
 * (`_ngcontent-ng-c…`, `ng-star-inserted`) and MUST NOT be used as anchors.
 * Two stable, non-hashed surfaces are targeted instead:
 *
 *   • DETAIL pages embed a full `JobPosting` JSON-LD (`<script
 *     type="application/ld+json">`) plus a `<link rel="canonical">` — the
 *     primary, deploy-stable source, read via `BaseParser.findJsonLdByType`.
 *
 *   • LISTING pages render each card as schema.org microdata: an
 *     `<a itemprop="itemListElement">` whose `href` is the canonical detail
 *     URL, containing an `[itemprop="name"]` title. The card also carries a
 *     stable identity class `item opp_<id>` and `id="i_<id>_<n>"`. These
 *     `itemprop`/`item`/`opp_` hooks are Unstop's own semantic markup, not
 *     build-hashed classes.
 */
export const unstopSelectors = {
  detail: {
    /** The "Quick Apply" button; its class list carries `oppid-<id>` as a DOM id fallback. */
    applyButton: "#un-register-btn",
  },

  listing: {
    /** One schema.org ListItem anchor per result card (main SEO grid, not sidebar tiles). */
    card: 'a[itemprop="itemListElement"]',
    /** Card title — schema.org microdata, the most stable hook on the card. */
    title: '[itemprop="name"]',
    /** Company name sits in the caption block right under the title. */
    company: ".cptn .single-wrap",
    /** The chip row (opportunity type, work mode / location, experience). */
    chips: ".other_fields",
    /** Company logo (lazy Angular `<d2c-img>` wrapper → inner <img>). */
    logo: "d2c-img img",
  },
} as const;

/** Lower-cased body phrases that mean the posting is closed/expired. */
export const UNSTOP_CLOSED_PHRASES = [
  "registrations closed",
  "registration closed",
  "this opportunity is no longer accepting",
  "applications closed",
];
