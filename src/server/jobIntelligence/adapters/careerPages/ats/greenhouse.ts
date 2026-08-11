// ── Greenhouse job board API ──
//
//   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
//
// Public and documented, no key. `content=true` returns the full posting body,
// which arrives HTML-ESCAPED inside a JSON string (`&lt;p&gt;…`) — so it needs
// entity-decoding BEFORE tag-stripping, otherwise the tags survive as literal
// text in the stored description. That double-encoding is the one real trap in
// this API.
//
// Field notes:
//   - `id` is the board-scoped posting id and the stable `source_job_id`.
//   - `absolute_url` is the canonical posting URL (often on the company's own
//     domain, e.g. stripe.com/jobs/search?gh_jid=…).
//   - `location.name` is free text; `offices[]` carries the structured-ish form.
//   - `first_published` is the posting date; `updated_at` is not.

import { decodeHtmlEntities, htmlToPlainText, collapseWhitespace } from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import {
  crawlJsonBoard,
  inferExperienceLevelFromTitle,
  looksRemote,
  mapEmploymentType,
  pickString,
  splitLocationText,
  toIsoDate,
} from "./shared";
import { ATS_SOURCE_TAG, type AtsBoard, type AtsPostingPayload, type AtsProvider } from "./types";

export const GREENHOUSE_PARSER_VERSION = "greenhouse-1.0.0";

type GreenhouseJob = {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  content?: string;
  company_name?: string;
  first_published?: string;
  updated_at?: string;
  requisition_id?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
};

function boardEndpoint(board: AtsBoard): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs?content=true`;
}

export const greenhouseProvider: AtsProvider = {
  id: "greenhouse",
  boardUrl: boardEndpoint,

  crawl(board, fetcher, limits) {
    return crawlJsonBoard({
      board,
      fetcher,
      limits,
      endpoint: boardEndpoint(board),
      platform: ATS_SOURCE_TAG.greenhouse,
      selectPostings: (body) => {
        const jobs = (body as { jobs?: unknown })?.jobs;
        return Array.isArray(jobs) ? jobs : null;
      },
      sourceUrlOf: (posting, resolved) =>
        pickString(posting, "absolute_url") ??
        `https://boards.greenhouse.io/${resolved.token}/jobs/${pickString(posting, "id") ?? ""}`,
      // Greenhouse publishes `meta.total`, so completeness is verifiable.
      reportedTotal: (body) => {
        const total = (body as { meta?: { total?: unknown } })?.meta?.total;
        return typeof total === "number" ? total : null;
      },
    });
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const job = payload.posting as GreenhouseJob | null;
    if (!job || typeof job !== "object") {
      return { ok: false, reason: "Greenhouse posting payload was not an object." };
    }

    const role = collapseWhitespace(job.title ?? "");
    if (!role) return { ok: false, reason: "Greenhouse posting has no title." };

    const companyName = collapseWhitespace(job.company_name ?? "") || payload.board.companyName;
    if (!companyName) return { ok: false, reason: "Greenhouse posting has no company name." };

    // Escaped-HTML-in-JSON: decode entities first, then strip tags.
    const descriptionHtml = job.content ? decodeHtmlEntities(job.content) : null;
    const description = descriptionHtml ? htmlToPlainText(descriptionHtml) : null;

    const locationText =
      collapseWhitespace(job.location?.name ?? "") ||
      collapseWhitespace(job.offices?.[0]?.name ?? "") ||
      null;
    const { location, city, state, country } = splitLocationText(locationText);

    const department = collapseWhitespace(job.departments?.[0]?.name ?? "") || null;
    const remote = looksRemote(locationText, role);

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.greenhouse,
      sourceJobId: job.id != null ? String(job.id) : null,
      sourceUrl: raw.sourceUrl,
      url: job.absolute_url ?? raw.sourceUrl,

      companyName,
      role,

      location,
      city,
      state,
      country,
      remote,
      workMode: remote ? "Remote" : null,

      employmentType: mapEmploymentType(readMetadata(job, "employment type")) ?? null,
      experienceLevel: inferExperienceLevelFromTitle(role),
      department,

      description,
      // `descriptionHtml` is retained because `global_jobs` has the column and
      // the AI features read it; the SEARCHABLE, resume-matched field is
      // `description`, which is always clean text.
      descriptionHtml,

      companyCareerUrl: payload.board.careersUrl,

      // `first_published` is the real posting date; `updated_at` is a fallback
      // only, because an edit is not a re-post.
      postedAt: toIsoDate(job.first_published) ?? toIsoDate(job.updated_at),

      // Module 10B.2 enrichment. Greenhouse's `metadata[]` is free-form
      // per-board custom fields, so only entries that are genuinely
      // tag-shaped are promoted — a "Salary Range" metadata entry is not a
      // tag, and inventing one would put noise into the search vector.
      tags: readGreenhouseTags(job),

      parserVersion: GREENHOUSE_PARSER_VERSION,
      parserConfidence: description ? 0.95 : 0.8,
      extractionWarnings: description ? [] : ["No posting body returned by Greenhouse."],
    };

    return { ok: true, job: parsed };
  },
};

/** Greenhouse boards expose free-form `metadata[]`; read one entry by (case-insensitive) name. */
function readMetadata(job: GreenhouseJob, name: string): string | null {
  const entry = job.metadata?.find(
    (candidate) => collapseWhitespace(candidate?.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  const value = entry?.value;
  if (typeof value === "string") return collapseWhitespace(value) || null;
  if (Array.isArray(value) && typeof value[0] === "string")
    return collapseWhitespace(value[0]) || null;
  return null;
}

/**
 * Tag-shaped values from a Greenhouse board's free-form `metadata[]`, plus its
 * office names.
 *
 * ⚠️ Deliberately conservative. `metadata[]` is whatever the employer
 * configured — "Salary Range", "Requisition Owner", long free text. Promoting
 * all of it to `tags` would pollute the search vector (tags are weighted B in
 * `global_job_search_vector`) with values that are not tags at all. Only short,
 * single-line, non-numeric string values from tag-ish fields are taken.
 *
 * `updated_at` is deliberately NOT stored: `global_jobs` has no "source last
 * updated" column, and overloading `updated_at` (which means "when OUR row
 * changed") would corrupt a column other features rely on. It is still used as
 * a `postedAt` fallback above.
 */
export function readGreenhouseTags(job: GreenhouseJob): string[] | null {
  const tags: string[] = [];

  for (const office of job.offices ?? []) {
    const name = collapseWhitespace(office?.name ?? "");
    if (name) tags.push(name);
  }

  const TAG_FIELDS = /(employment type|job type|work type|team|category|level|seniority)/i;
  for (const entry of job.metadata ?? []) {
    const name = collapseWhitespace(entry?.name ?? "");
    if (!name || !TAG_FIELDS.test(name)) continue;

    const value = entry?.value;
    if (typeof value !== "string") continue;
    const clean = collapseWhitespace(value);
    // A tag is a short label, not a sentence or a number.
    if (!clean || clean.length > 40 || /^\d+$/.test(clean)) continue;
    tags.push(clean);
  }

  const unique = [...new Set(tags)];
  return unique.length > 0 ? unique : null;
}
