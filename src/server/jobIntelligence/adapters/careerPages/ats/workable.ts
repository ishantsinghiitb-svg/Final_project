// ── Workable job-board widget API ──
//
//   GET https://apply.workable.com/api/v1/widget/accounts/{token}?details=true
//
// Public, no key — the same endpoint Workable's own embeddable careers widget
// calls. Returns `{ name, description, jobs[] }`, where `name` is the
// employer's own display name (preferred over the registry's, which an
// operator typed by hand).
//
// `details=true` adds `description`/`requirements`/`benefits` as HTML strings.
// Location is already structured (`city`/`state`/`country`), so no free-text
// splitting is needed.

import { collapseWhitespace, htmlToPlainText } from "../../../parsers/html";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";
import type { ParsedJobPosting } from "../../../types";
import {
  crawlJsonBoard,
  inferExperienceLevelFromTitle,
  looksRemote,
  mapEmploymentType,
  pickString,
  toIsoDate,
} from "./shared";
import { ATS_SOURCE_TAG, type AtsBoard, type AtsPostingPayload, type AtsProvider } from "./types";

export const WORKABLE_PARSER_VERSION = "workable-1.0.0";

type WorkableJob = {
  id?: string | number;
  shortcode?: string;
  title?: string;
  full_title?: string;
  url?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  department?: string;
  employment_type?: string;
  telecommuting?: boolean;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  location?: { city?: string; region?: string; country?: string; telecommuting?: boolean };
  description?: string;
  requirements?: string;
  benefits?: string;
};

function boardEndpoint(board: AtsBoard): string {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board.token)}?details=true`;
}

/** Splits an HTML `<ul>`/paragraph blob into text lines, used for requirements/benefits. */
function toLines(html: string | undefined): string[] | null {
  const text = htmlToPlainText(html ?? "");
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

export const workableProvider: AtsProvider = {
  id: "workable",
  boardUrl: boardEndpoint,

  crawl(board, fetcher, limits) {
    return crawlJsonBoard({
      board,
      fetcher,
      limits,
      endpoint: boardEndpoint(board),
      platform: ATS_SOURCE_TAG.workable,
      selectPostings: (body) => {
        const envelope = body as { jobs?: unknown; name?: unknown } | null;
        if (!envelope || typeof envelope !== "object") return null;
        if (!Array.isArray(envelope.jobs)) return null;
        // Carry the account's own name onto each posting so the pure parser
        // can prefer it without needing the envelope.
        const accountName = typeof envelope.name === "string" ? envelope.name : null;
        return envelope.jobs.map((job) =>
          accountName && job && typeof job === "object"
            ? { ...(job as Record<string, unknown>), __accountName: accountName }
            : job,
        );
      },
      sourceUrlOf: (posting, resolved) =>
        pickString(posting, "url") ??
        `https://apply.workable.com/${resolved.token}/j/${pickString(posting, "shortcode") ?? ""}/`,
    });
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const job = payload.posting as (WorkableJob & { __accountName?: string }) | null;
    if (!job || typeof job !== "object") {
      return { ok: false, reason: "Workable posting payload was not an object." };
    }

    const role = collapseWhitespace(job.title ?? job.full_title ?? "");
    if (!role) return { ok: false, reason: "Workable posting has no title." };

    const companyName = collapseWhitespace(job.__accountName ?? "") || payload.board.companyName;
    if (!companyName) return { ok: false, reason: "Workable posting has no company name." };

    const city = collapseWhitespace(job.city ?? job.location?.city ?? "") || null;
    const state = collapseWhitespace(job.state ?? job.location?.region ?? "") || null;
    const country = collapseWhitespace(job.country ?? job.location?.country ?? "") || null;
    const remote = job.telecommuting === true || job.location?.telecommuting === true;

    const descriptionParts = [
      htmlToPlainText(job.description ?? ""),
      job.requirements ? `Requirements\n${htmlToPlainText(job.requirements)}` : "",
      job.benefits ? `Benefits\n${htmlToPlainText(job.benefits)}` : "",
    ].filter(Boolean);
    const description = descriptionParts.join("\n\n").trim() || null;

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.workable,
      // `shortcode` is the stable public identifier Workable URLs are built on.
      sourceJobId: job.shortcode ?? (job.id != null ? String(job.id) : null),
      sourceUrl: raw.sourceUrl,
      url: job.application_url ?? job.url ?? raw.sourceUrl,

      companyName,
      role,

      location: [city, state, country].filter(Boolean).join(", ") || null,
      city,
      state,
      country,
      remote: remote || looksRemote(city, role),
      workMode: remote ? "Remote" : null,

      employmentType: mapEmploymentType(job.employment_type),
      experienceLevel: inferExperienceLevelFromTitle(role),
      department: collapseWhitespace(job.department ?? "") || null,

      description,
      requirements: toLines(job.requirements),
      benefits: toLines(job.benefits),

      companyCareerUrl: payload.board.careersUrl,
      postedAt: toIsoDate(job.published_on) ?? toIsoDate(job.created_at),

      parserVersion: WORKABLE_PARSER_VERSION,
      parserConfidence: description ? 0.9 : 0.75,
      extractionWarnings: description
        ? []
        : ["Workable posting had no body (widget API may have been called without details=true)."],
    };

    return { ok: true, job: parsed };
  },
};
