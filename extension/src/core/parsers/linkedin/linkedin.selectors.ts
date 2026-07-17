/**
 * DOM fallback selectors for LinkedIn job pages, used only when JSON-LD
 * doesn't provide a field. Ordered most-specific/current first. LinkedIn
 * changes class names periodically without notice — this list is expected
 * to need occasional retuning against a live, authenticated job page; JSON-LD
 * is deliberately tried first everywhere it's available to minimize how much
 * this list matters in practice.
 */
export const linkedInSelectors = {
  title: [
    "h1.job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title a",
    ".jobs-unified-top-card__job-title h1",
    "h1.top-card-layout__title",
    "h1[data-test-job-title]",
  ],
  companyName: [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    "a[data-tracking-control-name='public_jobs_topcard-org-name']",
    ".topcard__org-name-link",
  ],
  companyLogo: [
    ".job-details-jobs-unified-top-card__company-logo img",
    ".display-flex.align-items-center img",
    ".jobs-unified-top-card__company-logo img",
    "a.jobs-unified-top-card__company-name-link img",
    ".job-details-jobs-unified-top-card__container--two-pane img.artdeco-entity-image",
    "img.artdeco-entity-image",
    "img.EntityPhoto-square-3",
    "img[alt$='logo' i]",
    "a[href*='/company/'] img",
  ],
  /** A secondary DOM region (company info panel / right-rail card) distinct from the top-card logo — tried only if `companyLogo` yields nothing. */
  companyPageLogo: [
    ".jobs-company__box img",
    ".jobs-company__logo",
    "[data-view-name='job-details-company-info'] img",
    ".artdeco-entity-lockup__image img",
  ],
  location: [
    ".job-details-jobs-unified-top-card__primary-description-container span:first-child",
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
  ],
  /** The container whose child segments (location / posted-ago / applicant-count) get classified independently — see `parsePrimaryDescription`. */
  primaryDescriptionContainer: [
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".jobs-unified-top-card__primary-description",
    ".topcard__flavor-row",
  ],
  /**
   * The "fit & preferences" row exposes workplace type and employment type as
   * separate `<button><strong>` chips (e.g. "On-site", "Full-time") — the
   * highest-priority source for both, read independently per button. See
   * `parseFitLevelPreferences`.
   */
  fitLevelPreferences: [".job-details-fit-level-preferences"],
  postedTime: [
    ".job-details-jobs-unified-top-card__primary-description-container time",
    ".jobs-unified-top-card__posted-date",
    ".posted-time-ago__text",
    "time",
  ],
  description: [
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".description__text",
    "article",
  ],
  criteriaItems: [
    "li.description__job-criteria-item",
    ".job-details-jobs-unified-top-card__job-insight span",
  ],
  /** Read relative to a single criteria `<li>`, not the document — see `parseCriteriaList`. */
  criteriaSubheader: [".description__job-criteria-subheader", "h3"],
  criteriaValue: [".description__job-criteria-text", "span"],
  applyLink: [
    "a[data-tracking-control-name='public_jobs_apply-link-offsite']",
    "a.jobs-apply-button",
    "a[data-tracking-control-name*='apply']",
  ],
  easyApplyButton: [
    "button.jobs-apply-button[aria-label*='Easy Apply' i]",
    "[data-easy-apply-button]",
  ],
  promotedIndicator: [".job-details-jobs-unified-top-card__job-insight--promoted"],
  repostedIndicator: [".job-details-jobs-unified-top-card__job-insight--reposted"],
  /** Shown when applications route through an external ATS rather than LinkedIn itself. */
  responsesManagedIndicator: [
    ".jobs-apply-button--top-card [class*='response']",
    "[data-test-application-managed-off-linkedin]",
  ],
  /**
   * The "insight pill" row directly under the title/company — often crams
   * workplace type + employment type + seniority into one `·`-separated
   * string. Segmented and classified in `parseJobInsightSegments`, not read
   * as one blob.
   */
  jobInsights: [
    ".job-details-jobs-unified-top-card__job-insight",
    ".job-details-jobs-unified-top-card__job-insight-view-model-secondary",
    ".jobs-unified-top-card__job-insight",
  ],
  hiringInsights: [
    ".job-details-jobs-unified-top-card__hirer-highlight",
    ".jobs-poster__name",
    ".hirer-card__hirer-information",
  ],
  benefits: [".job-details-benefits__list li", ".jobs-benefits__list li"],
  skillItems: [
    ".job-details-how-you-match__skills-item-text",
    ".job-details-skill-match-status-list li",
  ],
} as const;

export const CLOSED_JOB_PHRASES = [
  "no longer accepting applications",
  "is no longer available",
  "job posting has expired",
  "position has been filled",
  "no longer accepting applicants",
];
