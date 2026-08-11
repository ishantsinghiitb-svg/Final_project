// ── Ashby posting API ──
//
//   GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
//
// Public, no key. The richest of the ATS feeds: `descriptionHtml` AND
// `descriptionPlain` are both present, `workplaceType` is a real enum, and
// `compensation` carries structured salary components when the board opts in.
//
// Two gotchas worth naming:
//   - `isListed: false` postings appear in the payload but are NOT public
//     (draft/internal). Importing them would publish something the company
//     hasn't. They are filtered out at crawl time.
//   - `compensation.compensationTiers[]` may hold several components (base,
//     equity, bonus). Only the SALARY component is a salary; summing them
//     would inflate every range. Ashby also exposes a pre-summarized
//     `compensationTierSummary` string, kept verbatim as `salary_text`.

import { collapseWhitespace, htmlToPlainText } from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import {
  crawlJsonBoard,
  inferExperienceLevelFromTitle,
  looksRemote,
  mapEmploymentType,
  mapWorkMode,
  pickString,
  splitLocationText,
  toIsoDate,
} from "./shared";
import { ATS_SOURCE_TAG, type AtsBoard, type AtsPostingPayload, type AtsProvider } from "./types";

export const ASHBY_PARSER_VERSION = "ashby-1.0.0";

type AshbyAddress = {
  postalAddress?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
  };
};

type AshbyCompensationComponent = {
  compensationType?: string;
  interval?: string;
  currencyCode?: string;
  minValue?: number;
  maxValue?: number;
  summary?: string;
};

type AshbyPosting = {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string; address?: AshbyAddress }>;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  address?: AshbyAddress;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTierSummary?: string;
    summaryComponents?: AshbyCompensationComponent[];
    compensationTiers?: Array<{ components?: AshbyCompensationComponent[] }>;
  };
};

function boardEndpoint(board: AtsBoard): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=true`;
}

function mapInterval(interval: string | undefined): string | null {
  const text = (interval ?? "").toUpperCase();
  if (text.includes("HOUR")) return "Hourly";
  if (text.includes("DAY")) return "Daily";
  if (text.includes("WEEK")) return "Weekly";
  if (text.includes("MONTH")) return "Monthly";
  if (text.includes("YEAR") || text.includes("ANNUAL")) return "Yearly";
  return null;
}

/** The base-salary component only — equity/bonus components are not salary. */
function readSalaryComponent(posting: AshbyPosting): AshbyCompensationComponent | null {
  const pools: AshbyCompensationComponent[] = [
    ...(posting.compensation?.summaryComponents ?? []),
    ...(posting.compensation?.compensationTiers ?? []).flatMap((tier) => tier.components ?? []),
  ];
  return (
    pools.find(
      (component) =>
        (component?.compensationType ?? "").toLowerCase() === "salary" &&
        (typeof component.minValue === "number" || typeof component.maxValue === "number"),
    ) ?? null
  );
}

export const ashbyProvider: AtsProvider = {
  id: "ashby",
  boardUrl: boardEndpoint,

  crawl(board, fetcher, limits) {
    return crawlJsonBoard({
      board,
      fetcher,
      limits,
      endpoint: boardEndpoint(board),
      platform: ATS_SOURCE_TAG.ashby,
      selectPostings: (body) => {
        const jobs = (body as { jobs?: unknown })?.jobs;
        if (!Array.isArray(jobs)) return null;
        // Unlisted postings are drafts/internal — never import them.
        return jobs.filter((job) => (job as AshbyPosting)?.isListed !== false);
      },
      sourceUrlOf: (posting, resolved) =>
        pickString(posting, "jobUrl") ??
        `https://jobs.ashbyhq.com/${resolved.token}/${pickString(posting, "id") ?? ""}`,
      // Drafts are excluded above; reported so a board of drafts is visibly
      // different from an empty board.
      countSkipped: (body) => {
        const jobs = (body as { jobs?: unknown })?.jobs;
        if (!Array.isArray(jobs)) return 0;
        return jobs.filter((job) => (job as AshbyPosting)?.isListed === false).length;
      },
    });
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const posting = payload.posting as AshbyPosting | null;
    if (!posting || typeof posting !== "object") {
      return { ok: false, reason: "Ashby posting payload was not an object." };
    }

    const role = collapseWhitespace(posting.title ?? "");
    if (!role) return { ok: false, reason: "Ashby posting has no title." };

    const companyName = payload.board.companyName;
    if (!companyName) return { ok: false, reason: "Ashby posting has no company name." };

    const description =
      collapseWhitespace(posting.descriptionPlain ?? "") ||
      htmlToPlainText(posting.descriptionHtml ?? "") ||
      null;

    const address = posting.address?.postalAddress;
    const locationText = collapseWhitespace(posting.location ?? "") || null;
    const fallback = splitLocationText(locationText);

    const salary = readSalaryComponent(posting);
    const workMode = mapWorkMode(posting.workplaceType);
    const remote = posting.isRemote === true || workMode === "Remote" || looksRemote(locationText);

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.ashby,
      sourceJobId: posting.id ? String(posting.id) : null,
      sourceUrl: raw.sourceUrl,
      url: posting.applyUrl ?? posting.jobUrl ?? raw.sourceUrl,

      companyName,
      role,

      location: locationText,
      // Structured address wins over the parsed-from-text fallback.
      city: collapseWhitespace(address?.addressLocality ?? "") || fallback.city,
      state: collapseWhitespace(address?.addressRegion ?? "") || fallback.state,
      country: collapseWhitespace(address?.addressCountry ?? "") || fallback.country,
      remote,
      workMode: workMode ?? (remote ? "Remote" : null),

      employmentType: mapEmploymentType(posting.employmentType),
      experienceLevel: inferExperienceLevelFromTitle(role),
      department: collapseWhitespace(posting.department ?? "") || null,
      jobFunction: collapseWhitespace(posting.team ?? "") || null,

      salaryMin: typeof salary?.minValue === "number" ? salary.minValue : null,
      salaryMax: typeof salary?.maxValue === "number" ? salary.maxValue : null,
      salaryCurrency: salary?.currencyCode ?? null,
      salaryPeriod: mapInterval(salary?.interval),
      salaryText:
        collapseWhitespace(posting.compensation?.compensationTierSummary ?? "") ||
        collapseWhitespace(salary?.summary ?? "") ||
        null,

      description,
      descriptionHtml: posting.descriptionHtml ?? null,

      // Secondary locations are genuinely useful signal (a role open in
      // several offices) and have nowhere structured to go — tags is the
      // free-form channel `global_jobs` provides.
      tags: buildLocationTags(posting),

      companyCareerUrl: payload.board.careersUrl,
      postedAt: toIsoDate(posting.publishedAt),

      parserVersion: ASHBY_PARSER_VERSION,
      parserConfidence: description ? 0.95 : 0.8,
      extractionWarnings: description ? [] : ["Ashby posting had no description."],
    };

    return { ok: true, job: parsed };
  },
};

function buildLocationTags(posting: AshbyPosting): string[] | null {
  const extras = (posting.secondaryLocations ?? [])
    .map((entry) => collapseWhitespace(entry?.location ?? ""))
    .filter(Boolean);
  return extras.length > 0 ? [...new Set(extras)] : null;
}
