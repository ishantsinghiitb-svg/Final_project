// ── Module 10B.1: Internshala adapter ──
//
// Internshala server-renders both its listing pages and its detail pages, so
// no JavaScript execution is needed — a plain GET returns the real content.
// Two-stage: listing → posting ids + detail URLs → detail page per posting.
// The detail page is where the description and skills live, and those are
// what the deterministic resume match actually scores on, so the detail fetch
// is the point of the crawl rather than an optional enrichment.
//
// ⚠️ robots.txt compliance (verified): Internshala disallows `/*?*` — ANY URL
// with a query string — plus `/api/`, `/internship/details/` (plural) and
// `/internship/search/`. The URLs used here (`/internships/`, `/jobs/`,
// `/internships/page-N/`, `/internship/detail/…` singular) are all outside
// those rules, and pagination is therefore PATH-based. Do not add `?page=`.
//
// `source_job_id` is the `internshipid` attribute — NOT the trailing number in
// the URL slug, which is a different id. This is deliberate and load-bearing:
// the extension's Internshala parser uses the same attribute, so a posting
// captured by a user in the browser and the same posting imported by this
// crawler dedupe onto one `global_jobs` row instead of becoming two.

import {
  collapseWhitespace,
  findElements,
  findElementsByClass,
  hasClass,
  htmlToInlineText,
  htmlToPlainText,
  readAttribute,
  resolveUrl,
  textOfFirstByClass,
  textsByClass,
} from "../../parsers/html";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { EmploymentTypeValue, ParsedJobPosting, WorkModeValue } from "../../types";
import { parseSalaryText } from "../../parsers/utils";
import { crawlErrorMessage, CrawlTargetError } from "../../crawl/errors";
import {
  newObservations,
  noteIncomplete,
  type CrawlObservations,
} from "../../crawl/CrawlObservations";
import type { CrawlFetcher } from "../../crawl/HttpFetcher";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "../types";
import {
  CARD_CLASS,
  CARD_HREF_ATTRIBUTE,
  DETAIL_COMPANY_CLASS,
  DETAIL_COMPANY_INFO_CLASS,
  DETAIL_HEADINGS,
  DETAIL_ITEM_BODY_CLASS,
  DETAIL_ITEM_CLASS,
  DETAIL_ITEM_HEADING_CLASS,
  DETAIL_LOCATION_ID,
  DETAIL_LOGO_CLASS,
  DETAIL_SECTION_CLASS,
  DETAIL_SKILL_TAG_CLASS,
  DETAIL_STATUS_CLASS,
  DETAIL_TEXT_CONTAINER_CLASS,
  DETAIL_TITLE_CLASS,
  DETAIL_WHO_CAN_APPLY_CLASS,
  INTERNSHALA_ORIGIN,
  INTERNSHIP_DETAIL_PATH,
  INTERNSHIP_ID_ATTRIBUTE,
} from "./internshala.selectors";

export const INTERNSHALA_PLATFORM = "internshala";
/** Matches the extension's SupportedSite tag exactly, so both write the same `global_jobs.source`. */
export const INTERNSHALA_SOURCE = "internshala";
export const INTERNSHALA_PARSER_VERSION = "internshala-server-1.0.0";

export type InternshalaLimits = {
  /** Listing pages to walk per target. */
  maxPages: number;
  /** Detail pages to fetch per target — the real cost driver (one request each). */
  maxDetailFetches: number;
};

export const DEFAULT_INTERNSHALA_LIMITS: InternshalaLimits = {
  maxPages: 2,
  maxDetailFetches: 30,
};

/** A posting discovered on a listing page. */
export type InternshalaCard = {
  internshipId: string;
  detailUrl: string;
};

/** Reads the stable posting id off a card's opening tag (attribute, or the `individual_internship_<id>` id). */
export function readInternshipId(openTag: string): string | null {
  const attribute = readAttribute(openTag, INTERNSHIP_ID_ATTRIBUTE)?.trim();
  if (attribute && /^\d+$/.test(attribute)) return attribute;

  const idAttribute = readAttribute(openTag, "id") ?? "";
  const fromId = /individual_internship_(\d+)/.exec(idAttribute);
  return fromId ? fromId[1] : null;
}

/** Every posting card on a listing page, de-duplicated by posting id. */
export function extractListingCards(html: string, pageUrl: string): InternshalaCard[] {
  const cards = new Map<string, InternshalaCard>();

  for (const element of findElementsByClass(html, "div", CARD_CLASS)) {
    const internshipId = readInternshipId(element.openTag);
    if (!internshipId) continue;

    // The card carries the detail path on the wrapper; fall back to the title
    // anchor, which is the same href.
    const href =
      readAttribute(element.openTag, CARD_HREF_ATTRIBUTE) ?? firstDetailHref(element.innerHtml);
    const detailUrl = resolveUrl(href, pageUrl);
    if (!detailUrl) continue;

    if (!cards.has(internshipId)) cards.set(internshipId, { internshipId, detailUrl });
  }

  return [...cards.values()];
}

function firstDetailHref(innerHtml: string): string | null {
  for (const anchor of findElements(innerHtml, "a")) {
    const href = readAttribute(anchor.openTag, "href");
    if (href && /\/(internship|job)\/detail\//i.test(href)) return href;
  }
  return null;
}

/** Path-based pagination (`/internships/page-2/`) — query strings are robots-disallowed. */
export function listingPageUrl(baseUrl: string, page: number): string {
  if (page <= 1) return baseUrl;
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/page-${page}/`;
}

function listingUrlFor(target: CrawlTarget): string {
  switch (target.kind) {
    case "url":
      return target.url;
    case "company":
      return target.companyCareerUrl;
    case "query": {
      const slug = target.query
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      // Internshala's keyword listings are path-based too, e.g.
      // /internships/computer-science-internship/.
      return slug
        ? `${INTERNSHALA_ORIGIN}/internships/${slug}-internship/`
        : `${INTERNSHALA_ORIGIN}/internships/`;
    }
  }
}

export class InternshalaCrawler implements PlatformCrawler {
  readonly platform = INTERNSHALA_PLATFORM;

  constructor(
    private readonly fetcher: CrawlFetcher,
    private readonly limits: InternshalaLimits = DEFAULT_INTERNSHALA_LIMITS,
    private readonly observations: CrawlObservations = newObservations(),
  ) {}

  async fetchRawPostings(target: CrawlTarget): Promise<RawJobPayload[]> {
    const baseUrl = listingUrlFor(target);
    if (new URL(baseUrl, INTERNSHALA_ORIGIN).search) {
      throw new CrawlTargetError(
        `Internshala listing URLs must not carry a query string (robots.txt disallows "/*?*"): ${baseUrl}`,
      );
    }

    const discovered = new Map<string, InternshalaCard>();
    let firstPageFailure: string | null = null;
    let blocked = false;

    for (let page = 1; page <= this.limits.maxPages; page++) {
      const pageUrl = listingPageUrl(baseUrl, page);
      const response = await this.fetcher.fetchText(pageUrl);
      if (!response.ok) {
        if (page === 1) {
          firstPageFailure = `Internshala listing ${pageUrl}: ${response.reason}`;
          blocked = response.kind === "blocked";
        } else {
          // Later pages exist but could not be read — the crawl is real but
          // demonstrably partial.
          noteIncomplete(
            this.observations,
            `Listing pagination stopped at page ${page}: ${response.reason}`,
          );
        }
        break;
      }

      const cards = extractListingCards(response.body, response.url);
      // A full page followed by an empty one is the natural end of the listing.
      if (cards.length === 0) break;
      // Hitting the page cap with cards still coming means there is more.
      if (page === this.limits.maxPages) {
        noteIncomplete(
          this.observations,
          `Listing stopped at the ${this.limits.maxPages}-page cap; more pages may exist.`,
        );
      }
      for (const card of cards) {
        if (!discovered.has(card.internshipId)) discovered.set(card.internshipId, card);
      }
    }

    if (firstPageFailure) throw new CrawlTargetError(firstPageFailure, { blocked });
    if (discovered.size === 0) {
      throw new CrawlTargetError(
        `Internshala listing ${baseUrl} produced no posting cards — the page markup may have changed.`,
      );
    }

    const fetchedAt = new Date().toISOString();
    const raws: RawJobPayload[] = [];

    const cards = [...discovered.values()];
    if (cards.length > this.limits.maxDetailFetches) {
      noteIncomplete(
        this.observations,
        `Found ${cards.length} posting(s) but fetched the first ${this.limits.maxDetailFetches}.`,
      );
    }

    let detailFailures = 0;
    for (const card of cards.slice(0, this.limits.maxDetailFetches)) {
      const detail = await this.fetcher.fetchText(card.detailUrl);
      // One unreachable posting must not fail the target; it is simply absent
      // from this run, and the crawl is recorded as incomplete because of it.
      if (!detail.ok) {
        detailFailures++;
        continue;
      }

      raws.push({
        platform: INTERNSHALA_PLATFORM,
        sourceUrl: detail.url,
        fetchedAt,
        html: detail.body,
        json: { internshipId: card.internshipId, listingUrl: baseUrl, discovered: discovered.size },
      });
    }

    if (detailFailures > 0) {
      noteIncomplete(
        this.observations,
        `${detailFailures} detail page(s) could not be fetched and are missing from this run.`,
      );
    }

    if (raws.length === 0) {
      throw new CrawlTargetError(
        `Internshala: found ${discovered.size} posting(s) but every detail page fetch failed.`,
        { blocked: true },
      );
    }

    return raws;
  }
}

/** `.other_detail_item` heading → body, e.g. { stipend: "₹ 12,000 - 17,000 /month" }. */
export function readDetailItems(html: string): Record<string, string> {
  const items: Record<string, string> = {};

  for (const item of findElementsByClass(html, "div", DETAIL_ITEM_CLASS)) {
    const heading = textOfFirstByClass(item.innerHtml, "div", DETAIL_ITEM_HEADING_CLASS);
    const body = textOfFirstByClass(item.innerHtml, "div", DETAIL_ITEM_BODY_CLASS);
    if (!heading || !body) continue;
    const key = collapseWhitespace(heading).toLowerCase();
    if (!items[key]) items[key] = body;
  }

  return items;
}

/** The "About the internship" body — the first `.text-container` inside `.internship_details`. */
function readDescription(html: string): string | null {
  for (const section of findElementsByClass(html, "div", DETAIL_SECTION_CLASS)) {
    const container = findElementsByClass(
      section.innerHtml,
      "div",
      DETAIL_TEXT_CONTAINER_CLASS,
      1,
    )[0];
    if (!container) continue;
    const text = htmlToPlainText(container.innerHtml);
    if (text) return text;
  }
  return null;
}

/** The numbered "Who can apply" conditions, as requirement lines. */
function readRequirements(html: string): string[] | null {
  const container = findElementsByClass(html, "div", DETAIL_WHO_CAN_APPLY_CLASS, 1)[0];
  if (!container) return null;

  const lines = htmlToPlainText(container.innerHtml)
    .split("\n")
    .map((line) => collapseWhitespace(line.replace(/^\d+\.\s*/, "").replace(/^[-•*]\s*/, "")))
    .filter((line) => line.length > 2 && !/^only those candidates can apply/i.test(line));

  return lines.length > 0 ? lines : null;
}

/** "Posted 1 day ago" from the status chips. */
function readPostedAgo(html: string): string | null {
  for (const text of textsByClass(html, "div", DETAIL_STATUS_CLASS)) {
    if (/posted/i.test(text)) return collapseWhitespace(text);
  }
  return null;
}

/** The company's own website from the "About <company>" block. */
function readCompanyUrl(html: string, pageUrl: string): string | null {
  const info = findElementsByClass(html, "div", DETAIL_COMPANY_INFO_CLASS, 1)[0];
  if (!info) return null;
  for (const anchor of findElements(info.innerHtml, "a")) {
    const resolved = resolveUrl(readAttribute(anchor.openTag, "href"), pageUrl);
    if (resolved && !/internshala\.com/i.test(resolved)) return resolved;
  }
  return null;
}

/** Work mode from the location text plus the "Who can apply" phrasing ("in-office", "work from home"). */
export function classifyWorkMode(
  locationText: string | null,
  bodyText: string,
): WorkModeValue | null {
  const haystack = `${locationText ?? ""} ${bodyText}`.toLowerCase();
  if (/work from home|\bwfh\b|\bremote\b/.test(haystack)) return "Remote";
  if (/hybrid/.test(haystack)) return "Hybrid";
  if (/in[-\s]?office|\bon[-\s]?site\b/.test(haystack)) return "Onsite";
  return collapseWhitespace(locationText ?? "") ? "Onsite" : null;
}

/** Internshala's short date format ("26 Sep' 26") → ISO. */
export function parseInternshalaDate(raw: string | null | undefined): string | null {
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const match = /(\d{1,2})\s*([A-Za-z]{3,})'?\s*(\d{2,4})/.exec(collapseWhitespace(raw ?? ""));
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = months[match[2].slice(0, 3).toLowerCase()];
  let year = Number.parseInt(match[3], 10);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null;
  if (year < 100) year += 2000;

  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class InternshalaParser implements JobParser {
  readonly platform = INTERNSHALA_PLATFORM;
  readonly version = INTERNSHALA_PARSER_VERSION;

  parse(raw: RawJobPayload): ParseOutcome {
    try {
      const html = raw.html;
      if (!html || !html.trim()) {
        return { ok: false, reason: "Internshala payload carried no detail HTML." };
      }

      const payload = (raw.json ?? {}) as { internshipId?: string };
      const pageUrl = raw.sourceUrl;

      const role = textOfFirstByClass(html, "h1", DETAIL_TITLE_CLASS);
      if (!role) return { ok: false, reason: "Internshala detail page has no title." };

      const companyName = readCompanyName(html);
      if (!companyName)
        return { ok: false, reason: "Internshala detail page has no company name." };

      // Prefer the id captured from the listing card; fall back to the detail
      // page's own card so a direct-URL crawl still gets a stable id.
      const internshipId = payload.internshipId ?? readInternshipIdFromPage(html);

      const items = readDetailItems(html);
      const stipendText =
        textOfFirstByClass(html, "span", "stipend") ??
        items[DETAIL_HEADINGS.stipend] ??
        items[DETAIL_HEADINGS.salary] ??
        null;
      const salary = parseSalaryText(stipendText);

      const locationText = readLocation(html);
      const description = readDescription(html);
      const requirements = readRequirements(html);
      const isInternship = INTERNSHIP_DETAIL_PATH.test(pageUrl);

      const workMode = classifyWorkMode(
        locationText,
        `${description ?? ""} ${(requirements ?? []).join(" ")}`,
      );
      const employmentType: EmploymentTypeValue = isInternship
        ? "Internship"
        : /part[-\s]?time/i.test(`${role} ${description ?? ""}`)
          ? "Part-Time"
          : "Full-Time";

      const parsed: ParsedJobPosting = {
        source: INTERNSHALA_SOURCE,
        sourceJobId: internshipId,
        sourceUrl: pageUrl,
        url: pageUrl,

        companyName,
        role,

        location: locationText,
        city: locationText ? collapseWhitespace(locationText.split(",")[0]) || null : null,
        country: locationText ? "India" : null,
        remote: workMode === "Remote",
        workMode,

        employmentType,
        experienceLevel: isInternship ? "Intern" : null,

        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency ?? "INR",
        salaryPeriod: salary.period,
        salaryText: stipendText,

        description,
        requirements,
        skills: readSkills(html),

        companyUrl: readCompanyUrl(html, pageUrl),
        companyLogoUrl: readLogo(html, pageUrl),

        postedAgo: readPostedAgo(html),
        expiryDate: parseInternshalaDate(items[DETAIL_HEADINGS.applyBy]),

        tags: buildTags(items),

        parserVersion: INTERNSHALA_PARSER_VERSION,
        parserConfidence: description ? 0.9 : 0.65,
        extractionWarnings: buildWarnings(description, internshipId),
      };

      return { ok: true, job: parsed };
    } catch (err) {
      return { ok: false, reason: crawlErrorMessage(err, "Internshala parse failed.") };
    }
  }
}

function readCompanyName(html: string): string | null {
  const block = findElementsByClass(html, "div", DETAIL_COMPANY_CLASS, 1)[0];
  if (!block) return null;
  // The company name is an anchor to /company/<slug>; the surrounding div also
  // holds premium/verification badges, so read the anchor rather than the div.
  for (const anchor of findElements(block.innerHtml, "a")) {
    const text = htmlToInlineText(anchor.innerHtml);
    if (text) return text;
  }
  return htmlToInlineText(block.innerHtml) || null;
}

function readInternshipIdFromPage(html: string): string | null {
  for (const element of findElementsByClass(html, "div", CARD_CLASS, 1)) {
    const id = readInternshipId(element.openTag);
    if (id) return id;
  }
  return null;
}

function readLocation(html: string): string | null {
  const block = findElements(
    html,
    "div",
    (openTag) => readAttribute(openTag, "id") === DETAIL_LOCATION_ID,
    1,
  )[0];
  if (!block) return null;
  return htmlToInlineText(block.innerHtml) || null;
}

function readLogo(html: string, pageUrl: string): string | null {
  const block = findElementsByClass(html, "div", DETAIL_LOGO_CLASS, 1)[0];
  if (!block) return null;
  for (const img of findElements(block.innerHtml, "img")) {
    const src = readAttribute(img.openTag, "src");
    const resolved = resolveUrl(src, pageUrl);
    if (resolved && !/placeholder/i.test(resolved)) return resolved;
  }
  return null;
}

function readSkills(html: string): string[] | null {
  const skills = findElements(html, "span", (openTag) => hasClass(openTag, DETAIL_SKILL_TAG_CLASS))
    .map((element) => htmlToInlineText(element.innerHtml))
    .filter(Boolean);
  const unique = [...new Set(skills)];
  return unique.length > 0 ? unique : null;
}

/** Duration/start-date are meaningful to an internship seeker but have no column — keep them as tags. */
function buildTags(items: Record<string, string>): string[] | null {
  const tags: string[] = [];
  const duration = items[DETAIL_HEADINGS.duration];
  const start = items[DETAIL_HEADINGS.startDate];
  if (duration) tags.push(`Duration: ${duration}`);
  if (start) tags.push(`Starts: ${start}`);
  return tags.length > 0 ? tags : null;
}

function buildWarnings(description: string | null, internshipId: string | null): string[] {
  const warnings: string[] = [];
  if (!description) warnings.push("Detail page had no 'About the internship' body.");
  if (!internshipId) {
    warnings.push("No internshipid attribute found; falling back to fingerprint dedup only.");
  }
  return warnings;
}

export function createInternshalaAdapter(
  fetcher: CrawlFetcher,
  limits: InternshalaLimits = DEFAULT_INTERNSHALA_LIMITS,
  observations: CrawlObservations = newObservations(),
): PlatformAdapter {
  return {
    platform: INTERNSHALA_PLATFORM,
    crawler: new InternshalaCrawler(fetcher, limits, observations),
    parser: new InternshalaParser(),
  };
}
