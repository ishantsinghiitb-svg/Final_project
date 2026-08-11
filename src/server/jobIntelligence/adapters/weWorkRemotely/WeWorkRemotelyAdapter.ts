// ── Module 10B.1: We Work Remotely adapter ──
//
// Crawls the OFFICIAL RSS feeds (https://weworkremotely.com/remote-jobs.rss
// and the per-category variants). WWR's robots.txt is `Allow: /`, the feeds
// are published for syndication, and every field this pipeline needs is
// already structured in the feed — so there is no reason to touch the HTML
// pages at all. This is the highest-fidelity, lowest-risk adapter in the
// module.
//
// Feed item shape (verified against the live feed):
//   <title>SimpleTiger LLC: B2B SaaS PPC Manager</title>   ← "Company: Role"
//   <region>Anywhere in the World</region>
//   <country> / <state>
//   <skills>PPC, PPC Management, and PPC Campaigns</skills>
//   <category>Sales and Marketing</category>
//   <type>Full-Time</type>
//   <description>…escaped HTML…</description>
//   <pubDate> / <expires_at> / <guid> / <link>
//   <media:content url="…logo.gif"/>
//
// Two real quirks, both handled explicitly below:
//   1. `title` packs company and role into one string separated by ": ", and
//      company names legitimately contain colons — so only the FIRST ": " is
//      a separator.
//   2. `skills` is an English list ("A, B, and C"), not a delimited field —
//      splitting on commas alone leaves a stray "and C".

import { collapseWhitespace, htmlToPlainText } from "../../parsers/html";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { EmploymentTypeValue, ParsedJobPosting } from "../../types";
import {
  extractFeedItems,
  readFeedAttribute,
  readFeedDate,
  readFeedField,
  readFeedLine,
} from "../../parsers/xmlFeed";
import { crawlErrorMessage, CrawlTargetError } from "../../crawl/errors";
import {
  newObservations,
  noteIncomplete,
  type CrawlObservations,
} from "../../crawl/CrawlObservations";
import type { CrawlFetcher } from "../../crawl/HttpFetcher";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "../types";
import { mapEmploymentType } from "../careerPages/ats/shared";
import type { RegionRelevance } from "../../crawl/relevance/regionRelevance";

export const WWR_PLATFORM = "weworkremotely";
export const WWR_SOURCE = "weworkremotely";
export const WWR_PARSER_VERSION = "weworkremotely-1.0.0";

const DEFAULT_FEED = "https://weworkremotely.com/remote-jobs.rss";
const MAX_ITEMS = 300;

/** Feed URL for a target; a bare category name resolves to its category feed. */
function feedUrlFor(target: CrawlTarget): string {
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
      if (!slug) return DEFAULT_FEED;
      return `https://weworkremotely.com/categories/${slug}.rss`;
    }
  }
}

export class WeWorkRemotelyCrawler implements PlatformCrawler {
  readonly platform = WWR_PLATFORM;

  constructor(
    private readonly fetcher: CrawlFetcher,
    private readonly maxItems: number = MAX_ITEMS,
    private readonly observations: CrawlObservations = newObservations(),
  ) {}

  async fetchRawPostings(target: CrawlTarget): Promise<RawJobPayload[]> {
    const feedUrl = feedUrlFor(target);
    const response = await this.fetcher.fetchText(feedUrl, {
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
    });

    if (!response.ok) {
      throw new CrawlTargetError(`We Work Remotely feed ${feedUrl}: ${response.reason}`, {
        blocked: response.kind === "blocked",
      });
    }

    const items = extractFeedItems(response.body);
    if (items.length === 0) {
      throw new CrawlTargetError(
        `We Work Remotely feed ${feedUrl} contained no <item> entries (is it a valid RSS URL?).`,
      );
    }

    // The feed is a fixed-size window, not a paginated archive: it is complete
    // by definition for what it publishes. The only way this crawl is NOT
    // complete is if our own cap trimmed it.
    if (items.length > this.maxItems) {
      noteIncomplete(
        this.observations,
        `Feed returned ${items.length} items; capped at ${this.maxItems}. Raise the cap — jobs are being dropped.`,
      );
    }

    const fetchedAt = new Date().toISOString();
    return items.slice(0, this.maxItems).map((itemXml) => ({
      platform: WWR_PLATFORM,
      sourceUrl: readFeedLine(itemXml, "link") ?? readFeedLine(itemXml, "guid") ?? feedUrl,
      fetchedAt,
      json: { itemXml, feedUrl },
    }));
  }
}

/** "Company: Role" → parts. Only the FIRST ": " separates; company names can contain colons. */
export function splitFeedTitle(title: string): { company: string | null; role: string | null } {
  const text = collapseWhitespace(title);
  if (!text) return { company: null, role: null };

  const separator = text.indexOf(": ");
  if (separator === -1) return { company: null, role: text };

  const company = collapseWhitespace(text.slice(0, separator));
  const role = collapseWhitespace(text.slice(separator + 2));
  if (!company || !role) return { company: null, role: text };
  return { company, role };
}

/** "PPC, PPC Management, and PPC Campaigns" → three skills. */
export function splitSkillList(raw: string | null): string[] | null {
  if (!raw) return null;
  const items = raw
    .split(/,|\band\b|\/|;/i)
    .map((part) => collapseWhitespace(part))
    .filter((part) => part.length > 1);
  const unique = [...new Set(items)];
  return unique.length > 0 ? unique : null;
}

/** WWR's `<region>` is remote-scope text ("Anywhere in the World", "USA Only"), never an office. */
function isWorldwide(region: string | null): boolean {
  return /anywhere|worldwide|global/i.test(region ?? "");
}

/**
 * Module 10B.3 Phase 1: classifies WWR's own applicant-eligibility signal.
 *
 * `<region>` is checked FIRST: it is WWR's own primary, human-facing
 * "Region Restrictions" badge, and an explicit "Anywhere in the World" there
 * is the strongest affirmative statement the feed can make that a posting is
 * open to everyone. `<country>` — verified against the live feed to be
 * either absent, a single country, or a comma-joined allowlist — is only
 * consulted when `<region>` does NOT already say worldwide, since it has
 * been observed set alongside an explicit "Anywhere in the World" region
 * (see the fixture in WeWorkRemotelyAdapter.test.ts) where treating it as a
 * hard restriction would incorrectly exclude a posting WWR itself calls
 * fully open — exactly the false-negative the India-first policy must not
 * produce. When `<region>` gives no worldwide signal, `<country>` is what
 * distinguishes a genuine restriction ("Texas" region + "USA" country) from
 * no restriction at all.
 *
 * `country` is expected already flag-emoji-stripped (see `stripFlagEmoji`) —
 * the same cleaned text `WeWorkRemotelyParser` stores on `job.country`.
 */
export function classifyWwrRegionRelevance(
  region: string | null,
  country: string | null,
): RegionRelevance {
  if (isWorldwide(region)) {
    return { classification: "worldwide", restrictedTo: null };
  }

  const cleanedCountry = collapseWhitespace(country ?? "");
  if (!cleanedCountry) {
    return { classification: "unrestricted", restrictedTo: null };
  }
  if (/india/i.test(cleanedCountry)) {
    return { classification: "india", restrictedTo: null };
  }
  return { classification: "restricted_non_india", restrictedTo: cleanedCountry };
}

const WWR_TYPE_MAP: Record<string, EmploymentTypeValue> = {
  "full-time": "Full-Time",
  "part-time": "Part-Time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
  temporary: "Temporary",
};

export class WeWorkRemotelyParser implements JobParser {
  readonly platform = WWR_PLATFORM;
  readonly version = WWR_PARSER_VERSION;

  parse(raw: RawJobPayload): ParseOutcome {
    try {
      const payload = raw.json as { itemXml?: string } | undefined;
      const itemXml = payload?.itemXml;
      if (typeof itemXml !== "string" || !itemXml.trim()) {
        return { ok: false, reason: "We Work Remotely payload carried no feed item." };
      }

      const rawTitle = readFeedLine(itemXml, "title");
      if (!rawTitle) return { ok: false, reason: "Feed item has no <title>." };

      const { company, role } = splitFeedTitle(rawTitle);
      if (!role)
        return { ok: false, reason: `Feed item title could not be parsed: "${rawTitle}".` };
      if (!company) {
        // Without an employer the row would be unusable and would poison the
        // company-based dedup tiers. Rejecting is the correct outcome.
        return { ok: false, reason: `Feed item title carries no company: "${rawTitle}".` };
      }

      const link = readFeedLine(itemXml, "link") ?? readFeedLine(itemXml, "guid");
      const region = readFeedLine(itemXml, "region");
      const country = readFeedLine(itemXml, "country");
      const state = readFeedLine(itemXml, "state");
      const category = readFeedLine(itemXml, "category");
      const typeText = readFeedLine(itemXml, "type");

      const description = htmlToPlainText(readFeedField(itemXml, "description"));

      // Every WWR posting is remote by definition — that is the entire premise
      // of the board — so `remote` is asserted, not inferred.
      const location = region ?? "Remote";
      const cleanedCountry = stripFlagEmoji(country);

      const parsed: ParsedJobPosting = {
        source: WWR_SOURCE,
        // The posting slug is WWR's stable public identifier and is what its
        // URLs are keyed on, so it is the right `source_job_id`.
        sourceJobId: slugFromUrl(link),
        sourceUrl: link,
        url: link,

        companyName: company,
        role,

        location,
        // `country`/`state` describe a hiring RESTRICTION ("USA Only"), not an
        // office — kept, but no city is invented from them.
        city: null,
        state,
        country: cleanedCountry,
        remote: true,
        workMode: "Remote",

        employmentType:
          (typeText ? WWR_TYPE_MAP[typeText.toLowerCase()] : undefined) ??
          mapEmploymentType(typeText),
        jobFunction: category,

        description: description || null,
        skills: splitSkillList(readFeedLine(itemXml, "skills")),
        tags: buildTags(category, region),

        companyLogoUrl: readFeedAttribute(itemXml, "media:content", "url"),

        postedAt: readFeedDate(itemXml, "pubDate"),
        expiryDate: readFeedDate(itemXml, "expires_at"),

        parserVersion: WWR_PARSER_VERSION,
        parserConfidence: description ? 0.95 : 0.7,
        extractionWarnings: buildWarnings(description, isWorldwide(region)),

        regionRelevance: classifyWwrRegionRelevance(region, cleanedCountry),
      };

      return { ok: true, job: parsed };
    } catch (err) {
      return { ok: false, reason: crawlErrorMessage(err, "We Work Remotely parse failed.") };
    }
  }
}

/** The posting slug from a WWR URL, e.g. ".../remote-jobs/acme-engineer" → "acme-engineer". */
function slugFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1];
    return slug ? decodeURIComponent(slug) : null;
  } catch {
    return null;
  }
}

/** WWR prefixes `<country>` with a flag emoji ("🇺🇸 United States of America"). */
function stripFlagEmoji(value: string | null): string | null {
  if (!value) return null;
  const cleaned = collapseWhitespace(value.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ""));
  return cleaned || null;
}

function buildTags(category: string | null, region: string | null): string[] | null {
  const tags = [category, region].filter((tag): tag is string => Boolean(tag));
  return tags.length > 0 ? [...new Set(tags)] : null;
}

function buildWarnings(description: string, worldwide: boolean): string[] {
  const warnings: string[] = [];
  if (!description) warnings.push("Feed item had no description body.");
  if (worldwide) warnings.push("Region is worldwide; no geographic location recorded.");
  return warnings;
}

export function createWeWorkRemotelyAdapter(
  fetcher: CrawlFetcher,
  observations: CrawlObservations = newObservations(),
): PlatformAdapter {
  return {
    platform: WWR_PLATFORM,
    crawler: new WeWorkRemotelyCrawler(fetcher, MAX_ITEMS, observations),
    parser: new WeWorkRemotelyParser(),
  };
}
