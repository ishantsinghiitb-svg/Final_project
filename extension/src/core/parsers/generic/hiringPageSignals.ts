/**
 * "Does this page look like a hiring page?" gate for the Generic Parser.
 * Required by the Module 4C spec: the Generic Parser must only ever attempt
 * extraction on a page carrying real hiring-page signals (never a bare CSS
 * keyword match on an unrelated page), and — separately — `content/index.ts`
 * uses this SAME function to tell "hiring page we can't extract" apart from
 * "not a hiring page at all" once `tryParse` has already returned `null`, so
 * it can show the friendly "not supported yet" message only for the former.
 *
 * A single strong signal (JobPosting JSON-LD) is enough on its own. Anything
 * weaker is scored and combined — a single incidental keyword ("...our
 * hiring managers say...") must never be enough by itself.
 */

const CAREER_URL_PATTERN =
  /\/(jobs?|careers?|vacanc(?:y|ies)|openings?|positions?|internships?|hiring|apply|opportunit(?:y|ies))(?:[/?#-]|$)/i;

const APPLY_SELECTOR =
  "a[href*='apply' i], a[class*='apply' i], button[class*='apply' i], [data-testid*='apply' i]";

const HEADING_KEYWORD_PATTERN =
  /\b(job description|now hiring|we(?:'|’)re hiring|open position|job opening|career opportunit|apply now)\b/i;

/** Each entry is checked independently so one repeated word can't inflate the score by itself. */
const BODY_KEYWORDS: readonly RegExp[] = [
  /\bresponsibilities\b/i,
  /\brequirements\b/i,
  /\bqualifications\b/i,
  /\bjob description\b/i,
  /\bemployment type\b/i,
  /\bjob type\b/i,
  /\bopening\b/i,
  /\bvacanc(?:y|ies)\b/i,
  /\binternship\b/i,
  /\bhiring\b/i,
];

const MAX_BODY_SCAN_CHARS = 20_000;
const MAX_BODY_KEYWORD_SCORE = 3;
const MIN_SCORE = 4;

/**
 * `jobPostingJsonLd` is passed in (rather than re-parsed here) so callers
 * that already ran `BaseParser.findJsonLdByType` — `GenericParser.tryParse`
 * — don't pay for a second JSON-LD scan/parse of the same page.
 */
export function hasHiringPageSignals(
  document: Document,
  url: string,
  jobPostingJsonLd: unknown,
): boolean {
  if (jobPostingJsonLd) return true;

  let score = 0;

  if (hasCareerMeta(document)) score += 3;
  if (CAREER_URL_PATTERN.test(safePath(url))) score += 2;
  if (document.querySelector(APPLY_SELECTOR)) score += 2;

  const heading = firstHeadingText(document);
  if (heading && HEADING_KEYWORD_PATTERN.test(heading)) score += 2;

  const bodyText = (document.body?.innerText ?? "").slice(0, MAX_BODY_SCAN_CHARS);
  score += Math.min(countDistinctKeywordHits(bodyText), MAX_BODY_KEYWORD_SCORE);

  return score >= MIN_SCORE;
}

function hasCareerMeta(document: Document): boolean {
  const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? "";
  if (/job/i.test(ogType)) return true;
  return Boolean(document.querySelector('meta[name="apply-url" i], meta[name="job-id" i]'));
}

function firstHeadingText(document: Document): string | null {
  const text = document.querySelector("h1")?.textContent?.trim();
  return text || document.title || null;
}

function countDistinctKeywordHits(text: string): number {
  let hits = 0;
  for (const pattern of BODY_KEYWORDS) {
    if (pattern.test(text)) hits++;
  }
  return hits;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
