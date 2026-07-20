/**
 * DOM fallback selectors for the Generic Parser, tried in order (most
 * semantic/reliable first, broadest/last-resort last) — the same
 * `firstText`/`firstAttr` "try each until one hits" idiom `BaseParser`
 * already gives every parser. Unlike the dedicated board parsers, these
 * can't assume any particular markup, so they lean on conventions that hold
 * across most ATS/careers-page builders: `itemprop` microdata, `data-testid`
 * hooks, and `[class*='…' i]`/`[id*='…' i]` substring matches (case
 * -insensitive) instead of exact class names.
 */
export const genericSelectors = {
  title: [
    "[itemprop='title']",
    "[data-testid*='job-title' i]",
    "[data-testid*='posting-title' i]",
    "h1[class*='job-title' i]",
    "h1[class*='posting-title' i]",
    "h1[class*='position-title' i]",
    "[class*='job-title' i]",
    "[class*='posting-title' i]",
    "h1",
  ],

  companyName: [
    "[itemprop='hiringOrganization'] [itemprop='name']",
    "[data-testid*='company-name' i]",
    "[class*='company-name' i]",
    "[class*='employer-name' i]",
    "[class*='org-name' i]",
  ],

  companyLogo: [
    "[class*='company-logo' i] img",
    "[class*='employer-logo' i] img",
    "header [class*='logo' i] img",
    "[class*='logo' i] img",
  ],

  location: [
    "[itemprop='jobLocation']",
    "[data-testid*='job-location' i]",
    "[class*='job-location' i]",
    "[class*='posting-location' i]",
    "[class*='location' i]",
  ],

  employmentType: [
    "[data-testid*='employment-type' i]",
    "[class*='employment-type' i]",
    "[class*='job-type' i]",
  ],

  salary: [
    "[data-testid*='salary' i]",
    "[class*='salary' i]",
    "[class*='compensation' i]",
    "[class*='pay-range' i]",
  ],

  postedDate: ["time[datetime]"],

  /**
   * Description containers, most-targeted first. `main`/`article` are
   * genuine last resorts — they can capture more than just the description
   * on a loosely-structured page, so `GenericParser` only accepts them past
   * a minimum length floor (see `readDescription`).
   */
  description: [
    "[itemprop='description']",
    "[data-testid*='job-description' i]",
    "[class*='job-description' i]",
    "[class*='posting-description' i]",
    "#job-description",
    "article",
    "main",
  ],

  applyLink: [
    "a[data-testid*='apply' i]",
    "a[class*='apply' i]",
    "button[class*='apply' i]",
    "a[href*='apply' i]",
  ],
} as const;

/** Phrases that signal a posting is no longer open — checked against the page's own body text. */
export const GENERIC_CLOSED_PHRASES = [
  "no longer accepting applications",
  "position has been filled",
  "this job is no longer available",
  "this position is no longer available",
  "applications are closed",
  "job posting has expired",
  "this posting has expired",
];
