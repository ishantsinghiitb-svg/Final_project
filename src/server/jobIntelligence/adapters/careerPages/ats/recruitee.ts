// ── Recruitee offers API ──
//
//   GET https://{token}.recruitee.com/api/offers/
//
// Public, no key. Returns `{ offers: [...] }`. Recruitee splits the posting
// body into `description` and `requirements` (both HTML), and exposes both a
// `careers_url` per offer and structured city/country fields.
//
// `status` matters: Recruitee keeps closed/internal offers in the same
// payload, so only `published` offers are imported.

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

export const RECRUITEE_PARSER_VERSION = "recruitee-1.0.0";

type RecruiteeOffer = {
  id?: number | string;
  slug?: string;
  title?: string;
  status?: string;
  careers_url?: string;
  careers_apply_url?: string;
  published_at?: string;
  created_at?: string;
  department?: string;
  employment_type_code?: string;
  employment_type?: string;
  experience_code?: string;
  city?: string;
  state_name?: string;
  country?: string;
  country_code?: string;
  location?: string;
  remote?: boolean;
  description?: string;
  requirements?: string;
  tags?: string[];
  company_name?: string;
};

function boardEndpoint(board: AtsBoard): string {
  return `https://${encodeURIComponent(board.token)}.recruitee.com/api/offers/`;
}

function toLines(html: string | undefined): string[] | null {
  const text = htmlToPlainText(html ?? "");
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

export const recruiteeProvider: AtsProvider = {
  id: "recruitee",
  boardUrl: boardEndpoint,

  crawl(board, fetcher, limits) {
    return crawlJsonBoard({
      board,
      fetcher,
      limits,
      endpoint: boardEndpoint(board),
      platform: ATS_SOURCE_TAG.recruitee,
      selectPostings: (body) => {
        const offers = (body as { offers?: unknown })?.offers;
        if (!Array.isArray(offers)) return null;
        // Only live postings — drafts/closed offers share this payload.
        return offers.filter((offer) => {
          const status = (offer as RecruiteeOffer)?.status;
          return status === undefined || status === "published";
        });
      },
      sourceUrlOf: (posting, resolved) =>
        pickString(posting, "careers_url") ??
        `https://${resolved.token}.recruitee.com/o/${pickString(posting, "slug") ?? ""}`,
    });
  },

  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome {
    const offer = payload.posting as RecruiteeOffer | null;
    if (!offer || typeof offer !== "object") {
      return { ok: false, reason: "Recruitee offer payload was not an object." };
    }

    const role = collapseWhitespace(offer.title ?? "");
    if (!role) return { ok: false, reason: "Recruitee offer has no title." };

    const companyName = collapseWhitespace(offer.company_name ?? "") || payload.board.companyName;
    if (!companyName) return { ok: false, reason: "Recruitee offer has no company name." };

    const city = collapseWhitespace(offer.city ?? "") || null;
    const state = collapseWhitespace(offer.state_name ?? "") || null;
    const country = collapseWhitespace(offer.country ?? offer.country_code ?? "") || null;
    const remote = offer.remote === true || looksRemote(offer.location, city);

    const description =
      [
        htmlToPlainText(offer.description ?? ""),
        offer.requirements ? `Requirements\n${htmlToPlainText(offer.requirements)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim() || null;

    const parsed: ParsedJobPosting = {
      source: ATS_SOURCE_TAG.recruitee,
      sourceJobId: offer.id != null ? String(offer.id) : (offer.slug ?? null),
      sourceUrl: raw.sourceUrl,
      url: offer.careers_apply_url ?? offer.careers_url ?? raw.sourceUrl,

      companyName,
      role,

      location:
        collapseWhitespace(offer.location ?? "") ||
        [city, state, country].filter(Boolean).join(", ") ||
        null,
      city,
      state,
      country,
      remote,
      workMode: remote ? "Remote" : null,

      employmentType: mapEmploymentType(offer.employment_type_code ?? offer.employment_type),
      experienceLevel: inferExperienceLevelFromTitle(role),
      department: collapseWhitespace(offer.department ?? "") || null,

      description,
      requirements: toLines(offer.requirements),
      tags: offer.tags?.filter((tag) => typeof tag === "string" && tag.trim()) ?? null,

      companyCareerUrl: payload.board.careersUrl,
      postedAt: toIsoDate(offer.published_at) ?? toIsoDate(offer.created_at),

      parserVersion: RECRUITEE_PARSER_VERSION,
      parserConfidence: description ? 0.9 : 0.75,
      extractionWarnings: description ? [] : ["Recruitee offer had no description."],
    };

    return { ok: true, job: parsed };
  },
};
