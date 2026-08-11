// ── Lever postings API ──
//
//   GET https://api.lever.co/v0/postings/{token}?mode=json
//
// Public, no key; returns a bare ARRAY (no envelope). Lever splits a posting
// body across four fields and none of them is the whole thing:
//   `description`      — the opening blurb (HTML)
//   `lists[]`          — the structured sections ({ text: heading, content: <li> markup })
//   `additional`       — the closing blurb (HTML)
//   `descriptionBody`  — blurb WITHOUT the header, not always present
// Reassembling description + lists + additional is what produces a complete
// posting; using `description` alone silently drops the requirements.
//
// `lists` is also where requirements/responsibilities come from as real
// structured arrays, so those columns get populated rather than left null.

import {
  htmlToPlainText,
  collapseWhitespace,
  htmlToInlineText,
  findElements,
} from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import {
  inferExperienceLevelFromTitle,
  looksRemote,
  mapEmploymentType,
  mapWorkMode,
  pickString,
  splitLocationText,
  toIsoDate,
} from "./shared";
import {
  ATS_SOURCE_TAG,
  type AtsBoard,
  type AtsCrawlResult,
  type AtsPostingPayload,
  type AtsProvider,
} from "./types";

export const LEVER_PARSER_VERSION = "lever-1.0.0";

type LeverList = { text?: string; content?: string };

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number | string;
  country?: string;
  workplaceType?: string;
  description?: string;
  descriptionBody?: string;
  additional?: string;
  lists?: LeverList[];
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

/** Lever's own maximum page size. */
const LEVER_PAGE_SIZE = 100;

function boardEndpoint(board: AtsBoard): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(board.token)}?mode=json`;
}

function pageEndpoint(board: AtsBoard, skip: number): string {
  return `${boardEndpoint(board)}&limit=${LEVER_PAGE_SIZE}&skip=${skip}`;
}

/** Lever's salary `interval` is e.g. "per-year-salary" / "per-hour-wage". */
function mapSalaryInterval(interval: string | undefined): string | null {
  const text = (interval ?? "").toLowerCase();
  if (!text) return null;
  if (text.includes("hour")) return "Hourly";
  if (text.includes("day")) return "Daily";
  if (text.includes("week")) return "Weekly";
  if (text.includes("month")) return "Monthly";
  if (text.includes("year") || text.includes("annum")) return "Yearly";
  return null;
}

/** Heading keywords that mark a `lists[]` section as requirements vs responsibilities. */
const REQUIREMENT_HEADINGS =
  /(requirement|qualification|you have|looking for|skills|about you|experience)/i;
const RESPONSIBILITY_HEADINGS =
  /(responsibilit|what you.?ll do|you will|the role|day to day|impact)/i;
const BENEFIT_HEADINGS = /(benefit|perk|we offer|compensation|why join)/i;

/** Splits a `<li>`-markup blob into clean text items. */
function listItems(content: string | undefined): string[] {
  if (!content) return [];
  const items = findElements(content, "li").map((element) => htmlToInlineText(element.innerHtml));
  if (items.length > 0) return items.filter(Boolean);
  const fallback = htmlToPlainText(content)
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  return fallback;
}

export const leverProvider: AtsProvider = {
  id: "lever",
  boardUrl: boardEndpoint,

  async crawl(board, fetcher, limits): Promise<AtsCrawlResult> {
    // Lever returns a whole board in one response for every board observed
    // (leverdemo: 388 postings, unchanged by `limit=1000`), but it DOES honour
    // `skip`, and its per-request ceiling is not documented. So rather than
    // trusting one response to be complete, this pages forward with `skip`
    // until a short page — which costs exactly one extra request on a board
    // that already fit, and is the difference between "we got everything" and
    // "we got whatever the first page happened to hold" on a board that grows.
    const fetchedAt = new Date().toISOString();
    const raws: RawJobPayload[] = [];
    const warnings: string[] = [];
    const seenIds = new Set<string>();

    for (let skip = 0; raws.length < limits.maxPostings; skip += LEVER_PAGE_SIZE) {
      const response = await fetcher.fetchText(pageEndpoint(board, skip), {
        accept: "application/json",
      });

      if (!response.ok) {
        if (skip === 0) {
          return {
            raws: [],
            warnings,
            failure: {
              reason: `lever board "${board.token}": ${response.reason}`,
              blocked: response.kind === "blocked",
            },
          };
        }
        warnings.push(`Pagination stopped at skip=${skip}: ${response.reason}`);
        break;
      }

      let page: unknown;
      try {
        page = JSON.parse(response.body);
      } catch {
        if (skip === 0) {
          return {
            raws: [],
            warnings,
            failure: {
              reason: `lever board "${board.token}" did not return JSON.`,
              blocked: false,
            },
          };
        }
        warnings.push(`Pagination stopped at skip=${skip}: response was not JSON.`);
        break;
      }

      // Lever returns the array at the top level, with no envelope.
      if (!Array.isArray(page)) {
        if (skip === 0) {
          return {
            raws: [],
            warnings,
            failure: {
              reason: `lever board "${board.token}" returned an unexpected payload shape.`,
              blocked: false,
            },
          };
        }
        break;
      }

      let added = 0;
      for (const posting of page) {
        if (raws.length >= limits.maxPostings) break;
        // A board that ignores `skip` would otherwise re-serve page 1 forever.
        const id = pickString(posting, "id");
        if (id) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        added++;
        raws.push({
          platform: ATS_SOURCE_TAG.lever,
          sourceUrl:
            pickString(posting, "hostedUrl") ??
            `https://jobs.lever.co/${board.token}/${pickString(posting, "id") ?? ""}`,
          fetchedAt,
          json: { provider: "lever", board, posting } satisfies AtsPostingPayload,
        });
      }

      // Short page = no more; zero NEW postings = the board is ignoring `skip`.
      if (page.length < LEVER_PAGE_SIZE || added === 0) break;
    }

    if (raws.length === 0) {
      warnings.push(`lever board "${board.token}" returned 0 postings.`);
    }
    return { raws, warnings };
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const posting = payload.posting as LeverPosting | null;
    if (!posting || typeof posting !== "object") {
      return { ok: false, reason: "Lever posting payload was not an object." };
    }

    const role = collapseWhitespace(posting.text ?? "");
    if (!role) return { ok: false, reason: "Lever posting has no title." };

    const companyName = payload.board.companyName;
    if (!companyName) return { ok: false, reason: "Lever posting has no company name." };

    const categories = posting.categories ?? {};

    // Reassemble the full body: blurb → sections → closing.
    const sections: string[] = [];
    const opening = htmlToPlainText(posting.description ?? posting.descriptionBody ?? "");
    if (opening) sections.push(opening);

    const requirements: string[] = [];
    const responsibilities: string[] = [];
    const benefits: string[] = [];

    for (const list of posting.lists ?? []) {
      const heading = collapseWhitespace(list?.text ?? "");
      const items = listItems(list?.content);
      if (items.length === 0) continue;

      if (heading) sections.push(`${heading}\n${items.map((item) => `- ${item}`).join("\n")}`);
      else sections.push(items.map((item) => `- ${item}`).join("\n"));

      if (BENEFIT_HEADINGS.test(heading)) benefits.push(...items);
      else if (RESPONSIBILITY_HEADINGS.test(heading)) responsibilities.push(...items);
      else if (REQUIREMENT_HEADINGS.test(heading)) requirements.push(...items);
    }

    const closing = htmlToPlainText(posting.additional ?? "");
    if (closing) sections.push(closing);

    const description = sections.join("\n\n").trim() || null;
    const locationText =
      collapseWhitespace(categories.location ?? "") ||
      collapseWhitespace(categories.allLocations?.[0] ?? "") ||
      null;
    const { location, city, state, country } = splitLocationText(locationText);

    const workMode = mapWorkMode(posting.workplaceType);
    const remote = workMode === "Remote" || looksRemote(locationText, posting.workplaceType);

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.lever,
      sourceJobId: posting.id ? String(posting.id) : null,
      sourceUrl: raw.sourceUrl,
      url: posting.applyUrl ?? posting.hostedUrl ?? raw.sourceUrl,

      companyName,
      role,

      location,
      city,
      state,
      // Lever carries a top-level ISO country code alongside the text location.
      country: country ?? (posting.country ? posting.country.toUpperCase() : null),
      remote,
      workMode,

      employmentType: mapEmploymentType(categories.commitment),
      experienceLevel: inferExperienceLevelFromTitle(role),
      department: collapseWhitespace(categories.department ?? "") || null,
      jobFunction: collapseWhitespace(categories.team ?? "") || null,

      salaryMin: typeof posting.salaryRange?.min === "number" ? posting.salaryRange.min : null,
      salaryMax: typeof posting.salaryRange?.max === "number" ? posting.salaryRange.max : null,
      salaryCurrency: posting.salaryRange?.currency ?? null,
      salaryPeriod: mapSalaryInterval(posting.salaryRange?.interval),

      description,
      requirements: requirements.length > 0 ? requirements : null,
      responsibilities: responsibilities.length > 0 ? responsibilities : null,
      benefits: benefits.length > 0 ? benefits : null,

      companyCareerUrl: payload.board.careersUrl,
      postedAt: toIsoDate(posting.createdAt),

      parserVersion: LEVER_PARSER_VERSION,
      parserConfidence: description ? 0.95 : 0.75,
      extractionWarnings: description ? [] : ["Lever posting had no description sections."],
    };

    return { ok: true, job: parsed };
  },
};
