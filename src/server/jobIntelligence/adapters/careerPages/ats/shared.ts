// ── Module 10B.1: helpers shared by the JSON-API ATS providers ──
//
// Greenhouse/Lever/Ashby/SmartRecruiters/Workable/Recruitee all follow the
// same shape — one GET returns an array of postings — so the fetch/split half
// is written once here. Only the field mapping differs per provider, and that
// stays in each provider file where its API's quirks are documented next to
// the code that handles them.

import type { CrawlFetcher } from "../../../crawl/HttpFetcher";
import type { RawJobPayload } from "../../../parsers/types";
import type { EmploymentTypeValue, ExperienceLevelValue, WorkModeValue } from "../../../types";
import { collapseWhitespace } from "../../../parsers/html";
import type { AtsBoard, AtsCrawlLimits, AtsCrawlResult, AtsPostingPayload } from "./types";

/**
 * Fetches one JSON board endpoint and emits a `RawJobPayload` per posting.
 * `selectPostings` pulls the array out of the provider's envelope;
 * `sourceUrlOf` supplies the canonical posting URL used both as
 * `RawJobPayload.sourceUrl` and, later, `global_jobs.source_url`.
 */
export async function crawlJsonBoard(options: {
  board: AtsBoard;
  fetcher: CrawlFetcher;
  limits: AtsCrawlLimits;
  endpoint: string;
  platform: string;
  selectPostings: (body: unknown) => unknown[] | null;
  sourceUrlOf: (posting: unknown, board: AtsBoard) => string;
  headers?: Record<string, string>;
}): Promise<AtsCrawlResult> {
  const { board, fetcher, limits, endpoint, platform, selectPostings, sourceUrlOf } = options;

  const response = await fetcher.fetchText(endpoint, {
    accept: "application/json",
    headers: options.headers,
  });

  if (!response.ok) {
    return {
      raws: [],
      warnings: [],
      failure: {
        reason: `${board.provider} board "${board.token}": ${response.reason}`,
        blocked: response.kind === "blocked",
      },
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    return {
      raws: [],
      warnings: [],
      failure: {
        reason: `${board.provider} board "${board.token}" did not return JSON (content-type ${response.contentType ?? "unknown"}).`,
        blocked: false,
      },
    };
  }

  const postings = selectPostings(body);
  if (postings === null) {
    return {
      raws: [],
      warnings: [],
      failure: {
        reason: `${board.provider} board "${board.token}" returned an unexpected payload shape.`,
        blocked: false,
      },
    };
  }

  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  if (postings.length === 0) {
    warnings.push(`${board.provider} board "${board.token}" returned 0 postings.`);
  }
  if (postings.length > limits.maxPostings) {
    warnings.push(
      `${board.provider} board "${board.token}" returned ${postings.length} postings; capped at ${limits.maxPostings}.`,
    );
  }

  const raws: RawJobPayload[] = postings.slice(0, limits.maxPostings).map((posting) => {
    const json: AtsPostingPayload = { provider: board.provider, board, posting };
    return {
      platform,
      sourceUrl: sourceUrlOf(posting, board),
      fetchedAt,
      json,
    };
  });

  return { raws, warnings };
}

// ── Field mapping ──

const EMPLOYMENT_TYPE_MAP: Record<string, EmploymentTypeValue> = {
  fulltime: "Full-Time",
  "full-time": "Full-Time",
  "full time": "Full-Time",
  permanent: "Full-Time",
  regular: "Full-Time",
  parttime: "Part-Time",
  "part-time": "Part-Time",
  "part time": "Part-Time",
  contract: "Contract",
  contractor: "Contract",
  contracttohire: "Contract",
  temporary: "Temporary",
  temp: "Temporary",
  intern: "Internship",
  internship: "Internship",
  freelance: "Freelance",
};

/** Normalizes an ATS employment-type label ("FullTime", "Regular Full Time (Salary)") to the shared union. */
export function mapEmploymentType(raw: string | null | undefined): EmploymentTypeValue | null {
  const text = collapseWhitespace(raw ?? "").toLowerCase();
  if (!text) return null;

  const direct = EMPLOYMENT_TYPE_MAP[text.replace(/[_\s]+/g, "")] ?? EMPLOYMENT_TYPE_MAP[text];
  if (direct) return direct;

  // Substring pass, most specific first — Lever's `commitment` is free text
  // like "Regular Full Time (Salary)" and Ashby's is "FullTime".
  if (/\bintern(ship)?\b/.test(text)) return "Internship";
  if (/part[\s-]?time/.test(text)) return "Part-Time";
  if (/\bcontract|contractor\b/.test(text)) return "Contract";
  if (/\btemp(orary)?\b/.test(text)) return "Temporary";
  if (/\bfreelance\b/.test(text)) return "Freelance";
  if (/full[\s-]?time|permanent|regular/.test(text)) return "Full-Time";
  return null;
}

const WORK_MODE_MAP: Record<string, WorkModeValue> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  "on-site": "Onsite",
  "in office": "Onsite",
  inoffice: "Onsite",
  office: "Onsite",
};

/** Normalizes an ATS workplace-type label to the shared union. */
export function mapWorkMode(raw: string | null | undefined): WorkModeValue | null {
  const text = collapseWhitespace(raw ?? "").toLowerCase();
  if (!text) return null;
  const direct = WORK_MODE_MAP[text] ?? WORK_MODE_MAP[text.replace(/[\s-]+/g, "")];
  if (direct) return direct;
  if (text.includes("hybrid")) return "Hybrid";
  if (text.includes("remote")) return "Remote";
  if (/on[\s-]?site|in[\s-]?office/.test(text)) return "Onsite";
  return null;
}

const EXPERIENCE_PATTERNS: Array<[RegExp, ExperienceLevelValue]> = [
  [/\bintern(ship)?\b/i, "Intern"],
  [/\bprincipal\b/i, "Principal"],
  [/\bstaff\b/i, "Staff"],
  [/\b(lead|head of|director|vp|vice president)\b/i, "Lead"],
  [/\b(senior|sr\.?|snr)\b/i, "Senior-Level"],
  [/\b(junior|jr\.?|associate|entry[\s-]?level|graduate|new grad)\b/i, "Junior"],
];

/**
 * Best-effort experience level from a job title. Deliberately title-only:
 * scanning a whole description for "senior" produces false positives (a
 * junior role reporting to a senior engineer), and a wrong level is worse
 * than a null one for filtering.
 */
export function inferExperienceLevelFromTitle(
  title: string | null | undefined,
): ExperienceLevelValue | null {
  const text = collapseWhitespace(title ?? "");
  if (!text) return null;
  for (const [pattern, level] of EXPERIENCE_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return null;
}

export type SplitLocation = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

const COUNTRY_TOKENS = new Set([
  "usa",
  "us",
  "united states",
  "united states of america",
  "uk",
  "united kingdom",
  "canada",
  "india",
  "germany",
  "france",
  "spain",
  "netherlands",
  "ireland",
  "australia",
  "singapore",
  "japan",
  "brazil",
  "mexico",
  "poland",
  "portugal",
  "sweden",
  "israel",
  "switzerland",
  "italy",
  "remote",
  "anywhere",
]);

/**
 * Splits a free-text ATS location ("New York, NY", "Bengaluru, Karnataka,
 * India") into city/state/country on a best-effort basis. Never guesses past
 * what the string actually contains — a single-token location becomes the
 * city, not an invented country.
 */
export function splitLocationText(raw: string | null | undefined): SplitLocation {
  const location = collapseWhitespace(raw ?? "") || null;
  if (!location) return { location: null, city: null, state: null, country: null };

  const parts = location
    .split(",")
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  if (parts.length === 0) return { location, city: null, state: null, country: null };
  if (parts.length === 1) {
    const only = parts[0];
    return COUNTRY_TOKENS.has(only.toLowerCase())
      ? { location, city: null, state: null, country: only }
      : { location, city: only, state: null, country: null };
  }

  const last = parts[parts.length - 1];
  const lastIsCountry = COUNTRY_TOKENS.has(last.toLowerCase()) || parts.length >= 3;

  return {
    location,
    city: parts[0],
    state: parts.length >= 3 ? parts[1] : lastIsCountry ? null : parts[1],
    country: lastIsCountry ? last : null,
  };
}

/** True when any of the given texts marks the posting as remote. */
export function looksRemote(...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => /\b(remote|work from home|wfh|anywhere)\b/i.test(text ?? ""));
}

/** ISO-8601 normalization for an ATS timestamp (string or epoch millis). */
export function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Reads a nested string off an unknown JSON object without throwing. */
export function pickString(source: unknown, ...path: string[]): string | null {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === "string") return collapseWhitespace(current) || null;
  if (typeof current === "number") return String(current);
  return null;
}

/** Reads a nested boolean off an unknown JSON object. */
export function pickBoolean(source: unknown, ...path: string[]): boolean | null {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "boolean" ? current : null;
}
