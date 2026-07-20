/**
 * Indeed renders a job in TWO distinct server-rendered shells, reached by the
 * four URL forms the extension must support:
 *
 *   • The VIEWJOB pane (`?vjk=<id>` and `?from=gnav-homepage&vjk=<id>`) — the
 *     right-hand detail pane on the homepage/search results. Its fields carry
 *     STABLE ids/`data-testid`s (`jobsearch-JobInfoHeader-title`,
 *     `inlineHeader-companyName`, `salaryInfoAndJobType`, `jobDescriptionText`,
 *     `benefits`) that are unique on the page, so they're queried off
 *     `document` directly — the listing cards on the same page use a different
 *     set of `data-testid`s (`company-name`, `text-location`, `jobTitle-<jk>`)
 *     and never collide with these.
 *
 *   • The company JOB-DETAIL section (`/cmp/<Company>/jobs?jk=<id>`) — a
 *     different React app (`#acme-webapp-job-details-section`) with its own
 *     `jobDetailTitle`/`jobDetailSubtitle`/`jobDetailDescription` testids.
 *
 * Indeed's CSS-module class names (`css-<hash>`) change on every front-end
 * build, so NONE are used as anchors — only the stable ids and `data-testid`s
 * above, which have held across Indeed deploys.
 */
export const indeedSelectors = {
  /** VIEWJOB pane (homepage/search `?vjk=` detail). */
  viewjob: {
    /** Wraps the whole right-hand detail pane — the scope for closed-state text. */
    detailRoot: '[data-testid="vjJobDetails-test"]',
    title: '[data-testid="jobsearch-JobInfoHeader-title"]',
    companyContainer: '[data-testid="jobsearch-CompanyInfoContainer"]',
    companyName: '[data-testid="inlineHeader-companyName"]',
    companyLink: '[data-testid="inlineHeader-companyName"] a',
    location: '[data-testid="inlineHeader-companyLocation"]',
    salaryAndJobType: "#salaryInfoAndJobType",
    description: "#jobDescriptionText",
    benefits: "#benefits",
    benefitsItems: "#benefits li",
    jobDetailsSection: "#jobDetailsSection",
    /** Each attribute group is `[role="group"][aria-label="Job type"|"Pay"|…]`. */
    attributeGroup: '[role="group"][aria-label]',
    /** Clean per-tile value: `data-testid="<Value>-tile"`. */
    attributeTile: "[data-testid$='-tile']",
  },

  /** Company job-detail section (`/cmp/<Company>/jobs?jk=`). */
  company: {
    container: "#acme-webapp-job-details-section",
    title: '[data-testid="jobDetailTitle"]',
    subtitle: '[data-testid="jobDetailSubtitle"]',
    description: '[data-testid="jobDetailDescription"]',
    head: '[data-testid="JobDetailHead"]',
  },

  /** Attribute carried by the "Apply with Indeed" widget — the open job's jk. */
  applyJk: "[data-indeed-apply-jk]",

  /** Search/homepage listing cards. */
  listing: {
    card: ".job_seen_beacon",
    /** The title anchor carries the canonical `data-jk` (the job key). */
    titleLink: "h3.jobTitle a[data-jk], a.jcs-JobTitle[data-jk]",
    titleText: "span[id^='jobTitle-']",
    companyName: '[data-testid="company-name"]',
    location: '[data-testid="text-location"]',
    salary: "[data-testid*='salary-snippet-container']",
    easyApply: ".mosaic-provider-jobcards-1f1q1js",
  },
} as const;

/** Lower-cased body phrases that mean the posting is closed/expired. */
export const INDEED_CLOSED_PHRASES = [
  "this job has expired",
  "this job is no longer available",
  "no longer accepting applications",
  "job posting has expired",
];
