/**
 * Foundit renders its job-detail page server-side with mostly Tailwind
 * utility classes (no CSS-module hash churn to defend against, unlike
 * Naukri) but very few stable ids. Where a real id exists (`#jdPageHeader`,
 * `#jobCompany`, `#jobDescription`, `#skillSectionNew`) these anchor on it;
 * everywhere else they anchor on structure (a link's `href` pattern) rather
 * than the utility class soup, per the "prefer semantic selectors" standard.
 * JSON-LD (`JobPosting`) is still the PRIMARY source for nearly every field —
 * these are fallbacks for what JSON-LD omits (experience range, applicant
 * count, posted-ago, the "More Info" rows).
 */
export const founditSelectors = {
  header: {
    container: ["#jdPageHeader"],
    title: ["#jdPageHeader h1", "h1"],
    /** The company's own Foundit search-results page link, right under the title. */
    companyLink: ["#jdPageHeader a[href*='/search/']"],
    /** The single clean location chip (e.g. "Hyderabad", "Remote"). */
    locationLink: ["#jdPageHeader a[href*='/search/jobs-in-']"],
  },
  companyLogo: ["#jobCompany img"],
  description: ["#jobDescription .break-words", "#jobDescription"],
  skillsFallback: ["#skillSectionNew p", "#skillSectionNew a"],
  /** "Posted N days ago" / "Over N applicants" stat row, just below the header. */
  statList: ["ul.no-scrollbar"],

  listing: {
    container: ["#middleSection"],
    card: [".jobCardWrapper"],
    titleLink: [".jobCardTitle a"],
    companyLink: [".jobCardCompany a"],
    logo: [".jobCardCompanyLogo img"],
    location: [".jobCardLocation span", ".jobCardLocation"],
    experience: [".jobCardExperience label"],
    salary: [".jobCardSalary label"],
  },
} as const;

export const FOUNDIT_LISTING_PATH_PATTERN = /^\/search\//;
export const FOUNDIT_DETAIL_PATH_PATTERN = /^\/job\//;
