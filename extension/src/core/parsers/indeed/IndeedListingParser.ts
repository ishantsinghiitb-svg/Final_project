import { SupportedSite } from "../../site-detection/types";
import type { ListingParser } from "../ListingParser";
import { parseSalary } from "../shared/salary";
import { createUniversalJob } from "../types";
import type { ParserContext, UniversalJob, WorkMode } from "../types";
import {
  buildIndeedCanonicalUrl,
  extractIndeedJobIdFromUrl,
  isIndeedJobId,
  normalizeIndeedSalaryText,
} from "./indeed.shared";
import { indeedSelectors } from "./indeed.selectors";

/** Bumped when this parser's extraction logic changes materially. */
const INDEED_LISTING_VERSION = "indeed-listing-1";

/**
 * Parses the "jobs for you"/search-result cards on Indeed's homepage and search
 * pages. Each card carries title, company, location and (usually) a salary
 * snippet — enough to seed a Global Job — and its title anchor's `data-jk` is
 * the SAME job key the detail page resolves to, so opening the job later
 * enriches this exact row via the existing COALESCE upsert (canonical
 * `sourceUrl = https://<host>/viewjob?jk=<jk>`) rather than duplicating it.
 *
 * `matches()` deliberately returns FALSE whenever the URL carries a `vjk`/`jk`
 * job key: on those URLs a single job is open and the content script must take
 * the detail-capture branch (`IndeedParser`) so the panel shows that job's
 * Save/Track CTAs. It returns true only on the bare listing/homepage URL, where
 * the right-hand pane may auto-preview an arbitrary job we must NOT present as
 * the user's choice — see the branch note in `content/index.ts`.
 */
export class IndeedListingParser implements ListingParser {
  /**
   * Indeed opens a selected job inline on the SAME listing URL (`/` + `?vjk=`)
   * via SPA navigation, so the content script must run `IndeedParser` alongside
   * this listing capture — otherwise clicking a job on the homepage would never
   * be detected (the one-time listing/detail dispatch would stay latched on
   * "listing"). See `ListingParser.detailOpensInline`.
   */
  readonly detailOpensInline = true;

  matches(context: ParserContext): boolean {
    // A job key in the URL means "a specific job is open" → detail flow owns it.
    if (extractIndeedJobIdFromUrl(context.url)) return false;
    return !!context.document.querySelector(indeedSelectors.listing.card);
  }

  findCards(root: ParentNode): Element[] {
    return Array.from(root.querySelectorAll(indeedSelectors.listing.card));
  }

  parseCard(card: Element, context: ParserContext): UniversalJob | null {
    const link = card.querySelector(indeedSelectors.listing.titleLink);
    const title =
      this.text(card, indeedSelectors.listing.titleText) ??
      (link ? this.collapse(link.getAttribute("aria-label")) : null);
    const companyName = this.text(card, indeedSelectors.listing.companyName);
    const sourceJobId = this.readCardJobId(card, link, context.url);

    if (!title || !companyName || !sourceJobId) {
      // Ad slot, "you might like" promo, or a malformed node — not a real card.
      return null;
    }

    const locationText = this.text(card, indeedSelectors.listing.location);
    const workMode: WorkMode | null =
      locationText && /^remote$/i.test(locationText)
        ? "Remote"
        : locationText && /hybrid/i.test(locationText)
          ? "Hybrid"
          : null;
    const salary = parseSalary(
      normalizeIndeedSalaryText(this.text(card, indeedSelectors.listing.salary)),
    );
    const sourceUrl = buildIndeedCanonicalUrl(sourceJobId, context.url);

    return createUniversalJob({
      source: SupportedSite.Indeed,
      parserVersion: INDEED_LISTING_VERSION,
      sourceJobId,
      title: this.stripJobPostSuffix(title),
      companyName,
      location: locationText,
      city: workMode === "Remote" ? null : locationText,
      workMode,
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      easyApply: !!card.querySelector(indeedSelectors.listing.easyApply),
      applyUrl: sourceUrl,
      sourceUrl,
    });
  }

  /**
   * The card's job key, in priority order: the title anchor's `data-jk`, the
   * `jk` param of its href, then the `jobTitle-<jk>` span id — all naming the
   * same key the detail page uses.
   */
  private readCardJobId(card: Element, link: Element | null, pageUrl: string): string | null {
    const dataJk = link?.getAttribute("data-jk")?.toLowerCase();
    if (isIndeedJobId(dataJk)) return dataJk;

    const href = link?.getAttribute("href");
    if (href) {
      const fromHref = extractIndeedJobIdFromUrl(this.absoluteUrl(href, pageUrl));
      if (fromHref) return fromHref;
    }

    const spanId = card.querySelector(indeedSelectors.listing.titleText)?.getAttribute("id");
    const fromSpan = spanId?.replace(/^jobTitle-/, "").toLowerCase();
    return isIndeedJobId(fromSpan) ? fromSpan : null;
  }

  /** The listing title span never carries " - job post", but strip it defensively to match the detail parser. */
  private stripJobPostSuffix(title: string): string {
    return this.collapse(title.replace(/\s*-\s*job post\s*$/i, "")) || title;
  }

  private text(root: ParentNode, selector: string): string | null {
    return this.collapse(root.querySelector(selector)?.textContent ?? null);
  }

  private collapse(text: string | null): string | null {
    const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  private absoluteUrl(href: string, base: string): string {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }
}
