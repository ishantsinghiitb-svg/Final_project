import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { isPlaceholderImage, readImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { canonicalUrl } from "../shared/url";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, SalaryPeriod, UniversalJob, WorkMode } from "../types";
import { GENERIC_CLOSED_PHRASES, genericSelectors } from "./generic.selectors";
import { hasHiringPageSignals } from "./hiringPageSignals";
import {
  EMPLOYMENT_TYPE_PATTERNS,
  SALARY_UNIT_MAP,
  SCHEMA_EMPLOYMENT_TYPE_MAP,
  WORK_MODE_KEYWORDS,
} from "./patterns";
import {
  readEmbeddedJobJson,
  readOpenGraphAndMeta,
  type EmbeddedJobFields,
  type MetaFields,
} from "./structuredData";

type JsonLd = Record<string, unknown>;

type LocationParts = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

/** Bumped when this parser's extraction logic changes materially. */
const GENERIC_PARSER_VERSION = "generic-1";

/**
 * Module 4C — the catch-all parser for any hiring page with no dedicated
 * parser: ATS-hosted boards (Greenhouse, Lever, Ashby, Workday,
 * SmartRecruiters, Teamtailor, Workable, BambooHR, Recruitee, ApplyToJob, …)
 * and company-run careers pages alike. `ParserRegistry` only ever hands this
 * out for `SupportedSite.Unsupported` — i.e. only once every dedicated
 * parser has already declined the host — so it can never override LinkedIn/
 * Internshala/Naukri/etc.
 *
 * Extraction ladder, richest/most-grounded source first: JSON-LD
 * `JobPosting` (via `BaseParser`) → OpenGraph/meta tags → a best-effort scan
 * of any embedded (non-JSON-LD) `<script type="application/json">` blob →
 * semantic/`itemprop`/`data-testid` DOM hooks → definition lists → generic
 * `[class*='…']` selectors — see `generic.selectors.ts`. Any field none of
 * these ground stays `null`/`[]`; nothing is ever inferred or guessed.
 *
 * `tryParse` returns `null` for two different reasons a caller may need to
 * tell apart (`content/index.ts` does, to choose between staying fully idle
 * and showing a "not supported yet" message): the page has no hiring-page
 * signals at all, or it has them but not enough grounded title/company to
 * call it a job. `isHiringPage` exposes the first check on its own so a
 * caller can make that distinction without re-implementing it.
 */
export class GenericParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;
    const jsonLd = this.findJsonLdByType(document, "JobPosting");

    if (!hasHiringPageSignals(document, url, jsonLd)) return null;

    const embedded = readEmbeddedJobJson(document);
    const meta = readOpenGraphAndMeta(document);
    const dl = this.readDefinitionList(document);

    const title = this.readTitle(document, jsonLd, embedded, meta);
    const companyName = this.readCompanyName(document, jsonLd, embedded, meta);

    if (!title || !companyName) {
      // Looks like a hiring page, but not enough grounded signal to call it
      // a specific job posting — never fabricated from a guess.
      return null;
    }

    const { text: description, html: descriptionHtml } = this.readDescription(
      document,
      jsonLd,
      embedded,
    );
    const locationParts = this.readLocationParts(document, jsonLd, dl);
    const salary = this.readSalary(document, jsonLd);
    const sourceUrl = canonicalUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Generic,
      parserVersion: GENERIC_PARSER_VERSION,
      sourceJobId: this.readSourceJobId(jsonLd, url),
      title,
      companyName,
      companyLogoUrl: this.readCompanyLogo(document, jsonLd),
      location: locationParts.location,
      city: locationParts.city,
      state: locationParts.state,
      country: locationParts.country,
      workMode: this.readWorkMode(document, jsonLd, dl),
      employmentType: this.readEmploymentType(document, jsonLd, dl),
      experienceLevel: this.readExperienceLevel(jsonLd, dl),
      department: this.readString(jsonLd?.occupationalCategory) ?? dl.get("department") ?? null,
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      responsibilities: this.readListField(jsonLd?.responsibilities, document, /responsibilit/i),
      requirements: this.readListField(
        jsonLd?.qualifications,
        document,
        /requirement|who you are|what you.?ll need/i,
      ),
      preferredQualifications: this.readListField(null, document, /preferred|nice to have|bonus/i),
      benefits: this.readListField(jsonLd?.jobBenefits, document, /benefit|perk/i),
      skills: this.readSkills(jsonLd),
      industry: this.readString(jsonLd?.industry) ?? dl.get("industry") ?? null,
      postedAt: this.readDate(jsonLd?.datePosted),
      expiryDate: this.readDate(jsonLd?.validThrough),
      applyUrl: this.readApplyUrl(document, sourceUrl) ?? sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  /** Same "does this look like a hiring page" gate `tryParse` uses, exposed for `content/index.ts`. */
  isHiringPage(context: ParserContext): boolean {
    const jsonLd = this.findJsonLdByType(context.document, "JobPosting");
    return hasHiringPageSignals(context.document, context.url, jsonLd);
  }

  private readTitle(
    document: Document,
    jsonLd: JsonLd | null,
    embedded: EmbeddedJobFields,
    meta: MetaFields,
  ): string | null {
    const fromJsonLd = typeof jsonLd?.title === "string" ? this.cleanText(jsonLd.title) : null;
    return (
      fromJsonLd ||
      (embedded.title && this.cleanText(embedded.title)) ||
      (meta.title && this.cleanText(meta.title)) ||
      this.firstText(document, [...genericSelectors.title])
    );
  }

  private readCompanyName(
    document: Document,
    jsonLd: JsonLd | null,
    embedded: EmbeddedJobFields,
    meta: MetaFields,
  ): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const fromJsonLd = typeof org?.name === "string" ? this.cleanText(org.name) : null;
    return (
      fromJsonLd ||
      (embedded.companyName && this.cleanText(embedded.companyName)) ||
      (meta.siteName && this.cleanText(meta.siteName)) ||
      this.firstText(document, [...genericSelectors.companyName])
    );
  }

  private readDescription(
    document: Document,
    jsonLd: JsonLd | null,
    embedded: EmbeddedJobFields,
  ): { text: string | null; html: string | null } {
    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }

    for (const selector of genericSelectors.description) {
      const el = document.querySelector(selector);
      const text = this.cleanText(el?.textContent ?? "");
      // `main`/`article` are broad last resorts — a short match is more
      // likely a nav/empty shell than a real description, so it's skipped
      // rather than persisted as if it were the whole job description.
      if (el?.innerHTML?.trim() && text.length > 60) {
        return { text, html: sanitizeDescriptionHtml(el.innerHTML) };
      }
    }

    if (embedded.description && embedded.description.length > 60) {
      return { text: this.cleanText(embedded.description), html: null };
    }

    return { text: null, html: null };
  }

  private readLocationParts(
    document: Document,
    jsonLd: JsonLd | null,
    dl: Map<string, string>,
  ): LocationParts {
    const rawPlace = jsonLd?.jobLocation;
    const place = Array.isArray(rawPlace) ? rawPlace[0] : rawPlace;
    const address = (place as Record<string, unknown> | undefined)?.address as
      Record<string, unknown> | undefined;

    if (address) {
      const city = this.readString(address.addressLocality);
      const state = this.readString(address.addressRegion);
      const country = this.readString(address.addressCountry);
      const parts = [city, state, country].filter((p): p is string => p !== null);
      if (parts.length > 0) return { location: parts.join(", "), city, state, country };
    }

    const fromDl = dl.get("location");
    if (fromDl) return { location: fromDl, city: null, state: null, country: null };

    const domText = this.firstText(document, [...genericSelectors.location]);
    return { location: domText, city: null, state: null, country: null };
  }

  /**
   * Deliberately conservative: only structured/labeled sources (JSON-LD,
   * a definition list, the location chip's own text), never a full-body
   * keyword scan — the description prose ("our remote-friendly team...")
   * mentioning "remote" doesn't mean THIS job is remote, and a wrong guess
   * here is worse than leaving it `null`.
   */
  private readWorkMode(
    document: Document,
    jsonLd: JsonLd | null,
    dl: Map<string, string>,
  ): WorkMode | null {
    const raw = jsonLd?.jobLocationType;
    const rawStr = Array.isArray(raw) ? raw[0] : raw;
    if (typeof rawStr === "string" && /telecommute/i.test(rawStr)) return "Remote";

    const fromDl =
      dl.get("work mode") ??
      dl.get("workplace type") ??
      dl.get("location type") ??
      dl.get("work type");
    if (fromDl) {
      for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
        if (pattern.test(fromDl)) return mode;
      }
    }

    const locationText = this.firstText(document, [...genericSelectors.location]) ?? "";
    for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
      if (pattern.test(locationText)) return mode;
    }

    return null;
  }

  private readEmploymentType(
    document: Document,
    jsonLd: JsonLd | null,
    dl: Map<string, string>,
  ): EmploymentType | null {
    const raw = jsonLd?.employmentType;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (typeof key === "string") {
      const normalized = key.toUpperCase().replace(/[\s-]/g, "_");
      const mapped = SCHEMA_EMPLOYMENT_TYPE_MAP[normalized];
      if (mapped) return mapped;
      for (const [pattern, type] of EMPLOYMENT_TYPE_PATTERNS) {
        if (pattern.test(key)) return type;
      }
    }

    const fromDl = dl.get("employment type") ?? dl.get("job type");
    if (fromDl) {
      for (const [pattern, type] of EMPLOYMENT_TYPE_PATTERNS) {
        if (pattern.test(fromDl)) return type;
      }
    }

    const domText = this.firstText(document, [...genericSelectors.employmentType]);
    if (domText) {
      for (const [pattern, type] of EMPLOYMENT_TYPE_PATTERNS) {
        if (pattern.test(domText)) return type;
      }
    }

    return null;
  }

  private readExperienceLevel(jsonLd: JsonLd | null, dl: Map<string, string>): string | null {
    const raw = jsonLd?.experienceRequirements;
    if (typeof raw === "string" && raw.trim()) return this.cleanText(raw);
    return dl.get("experience") ?? dl.get("experience level") ?? dl.get("seniority level") ?? null;
  }

  /**
   * Structured JSON-LD `minValue`/`maxValue`/`value` numbers are trusted
   * directly as `salaryMin`/`salaryMax` — mirroring `LinkedInParser`, which
   * does the same rather than re-stringifying them through `parseSalary`
   * (a free-text parser meant for a human-written display string, not a
   * number the caller already has). `salaryText` is left `null` in that case
   * so `JobNormalizer` synthesizes a properly formatted one, instead of this
   * parser handing it a bare "2500000-3500000" that would then block that
   * synthesis (`JobNormalizer` only fills `salaryText` when it's empty).
   * Only genuinely unstructured text — the DOM chip, or a rare `value.value`
   * that's itself a string — goes through `parseSalary`.
   */
  private readSalary(document: Document, jsonLd: JsonLd | null): ReturnType<typeof parseSalary> {
    const base = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = base?.value as Record<string, unknown> | undefined;
    const currency = this.readString(base?.currency);
    const period = this.readSalaryPeriod(value);

    if (value) {
      const min = typeof value.minValue === "number" ? value.minValue : null;
      const max = typeof value.maxValue === "number" ? value.maxValue : null;
      if (min !== null || max !== null) {
        return {
          salaryMin: min,
          salaryMax: max,
          salaryCurrency: currency,
          salaryPeriod: period,
          salaryText: null,
        };
      }
      if (typeof value.value === "number") {
        return {
          salaryMin: value.value,
          salaryMax: value.value,
          salaryCurrency: currency,
          salaryPeriod: period,
          salaryText: null,
        };
      }
      if (typeof value.value === "string" && value.value.trim()) {
        return parseSalary(value.value, currency);
      }
    }

    const domSalary = this.firstText(document, [...genericSelectors.salary]);
    return parseSalary(domSalary, currency);
  }

  private readSalaryPeriod(value: Record<string, unknown> | undefined): SalaryPeriod | null {
    const unit = value?.unitText;
    return typeof unit === "string" ? (SALARY_UNIT_MAP[unit.toUpperCase()] ?? null) : null;
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

  private readCompanyLogo(document: Document, jsonLd: JsonLd | null): string | null {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const logo = org?.logo;
    if (typeof logo === "string" && logo.trim() && !isPlaceholderImage(logo)) return logo.trim();
    if (logo && typeof logo === "object") {
      const logoUrl = (logo as Record<string, unknown>).url;
      if (typeof logoUrl === "string" && logoUrl.trim() && !isPlaceholderImage(logoUrl)) {
        return logoUrl.trim();
      }
    }

    for (const selector of genericSelectors.companyLogo) {
      const url = readImageUrl(document.querySelector(selector));
      if (url) return url;
    }
    return null;
  }

  private readApplyUrl(document: Document, sourceUrl: string): string | null {
    const el = document.querySelector<HTMLAnchorElement>(genericSelectors.applyLink.join(", "));
    const href = el?.getAttribute("href")?.trim();
    if (!href) return null;
    try {
      return new URL(href, sourceUrl).toString();
    } catch {
      return href;
    }
  }

  private readSourceJobId(jsonLd: JsonLd | null, url: string): string | null {
    const identifier = jsonLd?.identifier as Record<string, unknown> | undefined;
    const value = identifier?.value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);

    try {
      const segments = new URL(url).pathname.replace(/\/$/, "").split("/");
      const last = segments[segments.length - 1] ?? "";
      // Only trust a genuinely opaque-looking id: dense with digits, the way
      // a real id ("4021958") or hash/UUID ("a8f3e91b2c…") is. A hyphenated
      // slug like "product-designer-42" also contains a digit but is mostly
      // English words — grabbing "42" out of it as if it were the job's id
      // would be a confident-looking guess, not a grounded extraction.
      const digitCount = (last.match(/\d/g) ?? []).length;
      if (last.length >= 4 && digitCount / last.length >= 0.25) return last;
    } catch {
      // Not a parseable URL.
    }
    return null;
  }

  private readIsClosed(document: Document, jsonLd: JsonLd | null): boolean {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()) return true;
    }
    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return GENERIC_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  /** Lowercased `<dt>` label → cleaned `<dd>` value, first definition wins. Common on structured career pages. */
  private readDefinitionList(document: Document): Map<string, string> {
    const map = new Map<string, string>();
    for (const dl of Array.from(document.querySelectorAll("dl"))) {
      for (const dt of Array.from(dl.querySelectorAll("dt"))) {
        const dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== "DD") continue;
        const key = this.cleanText(dt.textContent ?? "").toLowerCase();
        const value = this.cleanText(dd.textContent ?? "");
        if (key && value && !map.has(key)) map.set(key, value);
      }
    }
    return map;
  }

  /** JSON-LD text field first (schema.org's `responsibilities`/`qualifications`/`jobBenefits` are Text, not lists); else a heading-led `<ul>/<ol>` in the DOM. */
  private readListField(
    jsonLdValue: unknown,
    document: Document,
    headingPattern: RegExp,
  ): string[] {
    const fromJsonLd = this.readJsonLdTextList(jsonLdValue);
    if (fromJsonLd.length > 0) return fromJsonLd;
    return this.readListAfterHeading(document, headingPattern);
  }

  private readJsonLdTextList(value: unknown): string[] {
    if (typeof value !== "string" || !value.trim()) return [];
    return value
      .split(/\r?\n|<br\s*\/?>/i)
      .map((line) => this.htmlToText(line))
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter((line) => line.length > 0);
  }

  /** First heading matching `headingPattern`, then the next `<ul>/<ol>`'s `<li>` text — stops at the next heading. */
  private readListAfterHeading(document: Document, headingPattern: RegExp): string[] {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, strong, b"));
    const heading = headings.find((h) => headingPattern.test(this.cleanText(h.textContent ?? "")));
    if (!heading) return [];

    let sibling = heading.nextElementSibling;
    let guard = 0;
    while (sibling && guard < 10) {
      guard++;
      const list = sibling.matches("ul, ol") ? sibling : sibling.querySelector("ul, ol");
      if (list) {
        const items = Array.from(list.querySelectorAll("li"))
          .map((li) => this.cleanText(li.textContent ?? ""))
          .filter((text) => text.length > 0);
        if (items.length > 0) return items.slice(0, 30);
      }
      if (sibling !== heading && /^(H[1-6]|STRONG|B)$/.test(sibling.tagName)) break;
      sibling = sibling.nextElementSibling;
    }
    return [];
  }

  private readDate(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private readString(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? this.cleanText(raw) : null;
  }
}
