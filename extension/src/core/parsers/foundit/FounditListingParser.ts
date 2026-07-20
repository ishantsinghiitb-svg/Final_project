import { SupportedSite } from "../../site-detection/types";
import type { ListingParser } from "../ListingParser";
import { isPlaceholderImage, readImageUrl, resolveImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { createUniversalJob } from "../types";
import type { ParserContext, UniversalJob, WorkMode } from "../types";
import {
  extractFounditJobId,
  FOUNDIT_PLACEHOLDER_LOGO_PATTERN,
  normalizeIndianSalaryText,
} from "./foundit.shared";
import { FOUNDIT_LISTING_PATH_PATTERN, founditSelectors } from "./foundit.selectors";

/** Bumped when this parser's extraction logic changes materially. */
const FOUNDIT_LISTING_VERSION = "foundit-listing-1";

/**
 * Parses individual cards on Foundit's `/search/…` results pages. Each card
 * carries title, company, location, a detail-page link, experience, salary
 * and (usually) a logo — enough to seed a Global Job — and its detail-link
 * href ends in the SAME numeric id the detail page's own JSON-LD/URL
 * resolves to (`extractFounditJobId`), so opening the job later enriches
 * this exact row via the existing COALESCE upsert rather than duplicating it.
 */
export class FounditListingParser implements ListingParser {
  matches(context: ParserContext): boolean {
    if (context.document.querySelector(founditSelectors.listing.container[0])) return true;
    return FOUNDIT_LISTING_PATH_PATTERN.test(this.pathOf(context.url));
  }

  findCards(root: ParentNode): Element[] {
    const container = root.querySelector(founditSelectors.listing.container.join(", ")) ?? root;
    return Array.from(container.querySelectorAll(founditSelectors.listing.card.join(", ")));
  }

  parseCard(card: Element, context: ParserContext): UniversalJob | null {
    const l = founditSelectors.listing;

    const title = this.text(card, l.titleLink);
    const companyName = this.text(card, l.companyLink);
    const detailHref = this.attr(card, l.titleLink, "href");
    const sourceUrl = detailHref ? this.absoluteUrl(detailHref, context.url) : context.url;
    const sourceJobId = extractFounditJobId(sourceUrl);

    if (!title || !companyName || !sourceJobId) {
      // Not a real, identifiable card (ad slot, malformed node, …).
      return null;
    }

    const locationText = this.text(card, l.location);
    const workMode: WorkMode | null =
      locationText && /^remote$/i.test(locationText) ? "Remote" : null;

    const logoUrl = resolveImageUrl(readImageUrl(card.querySelector(l.logo[0])), context.url);
    const salaryRaw = normalizeIndianSalaryText(this.text(card, l.salary));
    const salary = parseSalary(salaryRaw);

    return createUniversalJob({
      source: SupportedSite.Foundit,
      parserVersion: FOUNDIT_LISTING_VERSION,
      sourceJobId,
      title,
      companyName,
      companyLogoUrl:
        logoUrl && !isPlaceholderImage(logoUrl) && !FOUNDIT_PLACEHOLDER_LOGO_PATTERN.test(logoUrl)
          ? logoUrl
          : null,
      companyUrl: this.attr(card, l.companyLink, "href"),
      location: locationText,
      city: workMode === "Remote" ? null : locationText,
      workMode,
      experienceLevel: this.text(card, l.experience),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      skills: this.readSkills(card),
      applyUrl: sourceUrl,
      sourceUrl,
    });
  }

  private readSkills(card: Element): string[] {
    const label = Array.from(card.querySelectorAll("p")).find((p) =>
      /^skills:?$/i.test(this.collapse(p.textContent)),
    );
    const container = label?.nextElementSibling;
    const text = (container?.textContent ?? "").replace(/\.\.\.$/, "");
    return text
      .split(",")
      .map((s) => this.collapse(s))
      .filter((s) => s.length > 0);
  }

  private text(root: ParentNode, selectors: readonly string[]): string | null {
    for (const selector of selectors) {
      const text = this.collapse(root.querySelector(selector)?.textContent ?? null);
      if (text) return text;
    }
    return null;
  }

  private attr(root: ParentNode, selectors: readonly string[], attr: string): string | null {
    for (const selector of selectors) {
      const value = root.querySelector(selector)?.getAttribute(attr)?.trim();
      if (value) return value;
    }
    return null;
  }

  private collapse(text: string | null): string {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  private absoluteUrl(href: string, base: string): string {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  private pathOf(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
}
