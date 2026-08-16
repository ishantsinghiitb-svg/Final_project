import { CONTACT_EMAIL as CONTACT, contactHref } from "./contact";

/**
 * What the marketing site is allowed to claim about the Chrome extension.
 *
 * SOURCE OF TRUTH: the extension itself, not this file. A platform may only
 * appear here if BOTH of these hold in `extension/`:
 *
 *   1. `core/site-detection/SiteDetector.ts` resolves its host to a
 *      `SupportedSite` other than `Unsupported`, and
 *   2. `core/parsers/ParserRegistry.ts` registers a dedicated parser for that
 *      site.
 *
 * The ATS hosts that appear in `shared/constants.ts`'s
 * `JOB_BOARD_MATCH_PATTERNS` (Greenhouse, Lever, Ashby, Workday,
 * SmartRecruiters, Teamtailor, Workable, BambooHR, Recruitee, ApplyToJob) are
 * deliberately NOT listed here. Host permissions are staged there for parsers
 * that haven't shipped; today `SiteDetector` returns `Unsupported` for them and
 * the content script only renders the "not supported yet" state, so claiming
 * them on the website would be false.
 *
 * `src/content/extension.platforms.test.ts` reads the two extension files above
 * and fails if this list drifts from them.
 */
export type SupportedPlatform = {
  /** Display name used across the marketing site. */
  name: string;
  /** The `SupportedSite` enum member in the extension this maps to. */
  site: string;
  /** Short note on what the extension reads there. */
  note: string;
};

export const SUPPORTED_PLATFORMS: readonly SupportedPlatform[] = [
  { name: "LinkedIn", site: "LinkedIn", note: "Job posts and search results" },
  { name: "Naukri", site: "Naukri", note: "Job detail pages" },
  {
    name: "Internshala",
    site: "Internshala",
    note: "Internships and jobs, including listing pages",
  },
  { name: "Indeed", site: "Indeed", note: "Job detail and listing pages" },
  { name: "Unstop", site: "Unstop", note: "Jobs and internships" },
  { name: "Wellfound", site: "Wellfound", note: "Startup roles" },
  { name: "Foundit", site: "Foundit", note: "Job detail pages" },
] as const;

/** Comma-joined platform names for use in prose. */
export const SUPPORTED_PLATFORM_NAMES = SUPPORTED_PLATFORMS.map((p) => p.name);

// The address itself lives with the other contact plumbing (content/contact.ts)
// so that module has no dependency back on this one; re-exported here because
// most callers import it alongside the platform list.
export { CONTACT_EMAIL } from "./contact";

// ── Extension availability ──────────────────────────────────────────────────
//
// The single switch for how the whole site talks about getting the extension.
// Today it is not published (no listing, no extension key, no store URL exists
// anywhere in the repo), so every surface asks people to write in. When the
// listing goes live, set `EXTENSION_STORE_URL` and flip `EXTENSION_AVAILABILITY`
// to "live" — the CTA label, its destination, whether it opens in a new tab, and
// the supporting copy on the Extension page, FAQ and Contact page all follow
// from here. No component needs editing.

export type ExtensionAvailability = "early_access" | "live";

/** Flip to "live" when the Chrome Web Store listing is published. */
export const EXTENSION_AVAILABILITY: ExtensionAvailability = "early_access";

/**
 * Chrome Web Store listing. MUST be set before flipping availability to
 * "live" — `extensionCta()` throws in development if it isn't, so the site can
 * never ship a live CTA that points nowhere.
 */
export const EXTENSION_STORE_URL: string | null = null;

export type ExtensionCta = {
  label: string;
  href: string;
  /** true when the link leaves the site (store listing or mail client). */
  external: boolean;
  /** Short line shown under the CTA. */
  note: string;
};

export function isExtensionLive(): boolean {
  return EXTENSION_AVAILABILITY === "live" && Boolean(EXTENSION_STORE_URL);
}

/**
 * The primary "get the extension" action.
 *
 * @param context short phrase describing where the request came from, used to
 *                prefill the mail subject while still in early access.
 */
export function extensionCta(context = "extension access"): ExtensionCta {
  if (EXTENSION_AVAILABILITY === "live") {
    if (!EXTENSION_STORE_URL) {
      // Loud in development, harmless in production: fall through to the
      // early-access CTA rather than rendering a dead "Add to Chrome" button.
      if (import.meta.env.DEV) {
        console.error(
          "EXTENSION_AVAILABILITY is 'live' but EXTENSION_STORE_URL is not set. " +
            "Falling back to the early-access CTA.",
        );
      }
    } else {
      return {
        label: "Add to Chrome",
        href: EXTENSION_STORE_URL,
        external: true,
        note: "Free, and it works with the account you already have.",
      };
    }
  }

  return {
    label: "Request early access",
    // Same Gmail compose flow as every other contact CTA, so it works even
    // when the browser has no desktop mail client registered.
    href: contactHref({
      subject: context,
      body: [
        "Hi OfferLyst team,",
        "",
        "I'd like access to the Chrome extension.",
        "",
        "Browser:",
        "",
        "Thanks!",
      ].join("\n"),
    }),
    external: true,
    note: "Not on the Chrome Web Store yet. We will send you the build.",
  };
}

/** How the extension is obtained, in prose. Used by the FAQ and Extension page. */
export function extensionAccessSentence(): string {
  return isExtensionLive()
    ? "Install it from the Chrome Web Store, then sign in to OfferLyst once in the same browser."
    : `It is in early access and not on the Chrome Web Store yet. Write to ${CONTACT} and we will send you the build with install instructions.`;
}
