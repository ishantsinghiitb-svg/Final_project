import type { EmploymentType, WorkMode } from "../types";
import { linkedInSelectors } from "./linkedin.selectors";
import { EMPLOYMENT_TYPE_PATTERNS, SENIORITY_PATTERNS, WORK_MODE_KEYWORDS } from "./patterns";

/**
 * Structured readers for the places LinkedIn packs multiple distinct
 * concepts into one DOM region, replacing "read the whole container's text"
 * / "assume the first child is X" with per-segment classification. Reading
 * `.textContent` of the primary-description container (or its `:first-child`)
 * merges location with posted-time and applicant-count; reading the
 * criteria list as one joined blob makes employment type, experience level,
 * industry, and job function all degrade together if any one selector goes
 * stale; reading the top "insight pill" row as one blob merges workplace
 * type (Remote/Hybrid/On-site — which the labeled criteria list usually
 * does NOT include at all) with employment type and seniority. All three
 * are fixed here by reading each segment/item independently.
 */

export type PrimaryDescriptionSegments = {
  location: string | null;
  postedAgo: string | null;
  applicantCount: number | null;
};

const APPLICANT_COUNT_PATTERN = /^(?:over\s+)?([\d,]+)\+?\s*(applicants?|people clicked apply)/i;
const POSTED_AGO_SUFFIX_PATTERN = /\bago$/i;
const POSTED_AGO_RELATIVE_PATTERN = /^(just now|today|yesterday)/i;
const SEPARATOR_ONLY_PATTERN = /^[·•|]+$/;

export function parsePrimaryDescriptionSegments(document: Document): PrimaryDescriptionSegments {
  const container = firstElement(document, linkedInSelectors.primaryDescriptionContainer);
  if (!container) return { location: null, postedAgo: null, applicantCount: null };

  // Leaf-most span/time nodes only — avoids double-counting a wrapper span
  // that itself contains the real per-segment spans.
  const segments = Array.from(container.querySelectorAll("span, time"))
    .filter((node) => !node.querySelector("span, time"))
    .map((node) => clean(node.textContent))
    .filter((text): text is string => text !== null && !SEPARATOR_ONLY_PATTERN.test(text));

  let location: string | null = null;
  let postedAgo: string | null = null;
  let applicantCount: number | null = null;

  for (const segment of segments) {
    const applicantMatch = APPLICANT_COUNT_PATTERN.exec(segment);
    if (applicantMatch) {
      applicantCount = Number(applicantMatch[1].replace(/,/g, ""));
      continue;
    }

    if (POSTED_AGO_SUFFIX_PATTERN.test(segment) || POSTED_AGO_RELATIVE_PATTERN.test(segment)) {
      postedAgo = segment;
      continue;
    }

    if (location === null) {
      location = segment;
    }
  }

  return { location, postedAgo, applicantCount };
}

/** Keyed by the lowercased visible label (e.g. "seniority level", "employment type"). */
export function parseCriteriaList(document: Document): Map<string, string> {
  const result = new Map<string, string>();
  const items = document.querySelectorAll(linkedInSelectors.criteriaItems.join(", "));

  items.forEach((item) => {
    const label = firstElement(item, linkedInSelectors.criteriaSubheader);
    const value = firstElement(item, linkedInSelectors.criteriaValue);
    const labelText = clean(label?.textContent ?? null);
    const valueText = clean(value?.textContent ?? null);
    if (labelText && valueText) {
      result.set(labelText.toLowerCase(), valueText);
    }
  });

  return result;
}

export type JobInsightSegments = {
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  experienceLevel: string | null;
};

const SEGMENT_SPLIT_PATTERN = /[·•|]/;

/**
 * LinkedIn's top "insight pill" row (directly under the title/company) often
 * crams workplace type, employment type, and seniority into one or two
 * pills as a single `·`-separated string (e.g. "Hybrid · Full-time · Mid-Senior
 * level"). Reading the whole pill as one blob only lets a single caller-chosen
 * regex win; splitting into segments and classifying each independently means
 * all three can be recovered even when only one pill contains all of them, or
 * they're spread across several.
 */
export function parseJobInsightSegments(document: Document): JobInsightSegments {
  const nodes = document.querySelectorAll(linkedInSelectors.jobInsights.join(", "));
  const segments = Array.from(nodes)
    .flatMap((node) => clean(node.textContent)?.split(SEGMENT_SPLIT_PATTERN) ?? [])
    .map((segment) => clean(segment))
    .filter((segment): segment is string => segment !== null);

  let workMode: WorkMode | null = null;
  let employmentType: EmploymentType | null = null;
  let experienceLevel: string | null = null;

  for (const segment of segments) {
    if (!workMode) {
      const match = WORK_MODE_KEYWORDS.find(([pattern]) => pattern.test(segment));
      if (match) workMode = match[1];
    }
    if (!employmentType) {
      const match = EMPLOYMENT_TYPE_PATTERNS.find(([pattern]) => pattern.test(segment));
      if (match) employmentType = match[1];
    }
    if (!experienceLevel) {
      const match = SENIORITY_PATTERNS.find(([pattern]) => pattern.test(segment));
      if (match) experienceLevel = match[1];
    }
  }

  return { workMode, employmentType, experienceLevel };
}

/**
 * Matches LinkedIn's placeholder/ghost images — shown before a real logo
 * loads or when the company has none — so a placeholder is never persisted
 * as if it were a real logo. Checked alongside the `data:` URI check.
 */
const PLACEHOLDER_IMAGE_PATTERN =
  /ghost|placeholder|blank[-_]?(logo|image|company|photo)|company[-_]?default/i;

export function isPlaceholderImageUrl(url: string): boolean {
  return url.startsWith("data:") || PLACEHOLDER_IMAGE_PATTERN.test(url);
}

export type FitLevelPreferences = {
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
};

/**
 * The "fit & preferences" row is the highest-priority source for workplace
 * type and employment type — each shown as its own `<button><strong>` chip
 * (e.g. "On-site", "Full-time") rather than crammed into a shared pill, so
 * each button is classified independently and one being unrecognized never
 * blocks the other. Falls back to `parseJobInsightSegments`/the criteria
 * list (in `LinkedInParser`) when this container isn't present.
 */
export function parseFitLevelPreferences(document: Document): FitLevelPreferences {
  const container = firstElement(document, linkedInSelectors.fitLevelPreferences);
  if (!container) return { workMode: null, employmentType: null };

  const segments = Array.from(container.querySelectorAll("button"))
    .map((button) => clean(button.querySelector("strong")?.textContent ?? button.textContent))
    .filter((text): text is string => text !== null);

  let workMode: WorkMode | null = null;
  let employmentType: EmploymentType | null = null;

  for (const segment of segments) {
    if (!workMode) {
      const match = WORK_MODE_KEYWORDS.find(([pattern]) => pattern.test(segment));
      if (match) workMode = match[1];
    }
    if (!employmentType) {
      const match = EMPLOYMENT_TYPE_PATTERNS.find(([pattern]) => pattern.test(segment));
      if (match) employmentType = match[1];
    }
  }

  return { workMode, employmentType };
}

/**
 * Reads the best available image URL from the first matching selector,
 * handling LinkedIn's lazy-loaded `<img>` pattern where the real URL lives in
 * `src`, then `data-src`, then other lazy-load attributes, then `srcset` —
 * checked in that order — rather than just `src`. Skips placeholder/ghost
 * images so one is never persisted as if it were a real logo.
 */
export function firstImageUrl(root: ParentNode, selectors: readonly string[]): string | null {
  const candidateAttrs = ["src", "data-src", "data-delayed-url", "data-ghost-url", "data-lazy-src"];

  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (!el) continue;

    for (const attr of candidateAttrs) {
      const value = el.getAttribute(attr)?.trim();
      if (value && !isPlaceholderImageUrl(value)) return value;
    }

    const srcset = el.getAttribute("srcset")?.trim();
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first && !isPlaceholderImageUrl(first)) return first;
    }
  }

  return null;
}

function firstElement(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function clean(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
