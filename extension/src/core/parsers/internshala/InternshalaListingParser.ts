import { SupportedSite } from "../../site-detection/types";
import type { ListingParser } from "../ListingParser";
import { readImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { createUniversalJob } from "../types";
import type { ParserContext, UniversalJob } from "../types";
import { internshalaIcons, internshalaSelectors } from "./internshala.selectors";
import {
  classifyEmploymentType,
  classifyWorkMode,
  collapse,
  firstAttr,
  firstText,
  readInternshipId,
  valueForIcon,
} from "./internshala.shared";

/** Bumped when this parser's extraction logic changes materially. */
const INTERNSHALA_LISTING_VERSION = "internshala-listing-1";

/**
 * Parses individual cards on Internshala's search/listing pages. Each card
 * carries enough to seed a Global Job — title, company, logo, location,
 * salary/stipend, a short description, skills, posted-time — and emits the SAME
 * `source_job_id` (`internshipid`) the detail page will, so opening that job
 * later enriches this exact row rather than creating a new one.
 *
 * Extraction only. The content-script observer (`ListingCapture`) decides WHICH
 * cards get parsed (viewport visibility), parses each once, and dedupes before
 * syncing; this class just turns a single card element into a `UniversalJob`.
 * Handles both card layouts present in the reference DOM: the newer jobs-search
 * card (`.job-internship-name` / `.detail-row-1` / `.about_job`) and the older
 * card used elsewhere (`.profile` / `.internship_other_details_container`).
 */
export class InternshalaListingParser implements ListingParser {
  matches(context: ParserContext): boolean {
    const path = this.pathOf(context.url);
    if (/\/(?:internship|job)\/detail\//.test(path)) return false; // a detail page
    if (context.document.getElementById("internship_list_container")) return true;
    return /^\/(?:internships?|jobs|fresher-jobs|jobs-for-women|internships-for-women)/.test(path);
  }

  findCards(root: ParentNode): Element[] {
    const container = root.querySelector(internshalaSelectors.listing.container.join(", ")) ?? root;
    return Array.from(container.querySelectorAll(internshalaSelectors.listing.card.join(", ")));
  }

  parseCard(card: Element, context: ParserContext): UniversalJob | null {
    const l = internshalaSelectors.listing;

    const sourceJobId = readInternshipId(card);
    const title = firstText(card, l.titleNew) ?? firstText(card, l.titleOld);
    const companyName = firstText(card, l.companyNew) ?? firstText(card, l.companyOld);

    if (!title || !companyName || !sourceJobId) {
      // Not a real, identifiable card (ad slot, malformed node, …).
      return null;
    }

    const detailHref =
      card.getAttribute("data-href") ??
      firstAttr(card, [".job-title-href", ".view_detail_button", "a[href*='/detail/']"], "href");
    const sourceUrl = detailHref ? this.absoluteUrl(detailHref, context.url) : context.url;
    const internship = /\/internship\/detail\//.test(detailHref ?? "");

    const locationText = firstText(card, l.locationsNew) ?? firstText(card, l.locationOld);
    const hasHomeIcon = Boolean(card.querySelector(`.${internshalaIcons.wfh}`));
    const workMode = classifyWorkMode(locationText, hasHomeIcon);

    const salaryRaw =
      valueForIcon(card, internshalaIcons.money) ??
      firstText(card, l.stipendOld) ??
      firstText(card, l.salaryOld);
    const salary = parseSalary(salaryRaw);

    return createUniversalJob({
      source: SupportedSite.Internshala,
      parserVersion: INTERNSHALA_LISTING_VERSION,
      sourceJobId,
      title,
      companyName,
      companyLogoUrl: readImageUrl(card.querySelector(l.logo[0])),
      companyUrl: firstAttr(card, l.companyOld, "href"),
      location: locationText,
      city: this.readCity(locationText, workMode),
      workMode,
      employmentType: classifyEmploymentType({ internship, partTime: this.readPartTime(card) }),
      experienceLevel: internship ? null : valueForIcon(card, internshalaIcons.experience),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description: firstText(card, l.aboutSnippet),
      skills: this.readSkills(card),
      postedAgo: firstText(card, l.postedNew),
      applyUrl: sourceUrl,
      sourceUrl,
    });
  }

  private readSkills(card: Element): string[] {
    return Array.from(card.querySelectorAll(internshalaSelectors.listing.skillNew.join(", ")))
      .map((node) => collapse(node.textContent))
      .filter((text) => text.length > 0);
  }

  private readPartTime(card: Element): boolean {
    const labels = [...internshalaSelectors.listing.grayLabel, ...internshalaSelectors.listing.tag];
    return labels.some((selector) =>
      Array.from(card.querySelectorAll(selector)).some((el) =>
        /part[\s-]?time/i.test(el.textContent ?? ""),
      ),
    );
  }

  private readCity(location: string | null, workMode: string | null): string | null {
    if (!location || workMode === "Remote") return null;
    const first = location.split(",")[0]?.trim();
    return first && !/work from home/i.test(first) ? first : null;
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
