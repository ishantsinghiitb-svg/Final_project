import type { SalaryPeriod } from "../types";

/**
 * Parsed salary/stipend, in the same shape the `UniversalJob` compensation
 * fields expect. Any field the source doesn't clearly express stays `null`;
 * `salaryText` always preserves the verbatim display string so nothing is lost
 * even when the numeric range can't be resolved (e.g. "Unpaid", "Competitive").
 */
export type ParsedSalary = {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryText: string | null;
};

const EMPTY: ParsedSalary = {
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  salaryText: null,
};

const CURRENCY_SIGNS: Array<[RegExp, string]> = [
  [/₹|\binr\b|\brs\.?\b/i, "INR"],
  [/\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
];

const PERIOD_PATTERNS: Array<[RegExp, SalaryPeriod]> = [
  [/per\s*hour|\/\s*hour|\/\s*hr\b|\bhourly\b/i, "Hourly"],
  [/per\s*month|\/\s*month|\/\s*mo\b|\bmonthly\b/i, "Monthly"],
  [/per\s*week|\/\s*week|\/\s*wk\b|\bweekly\b/i, "Weekly"],
  [/per\s*year|per\s*annum|\/\s*year|\/\s*yr\b|\bp\.?\s*a\.?\b|\byearly\b|\bannual\b/i, "Yearly"],
];

// Indian magnitude words: "Lac"/"Lacs"/"Lakh" and a standalone "L" (e.g.
// "₹4.1 - ₹5.9 L/yr") mean ×1e5; "Cr"/"Crore" means ×1e7.
const LAKH_PATTERN = /\b(?:l|lac|lacs|lakh|lakhs)\b/i;
const CRORE_PATTERN = /\b(?:cr|crore|crores)\b/i;

const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Parses a free-form salary/stipend string into numeric bounds + currency +
 * period, handling the Indian-board formats the LinkedIn parser never had to:
 * lakh/crore magnitudes ("3-3.75 Lacs P.A."), Indian digit grouping
 * ("₹ 6,00,000 - 8,00,000"), lump-sum stipends, and "Unpaid". `currencyHint`
 * (e.g. a JSON-LD `baseSalary.currency`) is used only when the text itself has
 * no currency sign. Pure/synchronous — no DOM, no locale dependence.
 */
export function parseSalary(
  raw: string | null | undefined,
  currencyHint?: string | null,
): ParsedSalary {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ...EMPTY };

  if (/\bunpaid\b/i.test(text)) {
    return { ...EMPTY, salaryText: text };
  }

  const currency = detectCurrency(text) ?? cleanCurrencyHint(currencyHint);
  const period = detectPeriod(text);

  const multiplier = CRORE_PATTERN.test(text) ? 1e7 : LAKH_PATTERN.test(text) ? 1e5 : 1;

  const numbers = (text.match(NUMBER_TOKEN) ?? [])
    .map((token) => Number.parseFloat(token.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.round(n * multiplier));

  const salaryMin = numbers.length > 0 ? numbers[0] : null;
  const salaryMax = numbers.length > 1 ? numbers[1] : null;

  return { salaryMin, salaryMax, salaryCurrency: currency, salaryPeriod: period, salaryText: text };
}

function detectCurrency(text: string): string | null {
  for (const [pattern, code] of CURRENCY_SIGNS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

function cleanCurrencyHint(hint: string | null | undefined): string | null {
  const trimmed = hint?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function detectPeriod(text: string): SalaryPeriod | null {
  for (const [pattern, period] of PERIOD_PATTERNS) {
    if (pattern.test(text)) return period;
  }
  return null;
}
