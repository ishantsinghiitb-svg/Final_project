import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { readImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, UniversalJob } from "../types";
import { NAUKRI_CLOSED_PHRASES, naukriSelectors } from "./naukri.selectors";

type JsonLd = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const NAUKRI_PARSER_VERSION = "naukri-1";

const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, EmploymentType]> = [
  [/full[\s-]?time/i, "Full-Time"],
  [/part[\s-]?time/i, "Part-Time"],
  [/temporary|temp\b/i, "Temporary"],
  [/freelance/i, "Freelance"],
  [/contract/i, "Contract"],
  [/intern/i, "Internship"],
];

/**
 * Production Naukri job-detail parser. Naukri embeds a rich, reliable JSON-LD
 * `JobPosting` server-side, so this reads it first for nearly everything (title,
 * company, logo, description, salary, skills, industry, department, employment
 * type, location, posted/expiry dates, external id) and drops to the DOM only
 * for the handful of fields JSON-LD omits — experience range, applicant count,
 * and the human "posted N days ago" string — using build-hash-resilient
 * `[class*='…']` selectors.
 */
export class NaukriJobParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;
    const jsonLd = this.findJsonLdByType(document, "JobPosting");

    const title =
      (typeof jsonLd?.title === "string" ? this.cleanText(jsonLd.title) : null) ||
      this.firstText(document, [...naukriSelectors.title]);
    const companyName = this.readCompanyName(document, jsonLd);

    if (!title || !companyName) {
      // No job-details DOM/JSON-LD present (or still loading).
      return null;
    }

    const { text: description, html: descriptionHtml } = this.readDescription(document, jsonLd);
    const location = this.readLocation(jsonLd, document);
    const salary = this.readSalary(document, jsonLd);
    const sourceUrl = this.readCanonicalUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Naukri,
      parserVersion: NAUKRI_PARSER_VERSION,
      sourceJobId: this.readSourceJobId(jsonLd, url),
      title,
      companyName,
      companyLogoUrl: this.readLogo(document, jsonLd),
      location,
      city: this.readCity(location),
      workMode: this.readWorkMode(jsonLd),
      employmentType: this.readEmploymentType(jsonLd),
      experienceLevel: this.readExperience(document),
      department: this.readString(jsonLd?.occupationalCategory),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      skills: this.readSkills(jsonLd),
      industry: this.readString(jsonLd?.industry),
      postedAt: this.readDate(jsonLd?.datePosted),
      postedAgo: this.readStat(document, /posted/i),
      expiryDate: this.readDate(jsonLd?.validThrough),
      applicantCount: this.readApplicantCount(document),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  private readCompanyName(document: Document, jsonLd: JsonLd | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.name === "string" && org.name.trim()) return this.cleanText(org.name);
    return this.firstText(document, [...naukriSelectors.companyName]);
  }

  private readLogo(document: Document, jsonLd: JsonLd | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.logo === "string" && org.logo.trim()) return org.logo.trim();

    for (const selector of naukriSelectors.companyLogo) {
      const url = readImageUrl(document.querySelector(selector));
      if (url) return url;
    }
    return null;
  }

  private readDescription(
    document: Document,
    jsonLd: JsonLd | null,
  ): { text: string | null; html: string | null } {
    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }

    for (const selector of naukriSelectors.description) {
      const el = document.querySelector(selector);
      if (el?.innerHTML?.trim()) {
        return {
          text: this.cleanText(el.textContent ?? ""),
          html: sanitizeDescriptionHtml(el.innerHTML),
        };
      }
    }
    return { text: null, html: null };
  }

  /** JSON-LD `jobLocation.address.addressLocality` (string or array), else the DOM chip. */
  private readLocation(jsonLd: JsonLd | null, document: Document): string | null {
    const place = jsonLd?.jobLocation as Record<string, unknown> | undefined;
    const address = place?.address as Record<string, unknown> | undefined;
    const locality = this.firstOf(address?.addressLocality);
    if (locality) return this.cleanText(locality);
    return this.firstText(document, [...naukriSelectors.location]);
  }

  private readCity(location: string | null): string | null {
    if (!location) return null;
    // Strip a trailing "(All Areas)"/"(Rural)" qualifier and any comma list.
    const city = location
      .replace(/\s*\(.*?\)\s*$/, "")
      .split(",")[0]
      ?.trim();
    return city || null;
  }

  private readWorkMode(jsonLd: JsonLd | null): "Remote" | "Hybrid" | "Onsite" | null {
    const raw =
      `${this.readString(jsonLd?.jobLocationType) ?? ""} ${this.readString(jsonLd?.title) ?? ""}`.toLowerCase();
    if (/telecommute|\bremote\b|work from home/.test(raw)) return "Remote";
    if (/hybrid/.test(raw)) return "Hybrid";
    return null;
  }

  private readEmploymentType(jsonLd: JsonLd | null): EmploymentType | null {
    const raw = this.readString(jsonLd?.employmentType);
    if (!raw) return null;
    for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
      if (pattern.test(raw)) return mapped;
    }
    return null;
  }

  private readSalary(document: Document, jsonLd: JsonLd | null): ReturnType<typeof parseSalary> {
    const base = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = base?.value as Record<string, unknown> | undefined;
    const currency = this.readString(base?.currency);
    const jsonSalary = this.readString(value?.value);

    const domSalary = this.firstText(document, [...naukriSelectors.salary]);
    return parseSalary(domSalary ?? jsonSalary, currency);
  }

  private readSkills(jsonLd: JsonLd | null): string[] {
    const skills = jsonLd?.skills;
    if (Array.isArray(skills)) {
      return skills.filter((s): s is string => typeof s === "string").map((s) => this.cleanText(s));
    }
    if (typeof skills === "string") {
      return skills
        .split(",")
        .map((s) => this.cleanText(s))
        .filter((s) => s.length > 0);
    }
    return [];
  }

  private readExperience(document: Document): string | null {
    return this.firstText(document, [...naukriSelectors.experience]);
  }

  /** Reads a labeled stat chip (Posted / Applicants / Openings) by its `<label>` text. */
  private readStat(document: Document, labelPattern: RegExp): string | null {
    const stats = document.querySelectorAll(naukriSelectors.stat.join(", "));
    for (const stat of stats) {
      const label = stat.querySelector("label")?.textContent ?? "";
      if (labelPattern.test(label)) {
        return this.cleanText(stat.querySelector("span")?.textContent ?? "") || null;
      }
    }
    return null;
  }

  private readApplicantCount(document: Document): number | null {
    const value = this.readStat(document, /applicant/i);
    if (!value) return null;
    const match = /\d[\d,]*/.exec(value);
    if (!match) return null;
    const n = Number.parseInt(match[0].replace(/,/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  private readSourceJobId(jsonLd: JsonLd | null, url: string): string | null {
    const identifier = jsonLd?.identifier as Record<string, unknown> | undefined;
    if (typeof identifier?.value === "string" && /^\d+$/.test(identifier.value.trim())) {
      return identifier.value.trim();
    }

    try {
      const path = new URL(url).pathname.replace(/\/$/, "");
      const match = /-(\d{6,})$/.exec(path);
      if (match) return match[1];
    } catch {
      // Not a parseable URL.
    }
    return null;
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
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()) return true;
    }
    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return NAUKRI_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private readDate(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private readString(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? this.cleanText(raw) : null;
  }

  private firstOf(raw: unknown): string | null {
    if (Array.isArray(raw)) {
      const first = raw.find((v) => typeof v === "string" && v.trim());
      return typeof first === "string" ? first : null;
    }
    return typeof raw === "string" && raw.trim() ? raw : null;
  }
}
