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

      postedAt: toIsoDate(job.first_published) ?? toIsoDate(job.updated_at),

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
