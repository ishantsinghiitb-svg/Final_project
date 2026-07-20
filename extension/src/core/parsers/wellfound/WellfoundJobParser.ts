import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { classifyEmploymentTypeText } from "../shared/employmentType";
import { readImageUrl, resolveImageUrl } from "../shared/image";
import { parseSalary } from "../shared/salary";
import { extractListAfterHeading } from "../shared/sections";
import { canonicalUrl } from "../shared/url";
import { createUniversalJob } from "../types";
import type {
  EmploymentType,
  HiringTeamMember,
  ParserContext,
  SalaryPeriod,
  UniversalJob,
  WorkMode,
} from "../types";
import { WELLFOUND_CLOSED_PHRASES, wellfoundSelectors } from "./wellfound.selectors";

type JsonLd = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const WELLFOUND_PARSER_VERSION = "wellfound-detail-2";

const SALARY_UNIT_MAP: Record<string, SalaryPeriod> = {
  HOUR: "Hourly",
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};

type HeaderFacts = {
  compensationText: string | null;
  locationText: string | null;
  employmentType: EmploymentType | null;
  experienceLevel: string | null;
};

type DescriptionParts = { text: string | null; html: string | null };

type DescriptionSections = {
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
};

/**
 * Production Wellfound job parser. Wellfound has no `<script type="ld+json">`
 * and renders a job in two shells reached by two URL forms — a slide-in modal
 * (`/jobs?job_listing_slug=…`) and a full detail page (`/jobs/<id>-<slug>`).
 * `tryParse` detects which shell is present and dispatches; both derive the
 * SAME `sourceJobId`/`sourceUrl` for a given job, so the two URL forms produce
 * one deduplicated Global Job. On any page with neither shell (bare `/jobs`,
 * `/search`, `/company`, `/profile`) it returns `null` and the panel shows
 * "no job detected".
 *
 * `UniversalJob` has no dedicated `equity` column (adding one would change the
 * schema, out of scope), so equity is preserved verbatim inside `salaryText`
 * alongside cash comp rather than dropped; only the currency-bearing part is
 * parsed into the numeric `salaryMin`/`salaryMax`. No listing parser is
 * registered for Wellfound — its listing and the modal share the `/jobs` path,
 * so a listing parser there would shadow the single-job Save/Track flow.
 */
export class WellfoundJobParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;

    const modal = document.querySelector(wellfoundSelectors.modalRoot);
    if (modal) return this.parseModal(modal, document, url);

    const page = document.querySelector(wellfoundSelectors.pageRoot);
    if (page) return this.parsePage(page, document, url);

    // No open job on this page (listing/search/company/profile).
    return null;
  }

  // ── MODAL layout (/jobs?job_listing_slug=…) ────────────────────────────────

  private parseModal(root: Element, document: Document, url: string): UniversalJob | null {
    const title = this.firstText(root, [...wellfoundSelectors.title]);
    // The modal header has TWO `/company/` anchors: the first wraps only the
    // logo `<img>` (empty text), the second the company NAME. Reading text off
    // the first anchor yields "" and fails the gate — so resolve name and logo
    // from the right anchors (see `readCompanyIdentity`).
    const company = this.readCompanyIdentity(root);

    if (!title || !company.name) {
      // Modal shell present but not populated yet (still hydrating).
      return null;
    }

    const facts = this.readHeaderFacts(root);
    const salary = this.readCompensation(facts.compensationText);
    const { text: description, html: descriptionHtml } = this.readDescription(root);
    const sections = this.readDescriptionSections(descriptionHtml);
    const remoteWorkPolicy = this.readGridText(root, /^remote work policy$/i);
    const sourceUrl = this.readSourceUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Wellfound,
      parserVersion: WELLFOUND_PARSER_VERSION,
      sourceJobId: this.readSourceJobId(url),
      title,
      companyName: company.name,
      companyLogoUrl: resolveImageUrl(company.logoUrl, url),
      companyUrl: company.companyUrl,
      location: facts.locationText,
      city: this.readGridText(root, /^job location$/i),
      country: this.readGridText(root, /^hires remotely in$/i),
      workMode: this.readWorkMode(remoteWorkPolicy, facts.locationText),
      employmentType: facts.employmentType,
      experienceLevel: facts.experienceLevel,
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
      benefits: this.readBenefits(root),
      skills: this.readSkills(root),
      postedAgo: this.readPostedAgo(root),
      hiringTeam: this.readHiringTeam(root),
      companySize: this.readCompanySize(root),
      industry: this.readIndustries(root),
      hiringInsights: this.readHiringInsights(root),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document),
    });
  }

  // ── PAGE layout (/jobs/<id>-<slug>) ────────────────────────────────────────

  /**
   * The full detail page has no `/company/` link inside `JobDetail` and merges
   * the company into the `<h1>`, so DOM-only extraction is unreliable. Instead
   * this reads the server-rendered `JobPosting` out of `__NEXT_DATA__` (the
   * deterministic source) and uses the `Masthead` header only as a fallback
   * for company identity.
   */
  private parsePage(page: Element, document: Document, url: string): UniversalJob | null {
    const jsonLd = this.readNextDataJobPosting(document);
    const masthead = this.readMasthead(document);

    const org = jsonLd?.hiringOrganization as JsonLd | undefined;
    const companyName = this.readString(org?.name) ?? masthead.name;
    const title = this.readString(jsonLd?.title) ?? this.readPageTitle(page, companyName);

    if (!title || !companyName) {
      // Neither structured data nor a company header resolved — not parseable yet.
      return null;
    }

    const location = this.readJsonLdLocation(jsonLd);
    const salary = this.readJsonLdSalary(jsonLd);
    const { text: description, html: descriptionHtml } = this.readJsonLdDescription(jsonLd, page);
    const sections = this.readDescriptionSections(descriptionHtml);
    const logo = this.readString(org?.logo) ?? masthead.logoUrl;
    const sourceUrl = this.readSourceUrl(document, url);

    return createUniversalJob({
      source: SupportedSite.Wellfound,
      parserVersion: WELLFOUND_PARSER_VERSION,
      sourceJobId: this.readSourceJobId(url),
      title,
      companyName,
      companyLogoUrl: resolveImageUrl(logo, url),
      companyUrl: masthead.companyUrl ?? this.readString(org?.sameAs),
      companySize: masthead.companySize,
      location: location.location,
      city: location.city,
      state: location.state,
      country: location.country,
      workMode: location.remote ? "Remote" : null,
      employmentType: this.readJsonLdEmploymentType(jsonLd),
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
      industry: this.readString(jsonLd?.industry),
      postedAt: this.readDate(jsonLd?.datePosted),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document),
    });
  }

  /**
   * Pulls the primary `JobPosting` object out of `__NEXT_DATA__`. Wellfound
   * stores it as a JSON string under the Apollo cache entry the page's own
   * `ROOT_QUERY.jobListing(...)` points at, so this walks to that entry first
   * (never a "Similar jobs" entry) and JSON-parses its `meta.structuredData`.
   */
  private readNextDataJobPosting(document: Document): JsonLd | null {
    const raw = document.getElementById("__NEXT_DATA__")?.textContent;
    if (!raw) return null;

    let rootData: unknown;
    try {
      rootData = JSON.parse(raw);
    } catch {
      return null;
    }

    const apollo = this.dig(rootData, ["props", "pageProps", "apolloState", "data"]);
    if (!apollo || typeof apollo !== "object") return null;
    const data = apollo as Record<string, unknown>;

    const keys: string[] = [];
    const rootQuery = data.ROOT_QUERY as Record<string, unknown> | undefined;
    if (rootQuery) {
      for (const key of Object.keys(rootQuery)) {
        if (!key.startsWith("jobListing(")) continue;
        const ref = (rootQuery[key] as Record<string, unknown> | undefined)?.__ref;
        if (typeof ref === "string") keys.push(ref);
      }
    }
    for (const key of Object.keys(data)) {
      if (key.startsWith("JobListing:") && !keys.includes(key)) keys.push(key);
    }

    for (const key of keys) {
      const job = data[key] as Record<string, unknown> | undefined;
      const meta = job?.meta as Record<string, unknown> | undefined;
      const sd = meta?.structuredData;
      if (typeof sd !== "string" || !/jobposting/i.test(sd)) continue;
      try {
        const parsed = JSON.parse(sd) as JsonLd;
        const type = parsed["@type"];
        if (typeof type === "string" && type.toLowerCase() === "jobposting") return parsed;
      } catch {
        // Malformed structured data — try the next candidate.
      }
    }
    return null;
  }

  /**
   * Company identity from a set of `/company/` links, robust to Wellfound's
   * pattern of splitting the logo and the name into two separate anchors: the
   * NAME comes from the first anchor that actually has text, the LOGO from the
   * first anchor that wraps an `<img>`, the URL from whichever anchor we found.
   * Shared by the modal header and the PAGE `Masthead` (both structured this
   * way). Returns the raw logo URL — callers apply `resolveImageUrl`.
   */
  private readCompanyIdentity(scope: ParentNode): {
    name: string | null;
    companyUrl: string | null;
    logoUrl: string | null;
  } {
    const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href*="/company/"]'));
    const named = links.find((a) => this.cleanText(a.textContent ?? "").length > 0) ?? null;
    const name = named ? this.cleanText(named.textContent ?? "") || null : null;
    const companyUrl = (named ?? links[0])?.getAttribute("href") ?? null;
    const logoImg = links.map((a) => a.querySelector("img")).find(Boolean) ?? null;
    return { name, companyUrl, logoUrl: readImageUrl(logoImg) };
  }

  /** Company identity + size from the `Masthead` header (the PAGE layout's reliable company source). */
  private readMasthead(document: Document): {
    name: string | null;
    logoUrl: string | null;
    companyUrl: string | null;
    companySize: string | null;
  } {
    const masthead = document.querySelector(wellfoundSelectors.masthead);
    if (!masthead) return { name: null, logoUrl: null, companyUrl: null, companySize: null };

    const identity = this.readCompanyIdentity(masthead);
    const sizeText = Array.from(masthead.querySelectorAll("span"))
      .map((s) => this.cleanText(s.textContent ?? ""))
      .find((t) => /employees|people/i.test(t));

    return { ...identity, companySize: sizeText ?? null };
  }

  /** PAGE `<h1>` is "<title> at <company>"; strip the trailing " at <company>" to recover the title. */
  private readPageTitle(page: Element, company: string | null): string | null {
    const raw = this.cleanText(page.querySelector("h1")?.textContent ?? "");
    if (!raw) return null;
    if (company) {
      const suffix = ` at ${company}`.toLowerCase();
      if (raw.toLowerCase().endsWith(suffix))
        return raw.slice(0, raw.length - suffix.length).trim();
    }
    return raw;
  }

  private readJsonLdLocation(jsonLd: JsonLd | null): {
    location: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    remote: boolean;
  } {
    let place = jsonLd?.jobLocation as unknown;
    if (Array.isArray(place)) place = place[0];
    const address = (place as JsonLd | undefined)?.address as JsonLd | undefined;
    const city = this.readString(address?.addressLocality);
    const state = this.readString(address?.addressRegion);
    const country = this.readString(address?.addressCountry);
    const parts = [city, state, country].filter((p): p is string => p !== null);
    const remote = (this.readString(jsonLd?.jobLocationType) ?? "").toUpperCase() === "TELECOMMUTE";
    return { location: parts.length > 0 ? parts.join(", ") : null, city, state, country, remote };
  }

  private readJsonLdSalary(jsonLd: JsonLd | null): ReturnType<typeof parseSalary> {
    const base = jsonLd?.baseSalary as JsonLd | undefined;
    const value = base?.value as JsonLd | undefined;
    const min = typeof value?.minValue === "number" ? value.minValue : null;
    const max = typeof value?.maxValue === "number" ? value.maxValue : null;
    const currency = this.readString(base?.currency);
    const unit = this.readString(value?.unitText);
    const period = unit ? (SALARY_UNIT_MAP[unit.toUpperCase()] ?? null) : null;

    if (min === null && max === null) return parseSalary(null, currency);
    return {
      salaryMin: min,
      salaryMax: max,
      salaryCurrency: currency,
      salaryPeriod: period,
      salaryText: null, // Normalizer synthesizes a display string from the numbers.
    };
  }

  private readJsonLdDescription(jsonLd: JsonLd | null, page: Element): DescriptionParts {
    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }
    // DOM fallback: the page's description block (hashed class, matched loosely).
    const el = page.querySelector("[class*='description']");
    if (el?.innerHTML?.trim()) {
      return {
        text: this.cleanText(el.textContent ?? ""),
        html: sanitizeDescriptionHtml(el.innerHTML),
      };
    }
    return { text: null, html: null };
  }

  private readJsonLdEmploymentType(jsonLd: JsonLd | null): EmploymentType | null {
    const raw = jsonLd?.employmentType;
    const value = Array.isArray(raw) ? raw[0] : raw;
    // schema.org uses "FULL_TIME"/"PART_TIME"; normalize the underscore so the
    // shared text classifier (which expects space/hyphen) recognizes it.
    return classifyEmploymentTypeText(typeof value === "string" ? value.replace(/_/g, " ") : null);
  }

  // ── Shared modal-DOM readers ───────────────────────────────────────────────

  /**
   * The compensation/location/employment-type/experience facts live in one
   * `<ul>` of "|"-separated `<li>`s right after the `<h1>` — classified by each
   * `<li>`'s OWN content (a currency/percent sign, a `/remote` or `/location/`
   * link, a "years of exp" phrase, a known employment-type word), not position.
   */
  private readHeaderFacts(root: ParentNode): HeaderFacts {
    const h1 = root.querySelector(wellfoundSelectors.title[0]);
    const ul = h1?.parentElement?.querySelector("ul");
    const items = ul ? Array.from(ul.querySelectorAll(":scope > li")) : [];

    const facts: HeaderFacts = {
      compensationText: null,
      locationText: null,
      employmentType: null,
      experienceLevel: null,
    };

    for (const li of items) {
      const text = this.cleanText(li.textContent ?? "").replace(/^\|\s*/, "");
      if (!text) continue;

      if (!facts.compensationText && /[$₹€£%]/.test(text)) {
        facts.compensationText = text;
        continue;
      }
      if (!facts.locationText && li.querySelector("a[href*='/remote'], a[href*='/location/']")) {
        facts.locationText = text;
        continue;
      }
      if (!facts.experienceLevel && /\d+\+?\s*years?\s*of\s*exp/i.test(text)) {
        facts.experienceLevel = text;
        continue;
      }
      if (!facts.employmentType) {
        const mapped = classifyEmploymentTypeText(text);
        if (mapped) facts.employmentType = mapped;
      }
    }

    return facts;
  }

  /**
   * Keeps the FULL compensation string (cash and/or equity) as `salaryText`
   * verbatim, but only runs the numeric parser on the currency-bearing segment
   * (a "%"-only equity segment is never treated as salary). Wellfound writes
   * comp in "k" shorthand ("$100k – $200k"), which the shared salary parser
   * doesn't expand, so it's expanded to full figures first.
   */
  private readCompensation(compensationText: string | null): ReturnType<typeof parseSalary> {
    if (!compensationText) return parseSalary(null);
    const currencySegment = compensationText
      .split("•")
      .map((s) => s.trim())
      .find((s) => /[$₹€£]/.test(s));
    const parsed = parseSalary(this.expandThousands(currencySegment ?? null));
    return { ...parsed, salaryText: compensationText };
  }

  /** "$100k" / "$1.5k" → "$100000" / "$1500" so the shared numeric salary parser sees full figures. */
  private expandThousands(text: string | null): string | null {
    if (!text) return text;
    return text.replace(/(\d[\d,]*(?:\.\d+)?)\s*k\b/gi, (_m, n: string) =>
      String(Math.round(Number.parseFloat(n.replace(/,/g, "")) * 1000)),
    );
  }

  private readWorkMode(
    remoteWorkPolicy: string | null,
    locationText: string | null,
  ): WorkMode | null {
    if (remoteWorkPolicy && /remote/i.test(remoteWorkPolicy)) return "Remote";
    const combined = `${remoteWorkPolicy ?? ""} ${locationText ?? ""}`;
    if (/onsite or remote/i.test(combined)) return "Hybrid";
    if (/\bremote\b/i.test(combined)) return "Remote";
    return null;
  }

  private readDescription(root: ParentNode): DescriptionParts {
    const el =
      root.querySelector(wellfoundSelectors.description[0]) ??
      document.querySelector(wellfoundSelectors.description[0]);
    if (!el?.innerHTML?.trim()) return { text: null, html: null };
    return {
      text: this.cleanText(el.textContent ?? ""),
      html: sanitizeDescriptionHtml(el.innerHTML),
    };
  }

  /** Recovers "What You'll Do"/"What You Need"/"Best If You Have" bullet lists from the sanitized description. */
  private readDescriptionSections(html: string | null): DescriptionSections {
    if (!html) return { responsibilities: [], requirements: [], preferredQualifications: [] };
    const container = document.createElement("div");
    container.innerHTML = html;
    return {
      responsibilities: extractListAfterHeading(
        container,
        /responsibilit|what you.?ll (?:be )?do|role overview/i,
      ),
      requirements: extractListAfterHeading(
        container,
        /what you.?ll need|what you need|\brequirement/i,
      ),
      preferredQualifications: extractListAfterHeading(
        container,
        /best if you have|nice to have|preferred/i,
      ),
    };
  }

  /** The value element for a labeled grid field (e.g. "Job Location", "Skills", "Hiring contact"). */
  private readLabeledField(root: ParentNode, labelPattern: RegExp): Element | null {
    const labels = Array.from(root.querySelectorAll(wellfoundSelectors.fieldLabel.join(", ")));
    const label = labels.find((el) => labelPattern.test(this.cleanText(el.textContent ?? "")));
    return label?.nextElementSibling ?? null;
  }

  private readGridText(root: ParentNode, labelPattern: RegExp): string | null {
    const value = this.readLabeledField(root, labelPattern);
    return value ? this.cleanText(value.textContent ?? "") || null : null;
  }

  private readSkills(root: ParentNode): string[] {
    const value = this.readLabeledField(root, /^skills$/i);
    if (!value) return [];
    return Array.from(value.children)
      .map((el) => this.cleanText(el.textContent ?? ""))
      .filter((text) => text.length > 0);
  }

  private readHiringTeam(root: ParentNode): HiringTeamMember[] {
    const value = this.readLabeledField(root, /^hiring contact$/i);
    if (!value) return [];

    const link = value.querySelector<HTMLAnchorElement>("a");
    const allText = this.cleanText(value.textContent ?? "");
    const name =
      (link?.textContent ? this.cleanText(link.textContent) : "") ||
      allText.split(/[•\n]/)[0]?.trim();
    if (!name) return [];

    const role = allText.startsWith(name)
      ? this.cleanText(allText.slice(name.length)) || null
      : null;
    return [{ name, profileUrl: link?.getAttribute("href") ?? null, role }];
  }

  private readCompanySize(root: ParentNode): string | null {
    const icon = root.querySelector(wellfoundSelectors.companySizeIcon[0]);
    const value = icon?.parentElement?.querySelector("div");
    return value ? this.cleanText(value.textContent ?? "") || null : null;
  }

  private readIndustries(root: ParentNode): string | null {
    const icons = Array.from(root.querySelectorAll(wellfoundSelectors.companyIndustryIcon[0]));
    const values = icons
      .map((icon) => this.cleanText(icon.parentElement?.querySelector("a")?.textContent ?? ""))
      .filter((text) => text.length > 0);
    return values.length > 0 ? Array.from(new Set(values)).join(", ") : null;
  }

  /** Best-effort company "stage"/funding/responsiveness badges (Growing fast, Early Stage, …). */
  private readHiringInsights(root: ParentNode): string[] {
    const items = Array.from(root.querySelectorAll('li[class*="tooltip"]'));
    const values = items
      .map((li) => this.cleanText(li.textContent ?? ""))
      .filter((text) => text.length > 0 && text.length < 80);
    return Array.from(new Set(values));
  }

  /** The "Perks" grid, when present as a labeled grid (separate from the description body). */
  private readBenefits(root: ParentNode): string[] {
    const heading = Array.from(root.querySelectorAll("h3")).find((h) =>
      /^perks$/i.test(this.cleanText(h.textContent ?? "")),
    );
    const grid = heading?.nextElementSibling;
    if (!grid) return [];

    const labeled = grid.querySelectorAll("span.text-md.font-medium");
    const nodes = labeled.length > 0 ? labeled : grid.querySelectorAll("span");
    const values = Array.from(nodes)
      .map((el) => this.cleanText(el.textContent ?? ""))
      .filter((text) => text.length > 0);
    return Array.from(new Set(values));
  }

  /** The "Reposted: N days ago" line — the sibling right after the facts `<ul>`. */
  private readPostedAgo(root: ParentNode): string | null {
    const h1 = root.querySelector(wellfoundSelectors.title[0]);
    const ul = h1?.parentElement?.querySelector("ul");
    const next = ul?.nextElementSibling;
    const text = next ? this.cleanText(next.textContent ?? "") : "";
    const match = /^(?:posted|reposted):?\s*([^•]+)/i.exec(text);
    return match ? this.cleanText(match[1]) : null;
  }

  // ── Identity / shared ──────────────────────────────────────────────────────

  /** Reconstructs the real per-job URL (`/jobs/<id>-<slug>`) so both URL forms dedupe to one row. */
  private readSourceUrl(document: Document, url: string): string {
    const slug = this.readSlug(url);
    return slug ? `https://wellfound.com/jobs/${slug}` : canonicalUrl(document, url);
  }

  private readSourceJobId(url: string): string | null {
    const slug = this.readSlug(url);
    if (slug) return /^(\d+)-/.exec(slug)?.[1] ?? null;

    try {
      const path = new URL(url).pathname;
      return /^\/jobs\/(\d+)-/.exec(path)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private readSlug(url: string): string | null {
    try {
      const slug = new URL(url).searchParams.get("job_listing_slug");
      return slug && /^\d+-/.test(slug) ? slug : null;
    } catch {
      return null;
    }
  }

  private readIsClosed(document: Document): boolean {
    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return WELLFOUND_CLOSED_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? this.cleanText(value) : null;
  }

  private readDate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private dig(obj: unknown, path: string[]): unknown {
    let cur = obj;
    for (const key of path) {
      if (!cur || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur ?? null;
  }
}
