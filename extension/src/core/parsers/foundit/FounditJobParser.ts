import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { classifyEmploymentTypeText } from "../shared/employmentType";
import { isPlaceholderImage, readImageUrl, resolveImageUrl } from "../shared/image";
import { extractListAfterHeading } from "../shared/sections";
import { canonicalUrl } from "../shared/url";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, UniversalJob, WorkMode } from "../types";
import {
  extractFounditJobId,
  FOUNDIT_CLOSED_PHRASES,
  FOUNDIT_PLACEHOLDER_LOGO_PATTERN,
  parseFounditDate,
  readJsonLdText,
} from "./foundit.shared";
import { founditSelectors } from "./foundit.selectors";

type JsonLd = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const FOUNDIT_PARSER_VERSION = "foundit-detail-1";

/**
 * Production Foundit job-detail parser. Like Naukri, Foundit embeds a JSON-LD
 * `JobPosting` block server-side, so this reads it first for most fields and
 * drops to the DOM only for what JSON-LD omits (experience range, applicant
 * count, posted-ago, industry/function/role, key skills as a fallback).
 *
 * Two Foundit quirks JSON-LD alone would get wrong: `datePosted`/
 * `validThrough` are `DD-MM-YYYY` (not ISO) — see `parseFounditDate` — and
 * the `responsibilities` key is actually the job's "Role" tag misfiled under
 * that schema.org property (e.g. `["Other Roles"]`), not real responsibility
 * bullets, so it is never read into `UniversalJob.responsibilities` here;
 * the real bullets are recovered from the description body instead (see
 * `readDescriptionSections`).
 */
export class FounditJobParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;
    const jsonLd = this.findJsonLdByType(document, "JobPosting");

    const title =
      (typeof jsonLd?.title === "string" ? this.cleanText(jsonLd.title) : null) ||
      this.firstText(document, [...founditSelectors.header.title]);
    const { name: companyName, url: companyUrl } = this.readCompany(document, jsonLd);

    if (!title || !companyName) {
      // No job-details DOM/JSON-LD present (or still loading).
      return null;
    }

    const { text: description, html: descriptionHtml } = this.readDescription(document, jsonLd);
    const { responsibilities, requirements } = this.readDescriptionSections(descriptionHtml);
    const locationParts = this.readLocation(document, jsonLd);
    const stats = this.readStatList(document);
    const sourceUrl = canonicalUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Foundit,
      parserVersion: FOUNDIT_PARSER_VERSION,
      sourceJobId: this.readSourceJobId(jsonLd, url),
      title,
      companyName,
      companyLogoUrl: this.readLogo(document, url),
      companyUrl,
      location: locationParts.location,
      city: locationParts.city,
      state: locationParts.state,
      country: locationParts.country,
      workMode: locationParts.workMode,
      employmentType: this.readEmploymentType(document, jsonLd),
      experienceLevel: this.readExperience(document),
      // Foundit's own "Role:" row (e.g. "VP/GM/Head - Sales") — a coarse role
      // category distinct from the job title; no other UniversalJob field fits it.
      department: this.readMoreInfoRow(document, /^role:?$/i),
      jobFunction:
        this.readMoreInfoRow(document, /^function:?$/i) ??
        readJsonLdText(jsonLd?.occupationalCategory),
      description,
      descriptionHtml,
      responsibilities,
      requirements,
      skills: this.readSkills(document, jsonLd),
      industry: this.readIndustry(document, jsonLd),
      postedAt: parseFounditDate(jsonLd?.datePosted),
      postedAgo: this.readPostedAgo(stats),
      expiryDate: parseFounditDate(jsonLd?.validThrough),
      applicantCount: this.readApplicantCount(stats),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  private readCompany(
    document: Document,
    jsonLd: JsonLd | null,
  ): { name: string | null; url: string | null } {
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const jsonName = readJsonLdText(org?.name);
    const link = document.querySelector(founditSelectors.header.companyLink[0]);
    const domName = link?.textContent ? this.cleanText(link.textContent) : null;
    const domUrl = link?.getAttribute("href")?.trim() || null;
    return { name: jsonName ?? domName, url: domUrl };
  }

  /**
   * Foundit is a Next.js app, so its logo `<img>` src is usually a relative
   * `/_next/image?url=…` optimizer URL — stored verbatim it would 404 on the
   * dashboard. `resolveImageUrl` unwraps/absolutizes it into the real,
   * cross-origin-loadable CDN URL; the placeholder check runs on that final
   * URL so a genuine default asset is still rejected.
   */
  private readLogo(document: Document, pageUrl: string): string | null {
    for (const selector of founditSelectors.companyLogo) {
      const resolved = resolveImageUrl(readImageUrl(document.querySelector(selector)), pageUrl);
      if (
        resolved &&
        !isPlaceholderImage(resolved) &&
        !FOUNDIT_PLACEHOLDER_LOGO_PATTERN.test(resolved)
      ) {
        return resolved;
      }
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

    for (const selector of founditSelectors.description) {
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

  /** Recovers real "Responsibilities"/"Qualifications" bullet lists from the (already-sanitized) description body. */
  private readDescriptionSections(html: string | null): {
    responsibilities: string[];
    requirements: string[];
  } {
    if (!html) return { responsibilities: [], requirements: [] };
    const container = document.createElement("div");
    container.innerHTML = html;
    return {
      responsibilities: extractListAfterHeading(container, /responsibilit/i),
      requirements: extractListAfterHeading(container, /qualification/i),
    };
  }

  private readLocation(
    document: Document,
    jsonLd: JsonLd | null,
  ): {
    location: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    workMode: WorkMode | null;
  } {
    const place = jsonLd?.jobLocation as Record<string, unknown> | undefined;
    const address = place?.address as Record<string, unknown> | undefined;
    const state = readJsonLdText(address?.addressRegion);
    const country = readJsonLdText(address?.addressCountry);
    const jobLocationType = readJsonLdText(jsonLd?.jobLocationType);

    const domLocation = this.firstText(document, [...founditSelectors.header.locationLink]);
    const location = domLocation ?? readJsonLdText(address?.addressLocality);
    const isRemote =
      jobLocationType?.toUpperCase() === "TELECOMMUTE" || /^remote$/i.test(domLocation ?? "");
    const city = !isRemote && domLocation ? domLocation : null;

    const jobTypeRow = this.readMoreInfoRow(document, /^job type:?$/i) ?? "";
    let workMode: WorkMode | null = null;
    if (isRemote || /work from home/i.test(jobTypeRow)) workMode = "Remote";
    else if (/hybrid/i.test(`${domLocation ?? ""} ${jobTypeRow}`)) workMode = "Hybrid";

    return { location, city, state, country, workMode };
  }

  private readEmploymentType(document: Document, jsonLd: JsonLd | null): EmploymentType | null {
    const raw =
      this.readMoreInfoRow(document, /^employment type:?$/i) ??
      readJsonLdText(jsonLd?.employmentType);
    return classifyEmploymentTypeText(raw);
  }

  /** "12-16 Years" style experience range from the header — not present in JSON-LD. */
  private readExperience(document: Document): string | null {
    const header = document.querySelector(founditSelectors.header.container[0]);
    const text = header?.textContent ?? "";
    const match = /\b\d+(?:\.\d+)?\s*(?:-\s*\d+(?:\.\d+)?\s*)?Years?\b/i.exec(text);
    return match ? this.cleanText(match[0]) : null;
  }

  private readSkills(document: Document, jsonLd: JsonLd | null): string[] {
    const skills = jsonLd?.skills;
    if (Array.isArray(skills)) {
      const cleaned = skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => this.cleanText(s))
        .filter((s) => s.length > 0);
      if (cleaned.length > 0) return cleaned;
    }

    const fallback = document.querySelectorAll(founditSelectors.skillsFallback.join(", "));
    return Array.from(fallback)
      .map((el) => this.cleanText(el.textContent ?? ""))
      .filter((text) => text.length > 0 && !/preferred skills|out of/i.test(text));
  }

  private readIndustry(document: Document, jsonLd: JsonLd | null): string | null {
    const domIndustry = this.readMoreInfoRow(document, /^industry:?$/i);
    if (domIndustry) return domIndustry;

    const raw = jsonLd?.industry;
    if (Array.isArray(raw)) {
      const joined = raw
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
      return readJsonLdText(joined);
    }
    return readJsonLdText(raw);
  }

  /** Reads the "More Info" grid's labeled rows (Job Type / Industry / Role / Function / Employment Type). */
  private readMoreInfoRow(document: Document, labelPattern: RegExp): string | null {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
      /^more info$/i.test(this.cleanText(h.textContent ?? "")),
    );
    const rows = heading?.nextElementSibling ? Array.from(heading.nextElementSibling.children) : [];

    for (const row of rows) {
      const label = this.cleanText(row.children[0]?.textContent ?? "");
      if (labelPattern.test(label)) {
        return this.cleanText(row.children[1]?.textContent ?? "") || null;
      }
    }
    return null;
  }

  private readStatList(document: Document): string[] {
    const ul = document.querySelector(founditSelectors.statList[0]);
    if (!ul) return [];
    return Array.from(ul.querySelectorAll("li span")).map((el) =>
      this.cleanText(el.textContent ?? ""),
    );
  }

  private readPostedAgo(stats: string[]): string | null {
    const raw = stats.find((s) => /^posted/i.test(s));
    if (!raw) return null;
    return raw.replace(/^posted\s*/i, "").trim() || null;
  }

  /**
   * "Over 500 applicants" is a real count; "Be among the first 20
   * applicants" is an invitation CTA (not a count of applicants so far) —
   * only the former is read, so this never fabricates a number from a hurry-
   * up message.
   */
  private readApplicantCount(stats: string[]): number | null {
    for (const stat of stats) {
      if (/first/i.test(stat) || !/applicants?/i.test(stat)) continue;
      const match = /\d[\d,]*/.exec(stat);
      if (!match) continue;
      const n = Number.parseInt(match[0].replace(/,/g, ""), 10);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private readSourceJobId(jsonLd: JsonLd | null, url: string): string | null {
    const identifier = jsonLd?.identifier as Record<string, unknown> | undefined;
    const value = identifier?.value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
    return extractFounditJobId(url);
  }

  private readIsClosed(document: Document, jsonLd: JsonLd | null): boolean {
    const iso = parseFounditDate(jsonLd?.validThrough);
    if (iso && new Date(iso).getTime() < Date.now()) return true;

    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return FOUNDIT_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }
}
