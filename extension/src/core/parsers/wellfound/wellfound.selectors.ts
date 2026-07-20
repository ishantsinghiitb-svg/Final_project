/**
 * Wellfound renders a job in TWO different shells, and the parser must handle
 * both (they are the same underlying job, reached by two URL forms):
 *
 *  • MODAL (`/jobs?job_listing_slug=<id>-<slug>`): a slide-in modal
 *    (`data-test="JobListingSlideIn"`) over the search page. The job's data is
 *    only in the DOM (its GraphQL response isn't in `__NEXT_DATA__`), so this
 *    layout is parsed DOM-first, like LinkedIn. The company `/company/` link,
 *    `<h1>` title, a "|"-separated facts `<ul>`, and `#job-description` all
 *    live inside the modal.
 *
 *  • PAGE (`/jobs/<id>-<slug>`): a full job-detail page
 *    (`data-test="JobDetail"`) rendered inside the company-profile shell. Here
 *    the `<h1>` is "<title> at <company>" (merged) and there is NO `/company/`
 *    link inside `JobDetail` (the only ones there belong to the "Similar jobs"
 *    list — other companies). But this layout IS server-rendered, so a
 *    complete `JobPosting` lives in `__NEXT_DATA__` (Apollo
 *    `JobListing…meta.structuredData`) — the deterministic source used first,
 *    with the `data-test="Masthead"` header as the DOM fallback for company.
 *
 * `data-test`/`alt`/`id` anchors are preferred over Wellfound's hashed
 * `styles_xxx__hash` CSS-module classes. Neither container exists on non-job
 * pages (bare `/jobs`, `/search`, `/company`, `/profile`), so those correctly
 * fall through to the "no job detected" state.
 */
export const wellfoundSelectors = {
  /** The single open-job containers, one per layout. */
  modalRoot: '[data-test="JobListingSlideIn"]',
  pageRoot: '[data-test="JobDetail"]',
  /** The company header on the PAGE layout — sibling of `JobDetail`, carries the real company. */
  masthead: '[data-test="Masthead"]',

  /** Resolved WITHIN the open-job container (modal). */
  title: ["h1"],
  companyLink: ['a[href*="/company/"]'],
  description: ["#job-description"],
  /** Label spans for the "Job Location" / "Hires remotely in" / "Skills" / … grid. */
  fieldLabel: ["span.text-md.font-semibold"],
  companySizeIcon: ['img[alt="Company Size"]'],
  companyIndustryIcon: ['img[alt="Company Industries"]'],
} as const;

export const WELLFOUND_CLOSED_PHRASES = [
  "no longer accepting applications",
  "this job has been filled",
  "this position has closed",
  "job is closed",
];
