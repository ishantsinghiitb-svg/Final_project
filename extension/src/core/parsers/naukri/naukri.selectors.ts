/**
 * Naukri renders its job-detail page from server-side JSON-LD (`JobPosting`)
 * PLUS CSS-modules markup whose class names are `styles_<name>__<hash>`. The
 * `<hash>` suffix changes on every front-end build, so these selectors target
 * the STABLE middle segment via `[class*='…']` (and the shared, un-hashed
 * `ni-icon-*` font classes) rather than the full hashed class — far more
 * durable across Naukri deploys. JSON-LD is the primary source regardless;
 * these only back-fill the few fields JSON-LD doesn't carry cleanly
 * (experience range, applicant count, posted-ago).
 */
export const naukriSelectors = {
  title: ["h1[class*='jd-header-title']", "[class*='jd-header-title']"],
  companyName: ["[class*='jd-header-comp-name'] a", "[class*='jd-header-comp-name']"],
  companyLogo: [
    "img[class*='jhc__comp-banner']",
    "[class*='jhc__comp-banner']",
    "[class*='comp-banner'] img",
  ],
  salary: ["[class*='jhc__salary'] span", "[class*='jhc__salary']"],
  /** Experience row — icon class is the resilient anchor; hashed class is a fallback. */
  experience: ["[class*='jhc__exp'] span", "[class*='jhc__exp']"],
  location: ["[class*='jhc__location'] a", "[class*='jhc__loc'] a", "[class*='jhc__loc'] span"],
  /** Each stat is `<label>Posted: </label><span>2 days ago</span>` etc. */
  stat: ["[class*='jhc__stat']"],
  description: ["[class*='JDC__dang-inner-html']", "[class*='dang-inner-html']"],
} as const;

/** Stable shared-font icon classes, un-hashed — usable as resilient anchors. */
export const naukriIcons = {
  experience: "ni-icon-bag",
  salary: "ni-icon-salary",
  location: "ni-icon-location",
} as const;

export const NAUKRI_CLOSED_PHRASES = [
  "this job is no longer available",
  "no longer accepting applications",
  "job has expired",
];
