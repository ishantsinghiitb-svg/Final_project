/**
 * DOM selectors for Internshala's internship AND job pages. Internshala renders
 * both server-side with stable, human-readable class names (very unlike
 * LinkedIn's churny hashed classes), so these are reliable primary sources —
 * not just JSON-LD fallbacks. JSON-LD (`JobPosting`) is present on internship
 * detail pages and most job detail pages, but NOT guaranteed on every job page,
 * so the detail parser reads the DOM first and treats JSON-LD as enrichment.
 *
 * Detail (`/internship/detail/…`, `/job/detail/…`) and listing (`/internships`,
 * `/jobs`, `/fresher-jobs`, …) pages share the same `.individual_internship`
 * card component but arrange it differently, so both selector sets live here.
 */
export const internshalaSelectors = {
  // ── Detail page ──────────────────────────────────────────────────────────
  detail: {
    /** Page-level `<h1>` — the canonical job/internship title. */
    title: ["h1.heading_title", "h1.heading_2_4", ".heading_title"],
    /** The main (top) card wrapping this posting's meta — carries `internshipid`. */
    mainCard: [
      "#details_container .detail_view .individual_internship[internshipid]",
      ".detail_view .individual_internship[internshipid]",
      "#details_container .individual_internship[internshipid]",
    ],
    /** In-card "profile" label (e.g. "Videography") — a title fallback. */
    profile: [".individual_internship_header .profile", ".profile"],
    /** Company name + its Internshala company-page link. */
    companyName: [".company_name .link_display_like_text", ".company_name a", ".company_name"],
    companyLogo: [".internship_logo img"],
    /** Location block; text is the city, or "Work from home" for WFH. */
    location: ["#location_names"],
    /** Internship stipend chip (e.g. "₹ 18,000 - 20,000 /month", "Unpaid"). */
    stipend: [".stipend_container .item_body .stipend", ".stipend_container .stipend", ".stipend"],
    /** Job CTC chip; the `.mobile` span carries the "/year" period suffix. */
    salary: [
      ".salary_container .item_body.salary .mobile",
      ".salary_container .salary .mobile",
      ".salary_container .salary .desktop",
      ".salary .mobile",
    ],
    experience: [".job-experience-item .item_body.desktop-text", ".job-experience-item .item_body"],
    applyBy: [".apply_by .item_body"],
    applicants: [".applications_message"],
    postedStatus: [
      ".tags_container_outer .status-success",
      ".tags_container_outer .status-info",
      ".status-success",
      ".status-info",
    ],
    statusInput: ["#status"],

    /** The description region below the top card. */
    details: [".detail_view .internship_details", ".internship_details"],
    aboutHeading: [".about_heading"],
    skillsHeading: [".skills_heading"],
    perksHeading: [".perks_heading"],
    roundTab: [".round_tabs"],
    whoCanApply: [".who_can_apply"],
    aboutCompany: [".about_company_text_container"],
    companyWebsite: [".company_info .website_link a", ".website_link a"],
  },

  // ── Listing / search page ────────────────────────────────────────────────
  listing: {
    /** The list container the search results render into. */
    container: ["#internship_list_container", "#list_container"],
    /** Every real card carries `internshipid`; ad/promo blocks never do. */
    card: [".individual_internship[internshipid]"],
    // New (jobs) card layout.
    titleNew: [".job-internship-name a.job-title-href", ".job-title-href", ".job-internship-name"],
    companyNew: [".company-name"],
    locationsNew: [
      ".detail-row-1 .locations span",
      ".row-1-item.locations span",
      ".locations span",
    ],
    row1Item: [".detail-row-1 .row-1-item", ".row-1-item"],
    aboutSnippet: [".about_job .text"],
    skillNew: [".job_skills .job_skill"],
    postedNew: [
      ".detail-row-2 .color-labels .status-success span",
      ".detail-row-2 .color-labels .status-info span",
      ".color-labels .status-success span",
      ".color-labels .status-info span",
    ],
    grayLabel: [".detail-row-2 .gray-labels .status-li span", ".gray-labels .status-li span"],
    // Old (internship) / "similar" card layout.
    titleOld: [".individual_internship_header .profile", ".profile"],
    companyOld: [".company_name .link_display_like_text", ".company_name a"],
    locationOld: ["#location_names"],
    otherDetailItem: [".internship_other_details_container .other_detail_item"],
    stipendOld: [".stipend_container .stipend", ".stipend"],
    salaryOld: [".salary_container .salary .mobile", ".salary .mobile"],
    tag: [".tags_container_outer .status"],
    logo: [".internship_logo img"],
  },
} as const;

/** Icon classes that label a detail-row's meaning, on both card layouts. */
export const internshalaIcons = {
  money: "ic-16-money",
  experience: "ic-16-briefcase",
  duration: "ic-16-calendar",
  wfh: "ic-16-home",
} as const;

/** Phrases on a detail page that signal the posting is no longer open. */
export const INTERNSHALA_CLOSED_PHRASES = [
  "this internship is no longer available",
  "this job is no longer available",
  "application closed",
  "is no longer accepting applications",
];
