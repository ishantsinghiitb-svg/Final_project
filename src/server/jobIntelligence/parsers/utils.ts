// ── Module 10A: Shared parser utilities ──
//
// Generic, platform-independent text-extraction helpers a future platform
// parser can reuse instead of re-deriving the same regexes. Pure functions,
// no DOM/network access, so they work identically whether a parser runs
// against server-fetched HTML or a JSON payload's free-text fields.

import type { EmploymentTypeValue, WorkModeValue } from "../types";

/** Collapses whitespace and trims — the baseline cleanup every extracted string needs. */
export function cleanText(input: string | null | undefined): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "₹": "INR",
  "€": "EUR",
  "£": "GBP",
};

export type ParsedSalary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
};

/**
 * Best-effort salary extraction from free text, e.g. "₹8L - ₹12L per annum",
 * "$120,000 - $150,000/year", "40000 USD monthly". Returns nulls (not
 * throws) when nothing recognizable is found — callers should treat this as
 * "no salary data", not an error.
 */
export function parseSalaryText(input: string | null | undefined): ParsedSalary {
  const text = cleanText(input);
  if (!text) return { min: null, max: null, currency: null, period: null };

  const currency = detectCurrency(text);
  const period = detectPeriod(text);
  const numbers = extractNumbers(text);

  if (numbers.length === 0) return { min: null, max: null, currency, period };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0], currency, period };
  return { min: Math.min(...numbers), max: Math.max(...numbers), currency, period };
}

function detectCurrency(text: string): string | null {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  const codeMatch = text.match(/\b(USD|INR|EUR|GBP|CAD|AUD)\b/i);
  return codeMatch ? codeMatch[1].toUpperCase() : null;
}

// ⚠️ The word-boundary placement here is load-bearing. These were originally
// written as `\b(per\s*month|monthly|\/\s*month)\b`, with ONE leading `\b`
// covering the whole alternation — which silently never matched the
// slash-prefixed forms when a space preceded the slash. `\b` needs a word
// character on one side, and in "₹ 17,000 /month" the characters around the
// slash are a space and a `/`, both non-word. "$120,000/year" happened to work
// (the `0` before `/` supplies the boundary), which is why the original tests
// passed while Internshala's "12,000 - 17,000 /month" lost its period entirely.
// Each alternative now carries the boundary only where a boundary is meaningful.
const PERIOD_PATTERNS: Array<[RegExp, string]> = [
  [/\bper\s*hour\b|\bhourly\b|\/\s*(?:hr|hour)s?\b/i, "Hourly"],
  [/\bper\s*day\b|\bdaily\b|\/\s*days?\b/i, "Daily"],
  [/\bper\s*week\b|\bweekly\b|\/\s*(?:wk|week)s?\b/i, "Weekly"],
  [/\bper\s*month\b|\bmonthly\b|\/\s*(?:mo|month)s?\b/i, "Monthly"],
  [
    /\bper\s*(?:annum|year)\b|\bannually\b|\byearly\b|\/\s*(?:yr|year)s?\b|\bctc\b|\blpa\b/i,
    "Yearly",
  ],
];

function detectPeriod(text: string): string | null {
  for (const [pattern, period] of PERIOD_PATTERNS) {
    if (pattern.test(text)) return period;
  }
  return null;
}

/** Extracts numeric values, resolving Indian lakh/crore shorthand ("8L" → 800000, "1.2Cr" → 12000000). */
function extractNumbers(text: string): number[] {
  const results: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(l|lac|lakh|lakhs|cr|crore|crores|k)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) continue;
    const suffix = (match[2] ?? "").toLowerCase();
    let value = num;
    if (suffix === "l" || suffix.startsWith("lac") || suffix.startsWith("lakh"))
      value = num * 100_000;
    else if (suffix === "cr" || suffix.startsWith("crore")) value = num * 10_000_000;
    else if (suffix === "k") value = num * 1_000;
    // No lower-bound filter: hourly/daily rates are legitimately small
    // (e.g. "$15/hr"). Callers pass already-scoped salary text (not a whole
    // job description), so noise like "5 years experience" isn't expected here.
    results.push(value);
  }
  return results;
}

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on-?site|in-?office|in\s*person)\b/i;

/** Infers a WorkMode from free text (e.g. a location or perks blurb). Returns null when ambiguous/absent. */
export function inferWorkMode(text: string | null | undefined): WorkModeValue | null {
  const t = cleanText(text);
  if (!t) return null;
  if (HYBRID_RE.test(t)) return "Hybrid";
  if (REMOTE_RE.test(t)) return "Remote";
  if (ONSITE_RE.test(t)) return "Onsite";
  return null;
}

const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, EmploymentTypeValue]> = [
  [/\bintern(ship)?\b/i, "Internship"],
  [/\bcontract(or)?\b/i, "Contract"],
  [/\bpart[-\s]?time\b/i, "Part-Time"],
  [/\btemp(orary)?\b/i, "Temporary"],
  [/\bfreelance\b/i, "Freelance"],
  [/\bfull[-\s]?time\b/i, "Full-Time"],
];

/** Infers an EmploymentType from free text. Checked most-specific-first so "Full-Time Internship" still reads as Internship. */
export function inferEmploymentType(text: string | null | undefined): EmploymentTypeValue | null {
  const t = cleanText(text);
  if (!t) return null;
  for (const [pattern, value] of EMPLOYMENT_TYPE_PATTERNS) {
    if (pattern.test(t)) return value;
  }
  return null;
}

/**
 * Extracts skills mentioned in free text against a known-skills vocabulary.
 * Word-boundary matching, case-insensitive; returns the vocabulary's own
 * casing (not what appeared in the text) so results stay consistent across
 * postings. O(skills × text) — fine at the size of a single job description;
 * callers with a very large vocabulary should pre-filter.
 */
export function extractSkillsFromText(
  text: string | null | undefined,
  knownSkills: string[],
): string[] {
  const t = cleanText(text);
  if (!t) return [];
  const found: string[] = [];
  for (const skill of knownSkills) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Skills containing non-word characters (e.g. "C++", "C#") can't use a
    // \b boundary on both sides — fall back to a plain case-insensitive
    // substring test for those.
    const pattern = /^\w+$/.test(skill) ? `\\b${escaped}\\b` : escaped;
    if (new RegExp(pattern, "i").test(t)) found.push(skill);
  }
  return found;
}
