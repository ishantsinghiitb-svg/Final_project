// ── Generic careers page (schema.org JSON-LD) ──
//
// The fallback for a careers page that is not on a recognized ATS. It reads
// the schema.org `JobPosting` markup Google for Jobs requires, which is the
// closest thing to a universal contract a bespoke careers page offers.
//
// Two-stage by necessity: an index page usually lists roles as links and
// carries no `JobPosting` markup itself, while each detail page carries one.
// So:
//   1. Read the careers URL. If it already has `JobPosting` nodes, use them
//      (some sites embed every posting on the index) and stop.
//   2. Otherwise, discover same-host links that look like postings, fetch up
//      to `maxDetailFetches` of them, and read each one's JSON-LD.
//
// Deliberately conservative: same-host links only, a hard fetch cap, and a
// page with no JSON-LD yields NOTHING rather than a guess scraped from
// headings. A wrong extraction is worse than none — the same posture the
// decommissioned extension Generic Parser was pulled for violating.

import { collapseWhitespace, findElements, readAttribute, resolveUrl } from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import {
  findJobPostingNodes,
  readBaseSalary,
  readDate,
  readDescription,
  readHiringOrganization,
  readJobLocation,
  readString,
  readStringList,
  type JsonLdObject,
} from "../../../parsers/jsonLd";
import { inferExperienceLevelFromTitle, looksRemote, mapEmploymentType } from "./shared";
import {
  ATS_SOURCE_TAG,
  type AtsBoard,
  type AtsCrawlLimits,
  type AtsCrawlResult,
  type AtsPostingPayload,
  type AtsProvider,
} from "./types";
import type { CrawlFetcher } from "../../../crawl/HttpFetcher";

export const JSONLD_PARSER_VERSION = "careers-jsonld-1.0.0";

/** Path fragments that mark a link as a plausible job posting. */
const JOB_LINK_PATTERNS = [
  /\/job[s]?\//i,
  /\/career[s]?\//i,
  /\/opening[s]?\//i,
  /\/position[s]?\//i,
  /\/vacanc(y|ies)\//i,
  /\/role[s]?\//i,
  /\/opportunit(y|ies)\//i,
];

/** Paths that look job-ish but never are. */
const JOB_LINK_EXCLUSIONS = [
  /\/(login|signin|signup|apply|search|filter|privacy|terms|cookie|blog|news|press|about|contact|faq)(\/|$)/i,
  /\.(pdf|png|jpe?g|gif|svg|zip|docx?)$/i,
];

/** The JSON-LD payload shape for one discovered page. */
type JsonLdPagePosting = { node: JsonLdObject; pageUrl: string };

function looksLikeJobLink(url: string, baseHost: string, careersUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.host.toLowerCase() !== baseHost) return false;
  if (parsed.toString().replace(/\/$/, "") === careersUrl.replace(/\/$/, "")) return false;
  if (JOB_LINK_EXCLUSIONS.some((pattern) => pattern.test(parsed.pathname))) return false;
  return JOB_LINK_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
}

/** Same-host, plausible posting links from a page, de-duplicated in document order. */
export function discoverJobLinks(html: string, pageUrl: string): string[] {
  let baseHost: string;
  try {
    baseHost = new URL(pageUrl).host.toLowerCase();
  } catch {
    return [];
  }

  const seen = new Set<string>();
  for (const anchor of findElements(html, "a")) {
    const resolved = resolveUrl(readAttribute(anchor.openTag, "href"), pageUrl);
    if (!resolved) continue;
    // Fragments and tracking params make the same posting look like many.
    const canonical = resolved.split("#")[0];
    if (!looksLikeJobLink(canonical, baseHost, pageUrl)) continue;
    seen.add(canonical);
  }
  return [...seen];
}

export const jsonLdBoardProvider: AtsProvider = {
  id: "jsonld",
  boardUrl: (board) => board.careersUrl,

  async crawl(
    board: AtsBoard,
    fetcher: CrawlFetcher,
    limits: AtsCrawlLimits,
  ): Promise<AtsCrawlResult> {
    const fetchedAt = new Date().toISOString();
    const warnings: string[] = [];

    const index = await fetcher.fetchText(board.careersUrl);
    if (!index.ok) {
      return {
        raws: [],
        warnings,
        failure: {
          reason: `Careers page ${board.careersUrl}: ${index.reason}`,
          blocked: index.kind === "blocked",
        },
      };
    }

    const build = (posting: JsonLdPagePosting): RawJobPayload => {
      const json: AtsPostingPayload = { provider: "jsonld", board, posting };
      return { platform: ATS_SOURCE_TAG.jsonld, sourceUrl: posting.pageUrl, fetchedAt, json };
    };

    // Stage 1: postings embedded on the index page itself.
    const onIndex = findJobPostingNodes(index.body);
    if (onIndex.length > 0) {
      return {
        raws: onIndex
          .slice(0, limits.maxPostings)
          .map((node) => build({ node, pageUrl: index.url })),
        warnings,
      };
    }

    // Stage 2: follow discovered links.
    const links = discoverJobLinks(index.body, index.url);
    if (links.length === 0) {
      return {
        raws: [],
        warnings,
        failure: {
          reason:
            `Careers page ${board.careersUrl} has no schema.org JobPosting markup and no ` +
            `recognizable posting links. It likely renders its jobs with JavaScript — ` +
            `register the company's ATS board URL instead (Greenhouse/Lever/Ashby/…).`,
          blocked: false,
        },
      };
    }

    const budget = Math.min(links.length, limits.maxDetailFetches, limits.maxPostings);
    if (links.length > budget) {
      warnings.push(`Found ${links.length} posting links; fetched the first ${budget}.`);
    }

    const raws: RawJobPayload[] = [];
    let pagesWithoutMarkup = 0;

    for (const link of links.slice(0, budget)) {
      const page = await fetcher.fetchText(link);
      if (!page.ok) {
        warnings.push(`${link}: ${page.reason}`);
        continue;
      }
      const nodes = findJobPostingNodes(page.body);
      if (nodes.length === 0) {
        pagesWithoutMarkup++;
        continue;
      }
      for (const node of nodes) {
        raws.push(build({ node, pageUrl: page.url }));
      }
    }

    if (pagesWithoutMarkup > 0) {
      warnings.push(`${pagesWithoutMarkup} linked page(s) carried no JobPosting markup.`);
    }
    if (raws.length === 0) {
      return {
        raws,
        warnings,
        failure: {
          reason: `No schema.org JobPosting markup found on ${budget} page(s) under ${board.careersUrl}.`,
          blocked: false,
        },
      };
    }

    return { raws, warnings };
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const posting = payload.posting as JsonLdPagePosting | null;
    const node = posting?.node;
    if (!node || typeof node !== "object") {
      return { ok: false, reason: "JSON-LD payload carried no JobPosting node." };
    }

    const role = readString(node.title) ?? readString(node.name);
    if (!role) return { ok: false, reason: "JobPosting has no title." };

    const organization = readHiringOrganization(node);
    const companyName = organization.name ?? payload.board.companyName;
    if (!companyName) return { ok: false, reason: "JobPosting has no hiring organization." };

    const place = readJobLocation(node);
    const salary = readBaseSalary(node);
    const employmentTypes = readStringList(node.employmentType);
    const description = readDescription(node);

    const remoteFlag =
      readString(node.jobLocationType)?.toUpperCase() === "TELECOMMUTE" ||
      looksRemote(place.location, role);

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.jsonld,
      // schema.org `identifier` is the posting's own id when present; the page
      // URL is the fallback identity (still stable per posting).
      sourceJobId: readString(node.identifier) ?? null,
      sourceUrl: raw.sourceUrl,
      url: readString(node.url) ?? raw.sourceUrl,

      companyName,
      role,

      location: place.location,
      city: place.city,
      state: place.state,
      country: place.country,
      remote: remoteFlag,
      workMode: remoteFlag ? "Remote" : null,

      employmentType: mapEmploymentType(employmentTypes[0]),
      experienceLevel: inferExperienceLevelFromTitle(role),
      industry: readString(node.industry),
      jobFunction: readString(node.occupationalCategory),

      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryPeriod: salary.period,

      description,
      skills: normalizeList(node.skills),
      requirements: normalizeList(node.qualifications ?? node.experienceRequirements),
      responsibilities: normalizeList(node.responsibilities),
      benefits: normalizeList(node.jobBenefits),

      companyUrl: organization.url,
      companyLogoUrl: organization.logo,
      companyCareerUrl: payload.board.careersUrl,

      postedAt: readDate(node.datePosted),
      expiryDate: readDate(node.validThrough),

      parserVersion: JSONLD_PARSER_VERSION,
      parserConfidence: description ? 0.85 : 0.6,
      extractionWarnings: description ? [] : ["JobPosting markup carried no description."],
    };

    return { ok: true, job: parsed };
  },
};

/**
 * schema.org list-ish fields are frequently ONE comma/newline-delimited
 * string rather than an array — split those so `skills` lands as real items.
 */
function normalizeList(value: unknown): string[] | null {
  const entries = readStringList(value);
  if (entries.length === 0) return null;

  const items = entries.flatMap((entry) =>
    entry
      .split(/[,\n;•]/)
      .map((part) => collapseWhitespace(part.replace(/^[-*]\s*/, "")))
      .filter(Boolean),
  );
  const unique = [...new Set(items)];
  return unique.length > 0 ? unique : null;
}
