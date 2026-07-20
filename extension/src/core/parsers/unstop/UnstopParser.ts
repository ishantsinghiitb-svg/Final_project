import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { classifyEmploymentTypeText } from "../shared/employmentType";
import { resolveImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { extractListAfterHeading } from "../shared/sections";
import { canonicalUrl } from "../shared/url";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, SalaryPeriod, UniversalJob, WorkMode } from "../types";
import {
  buildUnstopCanonicalUrl,
  extractUnstopJobId,
  isUnstopDetailUrl,
  isUnstopInternshipUrl,
  UNSTOP_SALARY_UNIT_MAP,
} from "./unstop.shared";
import { UNSTOP_CLOSED_PHRASES } from "./unstop.selectors";

type JsonLd = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const UNSTOP_PARSER_VERSION = "unstop-detail-1";

/**
 * Production Unstop job/internship-detail parser. Unstop (an Angular app with
 * hashed runtime classes) server-renders a complete `JobPosting` JSON-LD on
 * every detail page, so — like Foundit/Naukri — this reads that block for
 * essentially every field and never depends on brittle generated classes.
 *
 * ONE model, both opportunity kinds: a `/jobs/…` page and an `/internships/…`
 * page fill the exact same `UniversalJob`; the only kind-specific step is
 * stamping `employmentType = "Internship"` for internship URLs (the JSON-LD's
 * generic `PART_TIME`/`FULL_TIME` tag doesn't carry that), so the dashboard
 * never needs to know which kind produced the row.
 *
 * `tryParse` returns `null` on every non-detail URL (listing/home/etc.), so the
 * content script shows "no job detected" there; the listing pages are handled
 * separately by `UnstopListingParser`.
 */
export class UnstopParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;

    // URL-authoritative: only a single-opportunity detail page carries a job to
    // save. Listing/search/home pages have no `JobPosting` — bail so the panel
    // reads "no job detected" rather than risking a stray parse.
    if (!isUnstopDetailUrl(url)) return null;

    const jsonLd = this.findJsonLdByType(document, "JobPosting");
    if (!jsonLd) return null;

    const title = this.readString(jsonLd.title);
    const org = jsonLd.hiringOrganization as JsonLd | undefined;
    const companyName = this.readString(org?.name);

    if (!title || !companyName) {
      // JobPosting block present but not populated (still hydrating).
      return null;
    }

    const sourceUrl = this.readSourceUrl(jsonLd, document, url);
    const jobId =
      extractUnstopJobId(sourceUrl) ?? extractUnstopJobId(url) ?? this.readDomOppId(document);
    const location = this.readLocation(jsonLd);
    const salary = this.readSalary(jsonLd);
    const { text: description, html: descriptionHtml } = this.readDescription(jsonLd);
    const sections = this.readDescriptionSections(descriptionHtml);

    return createUniversalJob({
      source: SupportedSite.Unstop,
      parserVersion: UNSTOP_PARSER_VERSION,
      sourceJobId: jobId,
      title,
      companyName,
      companyLogoUrl: resolveImageUrl(this.readString(org?.logo), url),
      location: location.location,
      city: location.city,
      state: location.state,
      country: location.country,
      workMode: location.workMode,
      employmentType: this.readEmploymentType(jsonLd, url),
      experienceLevel: this.readExperience(jsonLd),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      responsibilities: sections.responsibilities,
      requirements: sections.requirements,
      preferredQualifications: sections.preferredQualifications,
      benefits: sections.benefits,
      skills: this.readSkills(jsonLd),
      industry: this.readIndustry(jsonLd),
      postedAt: this.readDate(jsonLd.datePosted),
      expiryDate: this.readDate(jsonLd.validThrough),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  /** Prefer the JSON-LD `url` (canonical), then `<link rel=canonical>`, then the page URL — normalized to the id-bearing form. */
  private readSourceUrl(jsonLd: JsonLd, document: Document, url: string): string {
    const jsonUrl = this.readString(jsonLd.url);
    const base = jsonUrl ?? canonicalUrl(document, url);
    const id = extractUnstopJobId(base) ?? extractUnstopJobId(url);
    return id ? buildUnstopCanonicalUrl(base, id) : base;
  }

  /** `#un-register-btn` carries `oppid-<id>` in its class list — a DOM fallback for the job id. */
  private readDomOppId(document: Document): string | null {
    const cls = document.querySelector("#un-register-btn")?.getAttribute("class") ?? "";
    return /\boppid-(\d+)\b/.exec(cls)?.[1] ?? null;
  }

  private readLocation(jsonLd: JsonLd): {
    location: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    workMode: WorkMode | null;
  } {
    let place = jsonLd.jobLocation as unknown;
    if (Array.isArray(place)) place = place[0];
    const address = (place as JsonLd | undefined)?.address as JsonLd | undefined;
    const city = this.readString(address?.addressLocality);
    const state = this.readString(address?.addressRegion);
    const country = this.readString(address?.addressCountry);
    const remote = (this.readString(jsonLd.jobLocationType) ?? "").toUpperCase() === "TELECOMMUTE";
    const parts = [city, state, country].filter((p): p is string => p !== null);
    return {
      location: parts.length > 0 ? parts.join(", ") : remote ? "Remote" : null,
      city: remote ? null : city,
      state,
      country,
      workMode: remote ? "Remote" : null,
    };
  }

  private readSalary(jsonLd: JsonLd): ReturnType<typeof parseSalary> {
    const base = jsonLd.baseSalary as JsonLd | undefined;
    const value = base?.value as JsonLd | undefined;
    const amount =
      typeof value?.value === "number" && Number.isFinite(value.value) ? value.value : null;
    const currency = this.readString(base?.currency);
    const unit = this.readString(value?.unitText);
    const period: SalaryPeriod | null = unit
      ? (UNSTOP_SALARY_UNIT_MAP[unit.toUpperCase()] ?? null)
      : null;

    if (amount === null) return parseSalary(null, currency);
    return {
      salaryMin: amount,
      salaryMax: null,
      salaryCurrency: currency,
      salaryPeriod: period,
      salaryText: null, // Normalizer synthesizes a display string from the numbers.
    };
  }

  private readDescription(jsonLd: JsonLd): { text: string | null; html: string | null } {
    const raw = this.readString(jsonLd.description);
    if (!raw) return { text: null, html: null };
    return { text: this.htmlToText(raw), html: sanitizeDescriptionHtml(raw) };
  }

  /** Recovers Responsibilities / Requirements / Preferred / Perks bullet lists from the sanitized description body. */
  private readDescriptionSections(html: string | null): {
    responsibilities: string[];
    requirements: string[];
    preferredQualifications: string[];
    benefits: string[];
  } {
    if (!html) {
      return { responsibilities: [], requirements: [], preferredQualifications: [], benefits: [] };
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    return {
      responsibilities: extractListAfterHeading(
        container,
        /responsibilit|what you.?ll (?:be )?do|key duties|the role/i,
      ),
      requirements: extractListAfterHeading(
        container,
        /requirement|qualification|skills? (?:and|&) qualification|who you are|eligibilit/i,
      ),
      preferredQualifications: extractListAfterHeading(
        container,
        /nice to have|preferred|good to have|bonus/i,
      ),
      benefits: extractListAfterHeading(container, /what we offer|perks|benefits|we offer/i),
    };
  }

  /** Internship URLs → "Internship"; otherwise map the JSON-LD `FULL_TIME`/`PART_TIME` tag. */
  private readEmploymentType(jsonLd: JsonLd, url: string): EmploymentType | null {
    if (isUnstopInternshipUrl(url)) return "Internship";
    const raw = jsonLd.employmentType;
    const value = Array.isArray(raw) ? raw[0] : raw;
    // schema.org uses "FULL_TIME"/"PART_TIME"; normalize the underscore for the
    // shared classifier (which expects a space/hyphen).
    return classifyEmploymentTypeText(typeof value === "string" ? value.replace(/_/g, " ") : null);
  }

  /** `experienceRequirements.monthsOfExperience` — a real number, never the literal "NaN". */
  private readExperience(jsonLd: JsonLd): string | null {
    const req = jsonLd.experienceRequirements as JsonLd | undefined;
    const raw = req?.monthsOfExperience;
    const months =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(months) || months <= 0) return null;
    return months % 12 === 0 ? `${months / 12} years` : `${months} months`;
  }

  private readSkills(jsonLd: JsonLd): string[] {
    const skills = jsonLd.skills;
    if (!Array.isArray(skills)) return [];
    const cleaned = skills
      .filter((s): s is string => typeof s === "string")
      .map((s) => this.cleanText(s))
      .filter((s) => s.length > 0);
    return Array.from(new Set(cleaned));
  }

  private readIndustry(jsonLd: JsonLd): string | null {
    const raw = jsonLd.industry;
    if (Array.isArray(raw)) {
      const joined = Array.from(
        new Set(
          raw
            .filter((s): s is string => typeof s === "string")
            .map((s) => this.cleanText(s))
            .filter((s) => s.length > 0 && !/^others?$/i.test(s)),
        ),
      ).join(", ");
      return joined || null;
    }
    return this.readString(raw);
  }

  private readIsClosed(document: Document, jsonLd: JsonLd): boolean {
    const iso = this.readDate(jsonLd.validThrough);
    if (iso && new Date(iso).getTime() < Date.now()) return true;
    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return UNSTOP_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? this.cleanText(value) : null;
  }

  private readDate(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}
