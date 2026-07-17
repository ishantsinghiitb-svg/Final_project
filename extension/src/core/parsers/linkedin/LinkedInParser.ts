import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
import type { EmploymentType, NormalizedJob, ParserContext, WorkMode } from "../types";
import { CLOSED_JOB_PHRASES, linkedInSelectors } from "./linkedin.selectors";
import { EMPLOYMENT_TYPE_PATTERNS, WORK_MODE_KEYWORDS } from "./patterns";
import { sanitizeDescriptionHtml } from "./sanitize";
import {
  firstImageUrl,
  isPlaceholderImageUrl,
  parseCriteriaList,
  parseFitLevelPreferences,
  parseJobInsightSegments,
  parsePrimaryDescriptionSegments,
  type FitLevelPreferences,
  type JobInsightSegments,
} from "./structuredFields";

type JsonLdJobPosting = Record<string, unknown>;

const EMPLOYMENT_TYPE_MAP: Record<string, EmploymentType> = {
  FULL_TIME: "Full-Time",
  PART_TIME: "Part-Time",
  CONTRACTOR: "Contract",
  TEMPORARY: "Temporary",
  INTERN: "Internship",
  INTERNSHIP: "Internship",
};

type LocationParts = {
  location: string | null;
  city: string | null;
  country: string | null;
};

type DescriptionParts = {
  text: string | null;
  html: string | null;
};

/**
 * Production LinkedIn parser. Tries JSON-LD (`JobPosting`) first, then falls
 * back to semantic/data attributes and, last, the class-name selectors in
 * `linkedin.selectors.ts`. Every field is read independently — nothing here
 * infers one field from another, and a missing field never blocks the rest.
 *
 * `tryParse` returns `null` whenever there is no valid job-details DOM to
 * read — no page-URL gating happens here, so this runs the same way on
 * /jobs/view/*, /jobs/search/* (split-pane), /jobs/collections/*, or any
 * future LinkedIn surface that renders the same job-details panel.
 */
export class LinkedInParser extends BaseParser {
  tryParse(context: ParserContext): NormalizedJob | null {
    const { document, url } = context;
    const jsonLd = this.findJsonLdByType(document, "JobPosting");

    const title = this.readTitle(document, jsonLd);
    const companyName = this.readCompanyName(document, jsonLd);

    if (!title || !companyName) {
      // No job selected / no job-details DOM present on this page right now.
      return null;
    }

    const { text: description, html: descriptionHtml } = this.readDescription(document, jsonLd);
    const sourceJobId = this.readSourceJobId(document, url, jsonLd);
    const sourceUrl = sourceJobId
      ? `https://www.linkedin.com/jobs/view/${sourceJobId}/`
      : this.stableUrl(url);

    const criteriaMap = parseCriteriaList(document);
    const criteriaText = this.readCriteriaText(document);
    const primarySegments = parsePrimaryDescriptionSegments(document);
    const insightSegments = parseJobInsightSegments(document);
    const fitPreferences = parseFitLevelPreferences(document);
    const companyUrl = this.readCompanyUrl(document, jsonLd);
    const locationParts = this.readLocationParts(jsonLd);
    const location =
      locationParts.location ??
      primarySegments.location ??
      this.firstText(document, [...linkedInSelectors.location]);

    const workMode = this.readWorkMode(fitPreferences, criteriaMap, insightSegments, criteriaText);

    return {
      source: SupportedSite.LinkedIn,
      sourceJobId,
      fingerprint: null,
      title,
      companyName,
      companyLogoUrl: this.readCompanyLogo(document, jsonLd, companyUrl),
      companyUrl,
      location,
      city: locationParts.city,
      country: locationParts.country,
      remote: workMode === "Remote",
      workMode,
      employmentType: this.readEmploymentType(
        jsonLd,
        fitPreferences,
        criteriaMap,
        insightSegments,
        criteriaText,
      ),
      experienceLevel: this.readExperienceLevel(criteriaMap, insightSegments, criteriaText),
      salaryMin: this.readSalary(jsonLd, "minValue"),
      salaryMax: this.readSalary(jsonLd, "maxValue"),
      salaryCurrency: this.readSalaryCurrency(jsonLd),
      skills: this.readSkills(document),
      postedAt: this.readPostedAt(document, jsonLd),
      postedAgo: primarySegments.postedAgo,
      applicantCount: primarySegments.applicantCount,
      hiringInsights: this.readHiringInsights(document),
      easyApply: this.readEasyApply(document),
      promoted: this.readPromoted(document),
      reposted: this.readReposted(document),
      responsesManaged: this.readResponsesManaged(document),
      industry: this.readIndustry(criteriaMap),
      jobFunction: this.readJobFunction(criteriaMap),
      benefits: this.readBenefits(document),
      description,
      descriptionHtml,
      applyUrl: this.readApplyUrl(document) ?? sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    };
  }

  private readTitle(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const fromJsonLd = typeof jsonLd?.title === "string" ? this.cleanText(jsonLd.title) : null;
    return fromJsonLd || this.firstText(document, [...linkedInSelectors.title]);
  }

  private readCompanyName(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const fromJsonLd = typeof org?.name === "string" ? this.cleanText(org.name) : null;
    return fromJsonLd || this.firstText(document, [...linkedInSelectors.companyName]);
  }

  private readCompanyUrl(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.sameAs === "string" && org.sameAs.trim()) return org.sameAs;
    return this.firstAttr(document, [...linkedInSelectors.companyName], "href");
  }

  /**
   * Fallback order: the top-card's own logo image (`src` → `data-src` →
   * other lazy-load attrs → `srcset`, placeholder/ghost images skipped) →
   * JSON-LD `hiringOrganization.logo` → OpenGraph image → a secondary
   * company-info DOM region → a favicon guess from the company URL's
   * origin. A generated-initials avatar is a display concern and stays in
   * the dashboard (`CompanyMark`) — this only needs to try hard before
   * giving up and returning `null`.
   */
  private readCompanyLogo(
    document: Document,
    jsonLd: JsonLdJobPosting | null,
    companyUrl: string | null,
  ): string | null {
    const domLogo = firstImageUrl(document, linkedInSelectors.companyLogo);
    if (domLogo) return domLogo;

    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const logo = org?.logo;
    if (typeof logo === "string" && !isPlaceholderImageUrl(logo)) return logo;
    if (
      logo &&
      typeof logo === "object" &&
      typeof (logo as Record<string, unknown>).url === "string" &&
      !isPlaceholderImageUrl((logo as Record<string, unknown>).url as string)
    ) {
      return (logo as Record<string, unknown>).url as string;
    }

    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    if (ogImage && !isPlaceholderImageUrl(ogImage)) return ogImage;

    const companyPageLogo = firstImageUrl(document, linkedInSelectors.companyPageLogo);
    if (companyPageLogo) return companyPageLogo;

    if (companyUrl) {
      try {
        return `${new URL(companyUrl).origin}/favicon.ico`;
      } catch {
        // Not a parseable URL — no favicon fallback available.
      }
    }

    return null;
  }

  private readLocationParts(jsonLd: JsonLdJobPosting | null): LocationParts {
    const place = jsonLd?.jobLocation as Record<string, unknown> | undefined;
    const address = place?.address as Record<string, unknown> | undefined;
    if (!address) return { location: null, city: null, country: null };

    const city =
      typeof address.addressLocality === "string"
        ? this.cleanText(address.addressLocality) || null
        : null;
    const region =
      typeof address.addressRegion === "string"
        ? this.cleanText(address.addressRegion) || null
        : null;
    const country =
      typeof address.addressCountry === "string"
        ? this.cleanText(address.addressCountry) || null
        : null;

    const parts = [city, region, country].filter((p): p is string => p !== null);
    const location = parts.length > 0 ? parts.join(", ") : null;

    return { location, city, country };
  }

  /**
   * Layered resolution, most-structured/reliable source first: the "fit &
   * preferences" row's own labeled chip (highest priority — LinkedIn's most
   * current layout) → JSON-LD → the labeled criteria list (`Employment type:
   * Full-time`) → the top insight pills (segmented independently, not a
   * shared blob) → a last-resort regex over the raw criteria text. Every
   * layer below the first is a fallback for layouts where the fit &
   * preferences row isn't present.
   */
  private readEmploymentType(
    jsonLd: JsonLdJobPosting | null,
    fitPreferences: FitLevelPreferences,
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): EmploymentType | null {
    if (fitPreferences.employmentType) return fitPreferences.employmentType;

    const raw = jsonLd?.employmentType;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (typeof key === "string" && EMPLOYMENT_TYPE_MAP[key.toUpperCase()]) {
      return EMPLOYMENT_TYPE_MAP[key.toUpperCase()];
    }

    const fromCriteria = criteriaMap.get("employment type");
    if (fromCriteria) {
      for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
        if (pattern.test(fromCriteria)) return mapped;
      }
    }

    if (insightSegments.employmentType) return insightSegments.employmentType;

    for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
      if (pattern.test(criteriaText)) return mapped;
    }

    return null;
  }

  /** Same layering as `readEmploymentType`, minus JSON-LD (LinkedIn's `JobPosting` doesn't carry seniority). */
  private readExperienceLevel(
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): string | null {
    const fromCriteria = criteriaMap.get("seniority level");
    if (fromCriteria) return fromCriteria;

    if (insightSegments.experienceLevel) return insightSegments.experienceLevel;

    const match = /seniority level\s*:?\s*([a-z\s-]+)/i.exec(criteriaText);
    return match
      ? this.cleanText(match[1]).replace(/\s+(employment|type|industries).*/i, "")
      : null;
  }

  private readIndustry(criteriaMap: Map<string, string>): string | null {
    return criteriaMap.get("industries") ?? criteriaMap.get("industry") ?? null;
  }

  private readJobFunction(criteriaMap: Map<string, string>): string | null {
    return criteriaMap.get("job function") ?? criteriaMap.get("job functions") ?? null;
  }

  /**
   * Workplace type (Remote/Hybrid/Onsite) almost never appears in the
   * labeled criteria list — the "fit & preferences" row's own chip is
   * checked first, then the top insight pills, before falling back to a
   * blob-wide keyword scan.
   */
  private readWorkMode(
    fitPreferences: FitLevelPreferences,
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): WorkMode | null {
    if (fitPreferences.workMode) return fitPreferences.workMode;

    const fromCriteria = criteriaMap.get("workplace type");
    if (fromCriteria) {
      for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
        if (pattern.test(fromCriteria)) return mode;
      }
    }

    if (insightSegments.workMode) return insightSegments.workMode;

    for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
      if (pattern.test(criteriaText)) return mode;
    }

    return null;
  }

  private readSalary(jsonLd: JsonLdJobPosting | null, key: "minValue" | "maxValue"): number | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = salary?.value as Record<string, unknown> | undefined;
    const raw = value?.[key];
    return typeof raw === "number" ? raw : null;
  }

  private readSalaryCurrency(jsonLd: JsonLdJobPosting | null): string | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    return typeof salary?.currency === "string" ? salary.currency : null;
  }

  private readSkills(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.skillItems);
  }

  private readHiringInsights(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.hiringInsights);
  }

  private readBenefits(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.benefits);
  }

  private readTextList(document: Document, selectors: readonly string[]): string[] {
    const nodes = Array.from(document.querySelectorAll(selectors.join(", ")));
    const values = nodes
      .map((node) => this.cleanText(node.textContent ?? ""))
      .filter((text) => text.length > 0);
    return Array.from(new Set(values));
  }

  private readEasyApply(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.easyApplyButton.join(", "))) return true;
    return /easy apply/i.test(document.body?.innerText ?? "");
  }

  private readPromoted(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.promotedIndicator.join(", "))) return true;
    const primaryText =
      this.firstText(document, [...linkedInSelectors.primaryDescriptionContainer]) ?? "";
    return /\bpromoted\b/i.test(primaryText);
  }

  private readReposted(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.repostedIndicator.join(", "))) return true;
    const primaryText =
      this.firstText(document, [...linkedInSelectors.primaryDescriptionContainer]) ?? "";
    return /\breposted\b/i.test(primaryText);
  }

  private readResponsesManaged(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.responsesManagedIndicator.join(", "))) {
      return true;
    }
    return /responses?\s+(are\s+)?managed\s+(off|outside)\s+linkedin/i.test(
      document.body?.innerText ?? "",
    );
  }

  private readPostedAt(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    if (typeof jsonLd?.datePosted === "string") {
      const parsed = new Date(jsonLd.datePosted);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    for (const selector of linkedInSelectors.postedTime) {
      const el = document.querySelector(selector);
      const datetime = el?.getAttribute("datetime");
      if (datetime) {
        const parsed = new Date(datetime);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
    }

    return null;
  }

  private readDescription(document: Document, jsonLd: JsonLdJobPosting | null): DescriptionParts {
    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }

    for (const selector of linkedInSelectors.description) {
      const el = document.querySelector(selector);
      if (el?.innerHTML && el.innerHTML.trim()) {
        return {
          text: this.cleanText(el.textContent ?? ""),
          html: sanitizeDescriptionHtml(el.innerHTML),
        };
      }
    }

    return { text: null, html: null };
  }

  private readApplyUrl(document: Document): string | null {
    return this.firstAttr(document, [...linkedInSelectors.applyLink], "href");
  }

  private readSourceJobId(
    document: Document,
    url: string,
    jsonLd: JsonLdJobPosting | null,
  ): string | null {
    const fromPath = /\/jobs\/view\/(\d+)/.exec(url);
    if (fromPath) return fromPath[1];

    try {
      const parsed = new URL(url);
      const currentJobId = parsed.searchParams.get("currentJobId");
      if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
    } catch {
      // Not a parseable URL — fall through to other strategies.
    }

    const identifier = jsonLd?.identifier as Record<string, unknown> | undefined;
    if (typeof identifier?.value === "string" && /^\d+$/.test(identifier.value)) {
      return identifier.value;
    }

    const dataJobId = document.querySelector("[data-job-id]")?.getAttribute("data-job-id");
    if (dataJobId && /^\d+$/.test(dataJobId)) return dataJobId;

    return null;
  }

  private readCriteriaText(document: Document): string {
    return Array.from(document.querySelectorAll(linkedInSelectors.criteriaItems.join(", ")))
      .map((node) => node.textContent ?? "")
      .join(" ");
  }

  private readIsClosed(document: Document, jsonLd: JsonLdJobPosting | null): boolean {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()) return true;
    }

    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return CLOSED_JOB_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private stableUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }
}
