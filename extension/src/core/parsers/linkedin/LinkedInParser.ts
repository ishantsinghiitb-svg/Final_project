import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
import { createUniversalJob } from "../types";
import type {
  EmploymentType,
  HiringTeamMember,
  ParserContext,
  SalaryPeriod,
  UniversalJob,
  WorkMode,
} from "../types";
import { extractLinkedInJobIdFromUrl } from "./externalId";
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

/** Bumped when this parser's extraction logic changes materially. */
const LINKEDIN_PARSER_VERSION = "linkedin-1";

const SALARY_UNIT_MAP: Record<string, SalaryPeriod> = {
  HOUR: "Hourly",
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};

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
  state: string | null;
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
  tryParse(context: ParserContext): UniversalJob | null {
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

    // Extraction only — `remote`, the salary display string, parser confidence
    // and warnings are all derived later by JobNormalizer. Fields LinkedIn
    // doesn't expose (department, career URL, responsibilities/requirements,
    // technologies, languages) are left at their `null`/`[]` defaults, never
    // fabricated.
    return createUniversalJob({
      source: SupportedSite.LinkedIn,
      parserVersion: LINKEDIN_PARSER_VERSION,
      sourceJobId,
      title,
      companyName,
      companyLogoUrl: this.readCompanyLogo(document, jsonLd),
      companyUrl,
      location,
      city: locationParts.city,
      state: locationParts.state,
      country: locationParts.country,
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
      salaryPeriod: this.readSalaryPeriod(jsonLd),
      skills: this.readSkills(document),
      postedAt: this.readPostedAt(document, jsonLd),
      postedAgo: primarySegments.postedAgo,
      expiryDate: this.readExpiryDate(jsonLd),
      applicantCount: primarySegments.applicantCount,
      hiringTeam: this.readHiringTeam(document),
      companySize: this.readCompanySize(document),
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
    });
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

  /**
   * DOM first here — deliberately the opposite priority from most other
   * fields on this parser. The visible top-card's own company-name anchor is
   * read fresh from the CURRENT page on every parse, so it's always
   * this specific job's own company link. `hiringOrganization.sameAs` in
   * LinkedIn's JobPosting JSON-LD turned out to be an unreliable signal for
   * this one field — often generic or repeated across postings even though
   * `hiringOrganization.name` (a different field, used for the company NAME)
   * stayed correct — which was silently storing the same company URL (and,
   * via the favicon fallback in readCompanyLogo, the same wrong logo) for
   * nearly every job regardless of which company actually posted it. `sameAs`
   * is now only a fallback for when the DOM has no link at all.
   */
  private readCompanyUrl(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const domUrl = this.firstAttr(document, [...linkedInSelectors.companyName], "href");
    if (domUrl) return domUrl;

    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.sameAs === "string" && org.sameAs.trim()) return org.sameAs;

    return null;
  }

  /**
   * The company logo is read straight from the CURRENT job's top-card `<img>`
   * in the live DOM. LinkedIn serves it from media.licdn.com (…/company-logo_…)
   * and re-renders it for the selected job on every split-pane navigation, so
   * each parse captures THAT company's own `img.src` (via `src` → `data-src` →
   * other lazy-load attrs → `srcset`; placeholder/ghost images skipped). The
   * search is scoped to the `topCard` container so it can never pick up a
   * left-list item's logo, the global nav logo, or a previously-viewed job's
   * image — the reuse the previous fixes kept missing.
   *
   * Deliberately NO derived or page-level sources: `og:image` (a single stale
   * SPA `<meta>` tag), a favicon guessed from the company URL, and any
   * generated/fallback mark are all excluded — each produced the SAME image
   * for many companies. JSON-LD `hiringOrganization.logo` (a real per-company
   * URL, usually the same media.licdn.com asset) and the company-info panel
   * are the only non-top-card sources, tried only when the top card has no
   * logo `<img>` at all. Otherwise this returns `null` and the dashboard shows
   * a per-company initials avatar.
   */
  private readCompanyLogo(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const topCard = document.querySelector(linkedInSelectors.topCard.join(", "));
    const domLogo =
      (topCard ? firstImageUrl(topCard, linkedInSelectors.companyLogo) : null) ??
      firstImageUrl(document, linkedInSelectors.companyLogoStrict);
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

    const companyPageLogo = firstImageUrl(document, linkedInSelectors.companyPageLogo);
    if (companyPageLogo) return companyPageLogo;

    return null;
  }

  private readLocationParts(jsonLd: JsonLdJobPosting | null): LocationParts {
    const place = jsonLd?.jobLocation as Record<string, unknown> | undefined;
    const address = place?.address as Record<string, unknown> | undefined;
    if (!address) return { location: null, city: null, state: null, country: null };

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

    return { location, city, state: region, country };
  }

  private readSalaryPeriod(jsonLd: JsonLdJobPosting | null): SalaryPeriod | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = salary?.value as Record<string, unknown> | undefined;
    const unit = value?.unitText;
    if (typeof unit !== "string") return null;
    return SALARY_UNIT_MAP[unit.toUpperCase()] ?? null;
  }

  private readExpiryDate(jsonLd: JsonLdJobPosting | null): string | null {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return null;
  }

  /**
   * "Meet the hiring team" cards, when present. Scoped to the hirer/poster
   * cards (not any `/in/` link on the page) and de-duplicated by name. Often
   * empty — LinkedIn only shows this to signed-in users on some layouts.
   */
  private readHiringTeam(document: Document): HiringTeamMember[] {
    const cards = Array.from(
      document.querySelectorAll(linkedInSelectors.hiringTeamCards.join(", ")),
    );
    const members: HiringTeamMember[] = [];
    const seen = new Set<string>();

    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>("a[href*='/in/']");
      const name =
        (link ? this.cleanText(link.textContent ?? "") : "") ||
        this.firstText(card, [...linkedInSelectors.hiringTeamName]) ||
        "";
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      members.push({ name, profileUrl: link?.getAttribute("href") ?? null, role: null });
    }

    return members;
  }

  /** Extracts a "…employees" company-size phrase from the About-the-company region. */
  private readCompanySize(document: Document): string | null {
    for (const selector of linkedInSelectors.companyInfo) {
      const text = document.querySelector(selector)?.textContent ?? "";
      const match = /([\d,]+(?:\s*[-–]\s*[\d,]+)?\+?\s*employees)/i.exec(text);
      if (match) return this.cleanText(match[1]);
    }
    return null;
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
    const fromUrl = extractLinkedInJobIdFromUrl(url);
    if (fromUrl) return fromUrl;

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
