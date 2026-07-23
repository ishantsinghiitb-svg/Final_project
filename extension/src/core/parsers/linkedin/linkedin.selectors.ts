/**
 * DOM fallback selectors for LinkedIn job pages, used only when JSON-LD
 * doesn't provide a field. Ordered most-specific/current first. LinkedIn
 * changes class names periodically without notice — this list is expected
 * to need occasional retuning against a live, authenticated job page; JSON-LD
 * is deliberately tried first everywhere it's available to minimize how much
 * this list matters in practice.
 */
export const linkedInSelectors = {
  // Ordered fallbacks — most-specific/current class first, then inner-markup
  // variants, then region-scoped `h1`s that survive a full class rename. The
  // scoped `h1`s can only match inside the job-details region, never the global
  // nav or a left-list card. `document.title` is an ADDITIONAL, layout-
  // independent fallback applied in LinkedInParser (not a selector) — it is why
  // /jobs/search-results/ (whose top-card classes differ) now resolves a title.
  title: [
    "h1.job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title a",
    // Container form — catches layouts where the title is neither `h1.X` nor
    // `.X a` but plain text on the `.X` element itself (LinkedIn periodically
    // reshuffles the inner markup while keeping this class).
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    ".jobs-details-top-card__job-title",
    "h1.top-card-layout__title",
    "h1[data-test-job-title]",
    "[data-test-job-details-top-card-job-title]",
    // Region-scoped last resorts (never document-wide `h1`, so they can't match
    // the global nav or a left-list card) for when every class above drifts.
    ".jobs-details__main-content h1",
    ".jobs-search__job-details h1",
    ".jobs-details h1",
    ".job-view-layout h1",
    ".scaffold-layout__detail h1",
  ],
  companyName: [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    // Span/text form of the same top-card class (inner-markup drift).
    ".job-details-jobs-unified-top-card__company-name span",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    "a[data-tracking-control-name='public_jobs_topcard-org-name']",
    ".topcard__org-name-link",
    ".jobs-details-top-card__company-url",
    ".artdeco-entity-lockup__subtitle a",
    // Company links scoped to the job-details region so they can only be THIS
    // job's company, never a left-list item's — resilient when classes drift.
    ".job-details-jobs-unified-top-card__container--two-pane a[href*='/company/']",
    ".jobs-unified-top-card__subtitle-primary-grouping a[href*='/company/']",
    ".job-details-jobs-unified-top-card__primary-description-container a[href*='/company/']",
    ".scaffold-layout__detail a[href*='/company/']",
    ".jobs-details a[href*='/company/']",
  ],
  /**
   * The detail pane's job "top card" — the region holding the CURRENT job's
   * title, company name, and company logo. In LinkedIn's split-pane (SPA) view
   * this is re-rendered for the selected job on every navigation, so scoping
   * the logo search to it guarantees a parse reads THIS company's logo, never
   * a left-list item's, the global nav's, or the previously-viewed job's.
   */
  topCard: [
    ".job-details-jobs-unified-top-card__container--two-pane",
    ".job-details-jobs-unified-top-card",
    ".jobs-unified-top-card",
    ".job-details-jobs-unified-top-card__content",
    ".topcard",
  ],
  /**
   * Company-logo `<img>` selectors searched WITHIN the `topCard` container (see
   * LinkedInParser.readCompanyLogo), so they can be attribute/class based
   * without risk of matching a left-list item's logo or the global nav. The
   * `isLikelyPersonImage` guard in `structuredFields.ts` still rejects a
   * hirer/poster headshot that happens to sit inside the card. Ordered so the
   * canonical media.licdn.com company-logo image (`alt="…logo"`, src contains
   * `company-logo`) wins first.
   */
  companyLogo: [
    "img[alt*='logo' i]",
    "img[src*='company-logo']",
    "img.artdeco-entity-image",
    "a[href*='/company/'] img",
  ],
  /**
   * Document-scoped fallback used only when the `topCard` container can't be
   * located — every selector is fully class-anchored to the top card so it can
   * never match a list item or the nav logo.
   */
  companyLogoStrict: [
    ".job-details-jobs-unified-top-card__company-logo img",
    ".jobs-unified-top-card__company-logo img",
    "a.jobs-unified-top-card__company-name-link img",
  ],
  /** A secondary DOM region (company info panel / right-rail card) distinct from the top-card logo — tried only if the top-card logo yields nothing. */
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
    ".jobs-description-content__text",
    ".jobs-description__container",
    ".jobs-box__html-content",
    ".description__text",
    ".jobs-details__main-content article",
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
    ".jobs-apply-button--top-card a",
    "a[href*='/jobs/view/'][data-tracking-control-name*='apply']",
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
  /**
   * "Meet the hiring team" cards — each yields a member name and, when present,
   * a profile link. Scoped to the hirer/poster cards rather than any `/in/`
   * link on the page.
   */
  hiringTeamCards: [
    ".hirer-card__container",
    ".job-details-module .hirer-card__container",
    ".jobs-poster",
  ],
  hiringTeamName: [
    ".hirer-card__hirer-information a",
    ".jobs-poster__name",
    "a[href*='/in/'] span[aria-hidden='true']",
    "a[href*='/in/']",
  ],
  /** Company "About" region — scanned for a "…employees" company-size phrase. */
  companyInfo: [
    ".jobs-company__box",
    ".jobs-company",
    "[data-view-name='job-details-company-info']",
    ".jobs-company__company-description",
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
