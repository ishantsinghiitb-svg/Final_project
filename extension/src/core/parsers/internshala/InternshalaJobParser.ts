import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// The description sanitizer is a generic, security-critical HTML rebuilder — not
// LinkedIn-specific — so it's reused rather than duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { readImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { createUniversalJob } from "../types";
import type { ParserContext, UniversalJob } from "../types";
import {
  INTERNSHALA_CLOSED_PHRASES,
  internshalaIcons,
  internshalaSelectors,
} from "./internshala.selectors";
import {
  classifyEmploymentType,
  classifyWorkMode,
  collapse,
  firstAttr,
  firstText,
  isInternshipUrl,
  parseApplicantCount,
  parseInternshalaDate,
  readInternshipId,
} from "./internshala.shared";

type JsonLd = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const INTERNSHALA_PARSER_VERSION = "internshala-detail-1";

/**
 * Production Internshala detail-page parser (`/internship/detail/…`,
 * `/job/detail/…`). DOM-first — Internshala's class names are stable and
 * human-readable, and JSON-LD (`JobPosting`) is present on internships but not
 * guaranteed on every job page — with JSON-LD used only to enrich fields the
 * DOM doesn't expose (posted date, industry, salary currency, logo/expiry
 * fallbacks).
 *
 * `source_job_id` is the `internshipid` — the SAME id the listing card emits —
 * so opening a job whose card was already captured on the search page enriches
 * that existing Global Job row (COALESCE upsert, resolved by
 * source+source_job_id) instead of creating a second one.
 */
export class InternshalaJobParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;
    const d = internshalaSelectors.detail;

    const mainCard = this.firstElement(document, d.mainCard);
    const details = this.firstElement(document, d.details);
    const jsonLd = this.findJsonLdByType(document, "JobPosting");

    const title =
      firstText(document, d.title) ||
      (mainCard ? firstText(mainCard, d.profile) : null) ||
      (typeof jsonLd?.title === "string" ? collapse(jsonLd.title) : null);

    const companyName =
      (mainCard ? firstText(mainCard, d.companyName) : null) ||
      firstText(document, d.companyName) ||
      this.readOrgName(jsonLd);

    if (!title || !companyName) {
      // No job-details DOM present (or not finished loading).
      return null;
    }

    const scope: ParentNode = mainCard ?? document;
    const internship = isInternshipUrl(url);

    const locationEl =
      mainCard?.querySelector(d.location[0]) ?? document.querySelector(d.location[0]);
    const locationText = collapse(locationEl?.textContent) || null;
    const hasHomeIcon = Boolean(locationEl?.querySelector(`.${internshalaIcons.wfh}`));
    const workMode = classifyWorkMode(locationText, hasHomeIcon);

    const salaryRaw = firstText(scope, d.stipend) || firstText(scope, d.salary);
    const salary = parseSalary(salaryRaw, this.readSalaryCurrency(jsonLd));

    const { text: description, html: descriptionHtml } = this.readDescription(details, jsonLd);
    const sourceUrl = this.readCanonicalUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Internshala,
      parserVersion: INTERNSHALA_PARSER_VERSION,
      sourceJobId: readInternshipId(mainCard) ?? this.readAnyInternshipId(document),
      title,
      companyName,
      companyLogoUrl: this.readLogo(mainCard, jsonLd),
      companyUrl: this.readCompanyUrl(scope),
      companyCareerUrl: details ? firstAttr(details, d.companyWebsite, "href") : null,
      location: locationText,
      city: this.readCity(locationText, workMode),
      workMode,
      employmentType: classifyEmploymentType({ internship, partTime: this.readPartTime(mainCard) }),
      experienceLevel: internship ? null : firstText(scope, d.experience),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      requirements: details ? this.readRequirements(details) : [],
      skills: details ? this.readTabsAfter(details, d.skillsHeading) : [],
      benefits: details ? this.readTabsAfter(details, d.perksHeading) : [],
      industry: this.readIndustry(jsonLd),
      postedAt: this.readPostedAt(jsonLd),
      postedAgo: this.readPostedAgo(document),
      expiryDate: this.readExpiry(jsonLd, scope),
      applicantCount: parseApplicantCount(firstText(scope, d.applicants)),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  private readDescription(
    details: Element | null,
    jsonLd: JsonLd | null,
  ): { text: string | null; html: string | null } {
    if (details) {
      const heading = this.firstElement(details, internshalaSelectors.detail.aboutHeading);
      const container = heading?.nextElementSibling;
      if (container && container.classList.contains("text-container")) {
        const html = container.innerHTML?.trim();
        if (html) {
          return { text: collapse(container.textContent), html: sanitizeDescriptionHtml(html) };
        }
      }
    }

    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }

    return { text: null, html: null };
  }

  /** The `.round_tabs` chips of the container immediately following a section heading. */
  private readTabsAfter(details: Element, headingSelectors: readonly string[]): string[] {
    const heading = this.firstElement(details, headingSelectors);
    if (!heading) return [];

    let sibling = heading.nextElementSibling;
    while (sibling && !sibling.classList.contains("round_tabs_container")) {
      // Don't cross into the next section.
      if (sibling.classList.contains("section_heading")) return [];
      sibling = sibling.nextElementSibling;
    }
    if (!sibling) return [];

    return Array.from(sibling.querySelectorAll(".round_tabs"))
      .map((node) => collapse(node.textContent))
      .filter((text) => text.length > 0);
  }

  /** "Who can apply" eligibility bullets, with the "Only those…" intro and leading numbering stripped. */
  private readRequirements(details: Element): string[] {
    const container = this.firstElement(details, internshalaSelectors.detail.whoCanApply);
    if (!container) return [];

    return Array.from(container.querySelectorAll("p"))
      .map((node) => collapse(node.textContent))
      .filter((text) => text.length > 0 && !/^only those candidates/i.test(text))
      .map((text) => text.replace(/^\d+\.\s*/, "").trim())
      .filter((text) => text.length > 0);
  }

  private readLogo(mainCard: Element | null, jsonLd: JsonLd | null): string | null {
    const domLogo = readImageUrl(
      mainCard?.querySelector(internshalaSelectors.detail.companyLogo[0]),
    );
    if (domLogo) return domLogo;

    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.logo === "string" && org.logo.trim()) return org.logo.trim();
    return null;
  }

  private readCompanyUrl(scope: ParentNode): string | null {
    return firstAttr(scope, internshalaSelectors.detail.companyName, "href");
  }

  private readCity(location: string | null, workMode: string | null): string | null {
    if (!location || workMode === "Remote") return null;
    // Internshala shows a single city (or a comma list); the first token is the city.
    const first = location.split(",")[0]?.trim();
    return first && !/work from home/i.test(first) ? first : null;
  }

  private readPartTime(card: Element | null): boolean {
    if (!card) return false;
    return Array.from(card.querySelectorAll(".status, .status-li")).some((el) =>
      /part[\s-]?time/i.test(el.textContent ?? ""),
    );
  }

  private readIndustry(jsonLd: JsonLd | null): string | null {
    return typeof jsonLd?.industry === "string" ? collapse(jsonLd.industry) || null : null;
  }

  private readPostedAt(jsonLd: JsonLd | null): string | null {
    if (typeof jsonLd?.datePosted === "string") {
      const parsed = new Date(jsonLd.datePosted);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return null;
  }

  private readPostedAgo(document: Document): string | null {
    const text = firstText(document, internshalaSelectors.detail.postedStatus);
    return text ? text.replace(/^posted\s+/i, "").trim() || null : null;
  }

  private readExpiry(jsonLd: JsonLd | null, scope: ParentNode): string | null {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return parseInternshalaDate(firstText(scope, internshalaSelectors.detail.applyBy));
  }

  private readSalaryCurrency(jsonLd: JsonLd | null): string | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    return typeof salary?.currency === "string" ? salary.currency : null;
  }

  private readOrgName(jsonLd: JsonLd | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    return typeof org?.name === "string" ? collapse(org.name) || null : null;
  }

  private readAnyInternshipId(document: Document): string | null {
    return readInternshipId(document.querySelector(".individual_internship[internshipid]"));
  }

  private readCanonicalUrl(document: Document, url: string): string {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim();
    if (canonical) return canonical;
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  private readIsClosed(document: Document, jsonLd: JsonLd | null): boolean {
    const status = document.querySelector("#status")?.getAttribute("value")?.trim().toLowerCase();
    if (status && status !== "active") return true;

    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()) return true;
    }

    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return INTERNSHALA_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private firstElement(root: ParentNode, selectors: readonly string[]): Element | null {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }
}
