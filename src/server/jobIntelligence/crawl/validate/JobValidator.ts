// ── Module 10B.1: the Validator stage ──
//
//   Crawler → Parser → [Validator] → Normalizer → Deduplicator → Database
//
// Sits between Parser and Normalizer, which is the only place it can do its
// job: after extraction (so there is something to check) and before
// normalization and any database write (so junk never reaches `global_jobs`).
//
// The module's stated priority is ACCURACY, so this rejects rather than
// repairs anything it cannot fix safely. Three outcome kinds:
//
//   valid   — import it.
//   sanitized — import it, with specific fields blanked and the reason
//               recorded (e.g. a description that was still raw HTML, a
//               salary range that was reversed). Never silently guesses a
//               replacement value.
//   invalid — skip it, with a reason that names the field. A skipped posting
//             is reported separately from a FAILED one: skipped means "we
//             read it and decided not to store it", failed means "something
//             broke".
//
// A rejected posting is never a crawl error. That distinction is what keeps a
// board full of malformed drafts from looking like a broken crawler.

import { collapseWhitespace } from "../../parsers/html";
import type { ParsedJobPosting } from "../../types";

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; job: ParsedJobPosting; sanitized: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[]; reason: string };

const MIN_ROLE_LENGTH = 2;
const MAX_ROLE_LENGTH = 200;
const MIN_COMPANY_LENGTH = 2;
const MAX_COMPANY_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 60_000;
const MAX_LIST_ITEMS = 100;
const MAX_SALARY = 100_000_000_000;

/** Two years ahead — a posting dated beyond that is a parse artifact, not a real date. */
const MAX_FUTURE_POSTED_MS = 2 * 365 * 24 * 60 * 60 * 1000;
/** Ten years back — anything older is a mis-parsed date, not a live posting. */
const MAX_PAST_POSTED_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Role strings that are navigation chrome or placeholders rather than a job.
 * Anchored whole-string so a real title like "Engineering Manager, Search" is
 * never caught by the word "search".
 */
const NON_ROLE_TITLES = [
  /^(jobs?|careers?|opportunit(y|ies)|openings?|positions?|vacanc(y|ies))$/i,
  /^(apply|apply now|view job|learn more|read more|see all|search|home|back)$/i,
  /^(untitled|test|testing|sample|draft|n\/?a|tbd|todo|-{1,}|\.{1,})$/i,
];

const COMPANY_PLACEHOLDERS = [
  /^(confidential|undisclosed|company|employer|n\/?a|unknown|private|client|-{1,})$/i,
];

/** Markup that survived extraction — the module forbids storing raw HTML. */
const RESIDUAL_HTML =
  /<\s*(script|style|div|span|p|br|li|ul|ol|table|a|h[1-6]|img|iframe)\b[^>]*>/i;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanList(values: string[] | null | undefined): string[] | null {
  if (!values) return null;
  const cleaned = values
    .map((value) => collapseWhitespace(String(value ?? "")))
    .filter((value) => value.length > 0 && value.length <= 500);
  const unique = [...new Set(cleaned)].slice(0, MAX_LIST_ITEMS);
  return unique.length > 0 ? unique : null;
}

/**
 * Validates one parsed posting. Returns a NEW object when sanitizing; the
 * input is never mutated, so a caller can still report exactly what the
 * parser produced.
 */
export function validateParsedJob(job: ParsedJobPosting): ValidationResult {
  const fatal: ValidationIssue[] = [];
  const sanitized: ValidationIssue[] = [];
  const next: ParsedJobPosting = { ...job };

  // ── Identity: company + role are the only truly required fields (they are
  // what `admin_upsert_global_job` itself rejects on, and what every dedup
  // tier is keyed on). Catch them here with a readable reason rather than
  // letting the RPC raise.
  const role = collapseWhitespace(job.role ?? "");
  if (!role) {
    fatal.push({ field: "role", message: "Role is empty." });
  } else if (role.length < MIN_ROLE_LENGTH) {
    fatal.push({ field: "role", message: `Role "${role}" is too short to be a job title.` });
  } else if (role.length > MAX_ROLE_LENGTH) {
    fatal.push({
      field: "role",
      message: `Role is ${role.length} characters — extraction likely captured a page section.`,
    });
  } else if (NON_ROLE_TITLES.some((pattern) => pattern.test(role))) {
    fatal.push({ field: "role", message: `"${role}" is navigation text, not a job title.` });
  } else if (RESIDUAL_HTML.test(role)) {
    fatal.push({ field: "role", message: "Role still contains HTML markup." });
  } else {
    next.role = role;
  }

  const company = collapseWhitespace(job.companyName ?? "");
  if (!company) {
    fatal.push({ field: "companyName", message: "Company name is empty." });
  } else if (company.length < MIN_COMPANY_LENGTH) {
    fatal.push({ field: "companyName", message: `Company "${company}" is too short.` });
  } else if (company.length > MAX_COMPANY_LENGTH) {
    fatal.push({
      field: "companyName",
      message: `Company name is ${company.length} characters — extraction likely captured a page section.`,
    });
  } else if (COMPANY_PLACEHOLDERS.some((pattern) => pattern.test(company))) {
    // A placeholder employer would merge unrelated postings together under one
    // normalized company in the tier-3 dedup — worse than not importing.
    fatal.push({
      field: "companyName",
      message: `"${company}" is a placeholder, not a real employer.`,
    });
  } else if (RESIDUAL_HTML.test(company)) {
    fatal.push({ field: "companyName", message: "Company name still contains HTML markup." });
  } else {
    next.companyName = company;
  }

  if (!job.source || !collapseWhitespace(job.source)) {
    fatal.push({ field: "source", message: "Source tag is empty." });
  }
  if (!job.parserVersion || !collapseWhitespace(job.parserVersion)) {
    fatal.push({ field: "parserVersion", message: "Parser version is missing." });
  }

  // A posting with neither a stable id nor a resolvable identity cannot be
  // deduped at all and would re-import as a new row on every crawl.
  if (!collapseWhitespace(job.sourceJobId ?? "") && !collapseWhitespace(job.sourceUrl ?? "")) {
    fatal.push({
      field: "sourceJobId",
      message: "Posting has neither a source job id nor a source URL — it could never be deduped.",
    });
  }

  // ⚠️ Module 10B.2 correction — DELIBERATELY no `postedAt`-age fatal check
  // here. One was added and then removed after the 2026-08-09 Dry Run audit
  // proved it wrong: it rejected 2,702 of 3,890 real, valid postings (69%),
  // because large-company ATS reqs routinely stay open for months while
  // `posted_at` (the ORIGINAL source date) does not move.
  //
  // The 30-day active-job rule is enforced by `last_seen_at`, not `posted_at`:
  //   - `posted_at` is preserved verbatim — historical fact, never judged here.
  //   - `admin_upsert_global_job` stamps `last_seen_at = now()` on every
  //     insert/update, unconditionally. A job crawled TODAY is observed today
  //     regardless of how old its original posting date is.
  //   - `JobRepository.applyDiscoveryVisibility` filters the Jobs page on
  //     `last_seen_at`, never `posted_at` — see that file's own comment,
  //     which documents that a `posted_at` filter was shipped once already
  //     and reverted as a reported regression for exactly this reason.
  //   - A job that stops being crawled simply stops being refreshed and ages
  //     out of the window on its own, with nothing deleted here.
  //
  // Rejecting at ingestion on `posted_at` age would have reintroduced that
  // same reverted mistake one layer earlier, where it is even more damaging:
  // it prevents the correct mechanism (`last_seen_at`) from ever running at
  // all. See @/features/jobs/activeWindow for the shared constant/predicate
  // the (correct) discovery-side filter uses.

  if (fatal.length > 0) {
    return {
      ok: false,
      issues: fatal,
      reason: fatal.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
    };
  }

  // ── Sanitizable fields ──

  if (next.description) {
    const description = next.description;
    if (RESIDUAL_HTML.test(description)) {
      next.description = null;
      sanitized.push({
        field: "description",
        message: "Dropped: still contained raw HTML after extraction.",
      });
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      next.description = description.slice(0, MAX_DESCRIPTION_LENGTH);
      sanitized.push({
        field: "description",
        message: `Truncated from ${description.length} to ${MAX_DESCRIPTION_LENGTH} characters.`,
      });
    }
  }

  for (const field of [
    "sourceUrl",
    "url",
    "companyUrl",
    "companyCareerUrl",
    "companyLogoUrl",
  ] as const) {
    const value = next[field];
    if (value && !isHttpUrl(value)) {
      next[field] = null;
      sanitized.push({ field, message: `Dropped: "${value}" is not an http(s) URL.` });
    }
  }

  const salary = validateSalary(next, sanitized);
  next.salaryMin = salary.min;
  next.salaryMax = salary.max;

  next.postedAt = validateDate(next.postedAt, "postedAt", sanitized);
  next.expiryDate = validateDate(next.expiryDate, "expiryDate", sanitized);

  next.skills = cleanList(next.skills);
  next.technologies = cleanList(next.technologies);
  next.requirements = cleanList(next.requirements);
  next.responsibilities = cleanList(next.responsibilities);
  next.preferredQualifications = cleanList(next.preferredQualifications);
  next.benefits = cleanList(next.benefits);
  next.languages = cleanList(next.languages);
  next.tags = cleanList(next.tags);

  return { ok: true, job: next, sanitized };
}

function validateSalary(
  job: ParsedJobPosting,
  sanitized: ValidationIssue[],
): { min: number | null; max: number | null } {
  let min =
    typeof job.salaryMin === "number" && Number.isFinite(job.salaryMin) ? job.salaryMin : null;
  let max =
    typeof job.salaryMax === "number" && Number.isFinite(job.salaryMax) ? job.salaryMax : null;

  if (min !== null && (min < 0 || min > MAX_SALARY)) {
    sanitized.push({
      field: "salaryMin",
      message: `Dropped: ${min} is outside a plausible range.`,
    });
    min = null;
  }
  if (max !== null && (max < 0 || max > MAX_SALARY)) {
    sanitized.push({
      field: "salaryMax",
      message: `Dropped: ${max} is outside a plausible range.`,
    });
    max = null;
  }
  // A reversed range is a known extraction artifact and is safe to fix — the
  // two numbers are both real, only their roles were swapped.
  if (min !== null && max !== null && min > max) {
    sanitized.push({ field: "salaryMin", message: "Swapped: minimum was greater than maximum." });
    return { min: max, max: min };
  }
  return { min, max };
}

function validateDate(
  value: string | null | undefined,
  field: string,
  sanitized: ValidationIssue[],
): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    sanitized.push({ field, message: `Dropped: "${value}" is not a parseable date.` });
    return null;
  }
  const now = Date.now();
  if (parsed > now + MAX_FUTURE_POSTED_MS) {
    sanitized.push({ field, message: `Dropped: ${value} is implausibly far in the future.` });
    return null;
  }
  // Expiry dates are legitimately in the future; only a POSTED date far in the
  // past is suspicious.
  if (field === "postedAt" && parsed < now - MAX_PAST_POSTED_MS) {
    sanitized.push({ field, message: `Dropped: ${value} is implausibly old.` });
    return null;
  }
  return new Date(parsed).toISOString();
}
