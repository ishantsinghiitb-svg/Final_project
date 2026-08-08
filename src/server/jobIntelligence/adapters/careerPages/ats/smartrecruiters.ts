// ── SmartRecruiters Posting API ──
//
//   GET https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset=N
//
// Public, no key. Two things make it different from the other providers:
//
//   1. It PAGINATES (100 max per page), so a single fetch under-reports a
//      large employer. This crawls forward until a short page or the limit.
//   2. The list response carries NO description — that lives on the per-posting
//      detail endpoint. Rather than issue one detail request per posting
//      (hundreds of requests against a public API), postings are imported from
//      the list with their rich structured fields (location, department,
//      function, employment type, experience level, industry) and a null
//      description. The extraction warning records that, so the gap is visible
//      in the crawl report instead of looking like a parse bug.

import { collapseWhitespace } from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ExperienceLevelValue, ParsedJobPosting } from "../../../types";
import { inferExperienceLevelFromTitle, mapEmploymentType, pickString, toIsoDate } from "./shared";
import {
  ATS_SOURCE_TAG,
  type AtsBoard,
  type AtsCrawlLimits,
  type AtsCrawlResult,
  type AtsPostingPayload,
  type AtsProvider,
} from "./types";
import type { CrawlFetcher } from "../../../crawl/HttpFetcher";

export const SMARTRECRUITERS_PARSER_VERSION = "smartrecruiters-1.0.0";

const PAGE_SIZE = 100;

type SmartRecruitersPosting = {
  id?: string;
  uuid?: string;
  name?: string;
  refNumber?: string;
  ref?: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    hybrid?: boolean;
    fullLocation?: string;
  };
  industry?: { label?: string };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { id?: string; label?: string };
};

const EXPERIENCE_LEVEL_MAP: Record<string, ExperienceLevelValue> = {
  internship: "Intern",
  entry_level: "Entry-Level",
  associate: "Junior",
  mid_senior_level: "Mid-Level",
  director: "Lead",
  executive: "Principal",
  student: "Intern",
};

function pageEndpoint(board: AtsBoard, offset: number): string {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.token)}/postings?limit=${PAGE_SIZE}&offset=${offset}`;
}

export const smartRecruitersProvider: AtsProvider = {
  id: "smartrecruiters",
  boardUrl: (board) => pageEndpoint(board, 0),

  async crawl(
    board: AtsBoard,
    fetcher: CrawlFetcher,
    limits: AtsCrawlLimits,
  ): Promise<AtsCrawlResult> {
    const fetchedAt = new Date().toISOString();
    const raws: RawJobPayload[] = [];
    const warnings: string[] = [];

    for (let offset = 0; raws.length < limits.maxPostings; offset += PAGE_SIZE) {
      const response = await fetcher.fetchText(pageEndpoint(board, offset), {
        accept: "application/json",
      });

      if (!response.ok) {
        // A failure on page 1 is fatal for this board; a failure mid-pagination
        // still leaves real jobs collected, so it degrades to a warning.
        if (offset === 0) {
          return {
            raws: [],
            warnings,
            failure: {
              reason: `smartrecruiters board "${board.token}": ${response.reason}`,
              blocked: response.kind === "blocked",
            },
          };
        }
        warnings.push(`Pagination stopped at offset ${offset}: ${response.reason}`);
        break;
      }

      let body: unknown;
      try {
        body = JSON.parse(response.body);
      } catch {
        warnings.push(`Pagination stopped at offset ${offset}: response was not JSON.`);
        break;
      }

      const content = (body as { content?: unknown })?.content;
      if (!Array.isArray(content)) {
        if (offset === 0) {
          return {
            raws: [],
            warnings,
            failure: {
              reason: `smartrecruiters board "${board.token}" returned an unexpected payload shape.`,
              blocked: false,
            },
          };
        }
        break;
      }

      for (const posting of content) {
        if (raws.length >= limits.maxPostings) break;
        const json: AtsPostingPayload = { provider: "smartrecruiters", board, posting };
        raws.push({
          platform: ATS_SOURCE_TAG.smartrecruiters,
          sourceUrl: postingUrl(posting, board),
          fetchedAt,
          json,
        });
      }

      // A short page means there is no next page.
      if (content.length < PAGE_SIZE) break;
    }

    if (raws.length === 0 && warnings.length === 0) {
      warnings.push(`smartrecruiters board "${board.token}" returned 0 postings.`);
    }
    return { raws, warnings };
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const posting = payload.posting as SmartRecruitersPosting | null;
    if (!posting || typeof posting !== "object") {
      return { ok: false, reason: "SmartRecruiters posting payload was not an object." };
    }

    const role = collapseWhitespace(posting.name ?? "");
    if (!role) return { ok: false, reason: "SmartRecruiters posting has no title." };

    const companyName =
      collapseWhitespace(posting.company?.name ?? "") || payload.board.companyName;
    if (!companyName) return { ok: false, reason: "SmartRecruiters posting has no company name." };

    const location = posting.location ?? {};
    const remote = location.remote === true;
    const hybrid = location.hybrid === true;

    const experienceId = collapseWhitespace(posting.experienceLevel?.id ?? "").toLowerCase();
    const experienceLevel =
      EXPERIENCE_LEVEL_MAP[experienceId] ?? inferExperienceLevelFromTitle(role);

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.smartrecruiters,
      sourceJobId: posting.id ? String(posting.id) : (posting.uuid ?? null),
      sourceUrl: raw.sourceUrl,
      url: raw.sourceUrl,

      companyName,
      role,

      location:
        collapseWhitespace(location.fullLocation ?? "") ||
        [location.city, location.region, location.country].filter(Boolean).join(", ") ||
        null,
      city: collapseWhitespace(location.city ?? "") || null,
      state: collapseWhitespace(location.region ?? "") || null,
      // The API returns lowercase ISO country codes ("us").
      country: location.country ? location.country.toUpperCase() : null,
      remote,
      workMode: remote ? "Remote" : hybrid ? "Hybrid" : "Onsite",

      employmentType: mapEmploymentType(posting.typeOfEmployment?.label),
      experienceLevel,
      department: collapseWhitespace(posting.department?.label ?? "") || null,
      jobFunction: collapseWhitespace(posting.function?.label ?? "") || null,
      industry: collapseWhitespace(posting.industry?.label ?? "") || null,

      // Deliberately null: the list endpoint carries no body. See the header.
      description: null,

      companyCareerUrl: payload.board.careersUrl,
      postedAt: toIsoDate(posting.releasedDate),

      parserVersion: SMARTRECRUITERS_PARSER_VERSION,
      parserConfidence: 0.7,
      extractionWarnings: [
        "SmartRecruiters list API carries no job description; structured fields only.",
      ],
    };

    return { ok: true, job: parsed };
  },
};

/**
 * The PUBLIC posting URL. Deliberately not the API's own `ref` field — that
 * is the api.smartrecruiters.com self-link, which is a machine endpoint, not
 * something a candidate can open and apply from.
 */
function postingUrl(posting: unknown, board: AtsBoard): string {
  const id = pickString(posting, "id") ?? pickString(posting, "uuid") ?? "";
  return `https://jobs.smartrecruiters.com/${encodeURIComponent(board.token)}/${id}`;
}
