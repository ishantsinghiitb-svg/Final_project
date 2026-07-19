import type { EmploymentType, WorkMode } from "../types";

/**
 * Extraction helpers shared by `InternshalaJobParser` (detail pages) and
 * `InternshalaListingParser` (search cards). Keeping the identity/classification
 * logic here guarantees a card and its detail page derive the SAME
 * `source_job_id`, work mode, and employment type — the invariant the
 * detail-enriches-the-listing-row upsert (matched on `source`+`source_job_id`)
 * depends on.
 */

const WHITESPACE = /\s+/g;

export function collapse(text: string | null | undefined): string {
  return (text ?? "").replace(WHITESPACE, " ").trim();
}

/**
 * Internshala's stable posting id (e.g. "3215458"), read from the
 * `internshipid` attribute or the `id="individual_internship_<id>"` fallback —
 * identical on listing cards and the detail page's top card. This is the
 * `source_job_id`; it is NOT the slug number in the URL (a different id), and
 * NOT the JSON-LD `identifier` (which is that same id with a "2026" prefix).
 */
export function readInternshipId(el: Element | null | undefined): string | null {
  if (!el) return null;
  const attr = el.getAttribute("internshipid")?.trim();
  if (attr && /^\d+$/.test(attr)) return attr;

  const idAttr = el.getAttribute("id") ?? "";
  const fromId = /individual_internship_(\d+)/.exec(idAttr);
  if (fromId) return fromId[1];

  return null;
}

/** True when a URL/path points at an internship (vs a job) posting. */
export function isInternshipUrl(url: string): boolean {
  return /\/internship(?:s)?\/detail\//.test(url) || /\/internship\//.test(url);
}

/**
 * Remote / Hybrid / Onsite from the card's location text (and any WFH home
 * icon). Internshala shows "Work from home" for remote, "(Hybrid)" for hybrid,
 * and a city otherwise.
 */
export function classifyWorkMode(
  locationText: string | null,
  hasHomeIcon = false,
): WorkMode | null {
  const text = (locationText ?? "").toLowerCase();
  if (hasHomeIcon || /work from home|\bwfh\b|\bremote\b/.test(text)) return "Remote";
  if (/hybrid/.test(text)) return "Hybrid";
  if (text.trim().length > 0) return "Onsite";
  return null;
}

/**
 * Internship / Part-Time / Full-Time from the posting context. Internshala
 * cleanly splits internships (`/internship/…`) from jobs (`/job/…`) in the URL
 * itself, and flags part-time roles with a visible "Part time" tag — so this is
 * a grounded classification, not a guess: an internship is an Internship, a
 * flagged part-time role is Part-Time, and everything left on the Jobs surface
 * is a Full-Time role (Internshala's Jobs section is full-time positions).
 */
export function classifyEmploymentType(opts: {
  internship: boolean;
  partTime: boolean;
}): EmploymentType {
  if (opts.internship) return "Internship";
  if (opts.partTime) return "Part-Time";
  return "Full-Time";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parses Internshala's short deadline format (e.g. "17 Aug' 26") into an ISO
 * date string, or `null` if it doesn't match. Two-digit years map into the
 * 2000s. Used for `expiry_date` when JSON-LD `validThrough` is absent.
 */
export function parseInternshalaDate(raw: string | null | undefined): string | null {
  const text = collapse(raw);
  const match = /(\d{1,2})\s+([A-Za-z]{3,})'?\s*(\d{2,4})/.exec(text);
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  let year = Number.parseInt(match[3], 10);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null;
  if (year < 100) year += 2000;

  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The value text of the detail row whose leading icon carries `iconClass`
 * (e.g. money → salary/stipend, briefcase → experience), handling both the new
 * (`.row-1-item`) and old (`.other_detail_item`) card layouts. Reads only
 * within `card`.
 */
export function valueForIcon(card: Element, iconClass: string): string | null {
  const icon = card.querySelector(`.${iconClass}`);
  const row = icon?.closest(".row-1-item, .other_detail_item");
  if (!row) return null;

  // Old layout keeps the value in a dedicated `.item_body`.
  const body = row.querySelector(".item_body");
  if (body) return collapse(body.textContent) || null;

  // New layout: prefer the `.mobile` span (it carries the period suffix, e.g.
  // "/year") over `.desktop`, then any value span. Explicit fallbacks — a
  // combined `querySelector` selector list would return whichever matches first
  // in DOM order (`.desktop`), dropping the period.
  const span =
    row.querySelector("span.mobile") ??
    row.querySelector("span.desktop") ??
    row.querySelector("span");
  return collapse(span?.textContent ?? row.textContent) || null;
}

/** First non-empty, whitespace-collapsed text among the given selectors, scoped to `root`. */
export function firstText(root: ParentNode, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const text = collapse(root.querySelector(selector)?.textContent);
    if (text) return text;
  }
  return null;
}

/** First non-empty attribute value among the given selectors, scoped to `root`. */
export function firstAttr(
  root: ParentNode,
  selectors: readonly string[],
  attr: string,
): string | null {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.getAttribute(attr)?.trim();
    if (value) return value;
  }
  return null;
}

/** Parses an "N applicants" phrase into a count, or `null` (e.g. "Be an early applicant"). */
export function parseApplicantCount(raw: string | null | undefined): number | null {
  const match = /([\d,]+)\s*applicant/i.exec(raw ?? "");
  if (!match) return null;
  const n = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
