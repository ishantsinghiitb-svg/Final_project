import { SupportedSite } from "../../site-detection/types";
import type { ListingParser } from "../ListingParser";
import { classifyEmploymentTypeText } from "../shared/employmentType";
import { readImageUrl, resolveImageUrl } from "../shared/image";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, UniversalJob, WorkMode } from "../types";
import {
  buildUnstopCanonicalUrl,
  extractUnstopJobId,
  isUnstopDetailUrl,
  isUnstopInternshipUrl,
  isUnstopListingUrl,
} from "./unstop.shared";
import { unstopSelectors } from "./unstop.selectors";

/** Bumped when this parser's extraction logic changes materially. */
const UNSTOP_LISTING_VERSION = "unstop-listing-1";

/**
 * Parses the result cards on Unstop's `/job` and `/internship` listing pages.
 * Each card is schema.org microdata — an `<a itemprop="itemListElement">` whose
 * `href` is the canonical detail URL — carrying enough for a discovery-quality
 * seed: title (`[itemprop=name]`), company, logo, work mode, employment type
 * and experience. Its trailing-id `href` resolves to the SAME `sourceJobId` the
 * detail page's JSON-LD does, so opening the opportunity later ENRICHES this
 * exact row (salary, description, deadline, skills, industry) via the existing
 * COALESCE upsert rather than duplicating it.
 *
 * `matches()` returns FALSE on detail URLs (`/jobs/…`, `/internships/…`) so a
 * single open opportunity always takes the `UnstopParser` detail flow. Cards
 * open in a new tab (`target="_blank"`), so the detail page always loads fresh
 * — there is no inline-open SPA shadow to guard against here.
 */
export class UnstopListingParser implements ListingParser {
  matches(context: ParserContext): boolean {
    if (isUnstopDetailUrl(context.url)) return false;
    if (!isUnstopListingUrl(context.url)) return false;
    return !!context.document.querySelector(unstopSelectors.listing.card);
  }

  findCards(root: ParentNode): Element[] {
    return Array.from(root.querySelectorAll(unstopSelectors.listing.card));
  }

  parseCard(card: Element, context: ParserContext): UniversalJob | null {
    const href = card.getAttribute("href");
    const detailUrl = href ? this.absoluteUrl(href, context.url) : null;

    // Only real opportunity cards (skip promo/sidebar anchors that aren't detail links).
    if (!detailUrl || !isUnstopDetailUrl(detailUrl)) return null;

    const title = this.text(card, unstopSelectors.listing.title);
    const companyName = this.text(card, unstopSelectors.listing.company);
    const sourceJobId = extractUnstopJobId(detailUrl);

    if (!title || !companyName || !sourceJobId) return null;

    const chips = this.readChips(card);
    const isInternship = isUnstopInternshipUrl(detailUrl);
    const sourceUrl = buildUnstopCanonicalUrl(detailUrl, sourceJobId);

    return createUniversalJob({
      source: SupportedSite.Unstop,
      parserVersion: UNSTOP_LISTING_VERSION,
      sourceJobId,
      title,
      companyName,
      companyLogoUrl: resolveImageUrl(
        readImageUrl(card.querySelector(unstopSelectors.listing.logo)),
        context.url,
      ),
      location: chips.location,
      city: chips.workMode === "Remote" ? null : chips.location,
      workMode: chips.workMode,
      employmentType: isInternship ? "Internship" : chips.employmentType,
      experienceLevel: chips.experience,
      applyUrl: sourceUrl,
      sourceUrl,
    });
  }

  /**
   * The chip row (`.other_fields span:not(.icon)`) mixes opportunity type, work
   * mode and experience in no fixed order, so each chip is classified by its OWN
   * text (an employment-type word, a work-mode phrase, an experience phrase),
   * never by position — anything unrecognized is treated as a location string.
   */
  private readChips(card: Element): {
    workMode: WorkMode | null;
    employmentType: EmploymentType | null;
    experience: string | null;
    location: string | null;
  } {
    const result: {
      workMode: WorkMode | null;
      employmentType: EmploymentType | null;
      experience: string | null;
      location: string | null;
    } = { workMode: null, employmentType: null, experience: null, location: null };

    const spans = card.querySelectorAll(`${unstopSelectors.listing.chips} span:not(.icon)`);
    for (const span of Array.from(spans)) {
      const text = this.collapse(span.textContent);
      if (!text) continue;

      if (!result.employmentType) {
        const mapped = classifyEmploymentTypeText(text);
        if (mapped) {
          result.employmentType = mapped;
          continue;
        }
      }
      if (
        !result.workMode &&
        /work from home|remote|hybrid|work from office|in office|on-?site/i.test(text)
      ) {
        result.workMode = /hybrid/i.test(text)
          ? "Hybrid"
          : /work from home|remote/i.test(text)
            ? "Remote"
            : "Onsite";
        continue;
      }
      if (!result.experience && /experience|fresher|year|month/i.test(text)) {
        result.experience = text;
        continue;
      }
      if (!result.location && !/^\+\d+$/.test(text)) {
        result.location = text;
      }
    }
    return result;
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
