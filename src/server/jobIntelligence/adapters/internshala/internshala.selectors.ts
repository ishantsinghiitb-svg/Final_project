// ── Module 10B.1: Internshala markup constants ──
//
// Server-side counterpart to the extension's
// `extension/src/core/parsers/internshala/internshala.selectors.ts`. The
// extension is FROZEN for this module (and runs in a browser with a real
// DOM), so its selectors cannot be imported — but the class names below are
// the same ones, kept in one file for the same reason: when Internshala
// changes its markup, exactly one file needs editing.
//
// These are class TOKENS, not CSS selectors — the server-side extractor
// matches whole class tokens (see parsers/html.ts#hasClass).

export const INTERNSHALA_ORIGIN = "https://internshala.com";

/** The card wrapper on both listing pages and the top of a detail page. */
export const CARD_CLASS = "individual_internship";

/** Attribute carrying Internshala's stable posting id — the `source_job_id`. */
export const INTERNSHIP_ID_ATTRIBUTE = "internshipid";

/** Listing card link to the detail page (also present as a `data-href` attribute on the card). */
export const CARD_HREF_ATTRIBUTE = "data-href";
export const CARD_TITLE_CLASS = "job-internship-name";
export const CARD_COMPANY_CLASS = "company-name";

// ── Detail page ──
export const DETAIL_TITLE_CLASS = "heading_title";
export const DETAIL_COMPANY_CLASS = "company_name";
export const DETAIL_LOGO_CLASS = "internship_logo";
export const DETAIL_LOCATION_ID = "location_names";
export const DETAIL_ITEM_CLASS = "other_detail_item";
export const DETAIL_ITEM_HEADING_CLASS = "item_heading";
export const DETAIL_ITEM_BODY_CLASS = "item_body";
export const DETAIL_STIPEND_CLASS = "stipend";
export const DETAIL_SECTION_CLASS = "internship_details";
export const DETAIL_TEXT_CONTAINER_CLASS = "text-container";
export const DETAIL_WHO_CAN_APPLY_CLASS = "who_can_apply";
export const DETAIL_COMPANY_INFO_CLASS = "company_info";
export const DETAIL_SKILL_TAG_CLASS = "round_tabs";
export const DETAIL_STATUS_CLASS = "status";

/** Detail-row headings, lowercased, as they appear in `.item_heading`. */
export const DETAIL_HEADINGS = {
  startDate: "start date",
  duration: "duration",
  stipend: "stipend",
  applyBy: "apply by",
  salary: "salary",
  experience: "experience",
} as const;

/**
 * Internshala cleanly separates internships from jobs in the URL itself
 * (`/internship/detail/…` vs `/job/detail/…`), which is what makes the
 * employment-type classification grounded rather than a guess — the same
 * reasoning the extension parser documents.
 */
export const INTERNSHIP_DETAIL_PATH = /\/internship\/detail\//i;
export const JOB_DETAIL_PATH = /\/job\/detail\//i;
