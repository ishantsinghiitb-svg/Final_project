/**
 * "Does this page look like a hiring page?" — a pure UI-messaging signal,
 * never an extractor. Used only to decide whether to show the "automatic
 * tracking isn't available here yet" informational state on a host with no
 * dedicated parser (see `content/index.ts`).
 *
 * Deliberately self-contained and independent of the decommissioned Generic
 * Parser (`core/parsers/generic/`) — it does not import from that module,
 * subclass `BaseParser`, or produce a `UniversalJob`/title/company/any field
 * that could ever be persisted. It only ever returns `true`/`false`, so it
 * carries none of the "wrong extraction" risk that Generic Parser was pulled
 * for. This is what "the extension still detects hiring pages" runs on now.
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

export function hasHiringPageSignals(document: Document, url: string): boolean {
  if (hasJobPostingJsonLd(document)) return true;

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

/**
 * A coarse substring check on the raw JSON-LD text, not a JSON.parse + `@type`
 * walk — this file has no parsing infrastructure of its own by design (that
 * lives in the decommissioned `BaseParser`/Generic Parser), and a real
 * `JobPosting` block virtually always spells its type out literally like
 * this, so the coarse check is enough for a yes/no signal.
 */
function hasJobPostingJsonLd(document: Document): boolean {
  const nodes = document.querySelectorAll('script[type="application/ld+json"]');
  for (const node of Array.from(nodes)) {
    const text = node.textContent;
    if (text && /"@type"\s*:\s*(\[\s*)?"jobposting"/i.test(text)) return true;
  }
  return false;
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
