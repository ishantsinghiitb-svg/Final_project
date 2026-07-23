import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
import { createUniversalJob } from "../types";
import type {
  EmploymentType,
  HiringTeamMember,
  ParserContext,
  SalaryPeriod,
  UniversalJob,
  WorkMode,
} from "../types";
import { extractLinkedInJobIdFromUrl } from "./externalId";
import { CLOSED_JOB_PHRASES, linkedInSelectors } from "./linkedin.selectors";
import { EMPLOYMENT_TYPE_PATTERNS, WORK_MODE_KEYWORDS } from "./patterns";
import { sanitizeDescriptionHtml } from "./sanitize";
import {
  firstImageUrl,
  isPlaceholderImageUrl,
  parseCriteriaList,
  parseFitLevelPreferences,
  parseJobInsightSegments,
  parsePrimaryDescriptionSegments,
  type FitLevelPreferences,
  type JobInsightSegments,
} from "./structuredFields";

type JsonLdJobPosting = Record<string, unknown>;

/** Bumped when this parser's extraction logic changes materially. */
const LINKEDIN_PARSER_VERSION = "linkedin-2";

/**
 * LinkedIn tab titles that are NOT a job — used to reject the `document.title`
 * fallback on non-job surfaces (feed, messaging, a company page) so it can only
 * ever fill in a real job's title/company, never mislabel another page as a job.
 */
const GENERIC_LINKEDIN_TITLE =
  /^(linkedin|jobs?|jobs? search|feed|messaging|notifications|my network|search|home|profile|sales navigator|recruiter)$/i;

type DocTitleParts = { title: string | null; company: string | null; location: string | null };

const SALARY_UNIT_MAP: Record<string, SalaryPeriod> = {
  HOUR: "Hourly",
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};

const EMPLOYMENT_TYPE_MAP: Record<string, EmploymentType> = {
  FULL_TIME: "Full-Time",
  PART_TIME: "Part-Time",
  CONTRACTOR: "Contract",
  TEMPORARY: "Temporary",
  INTERN: "Internship",
  INTERNSHIP: "Internship",
};

/** Visible top-card word (hyphens stripped) → EmploymentType enum. */
const EMPLOYMENT_TYPE_TEXT: Record<string, EmploymentType> = {
  fulltime: "Full-Time",
  parttime: "Part-Time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
};

/** Visible top-card word (hyphens stripped) → WorkMode enum. */
const WORK_MODE_TEXT: Record<string, WorkMode> = {
  onsite: "Onsite",
  remote: "Remote",
  hybrid: "Hybrid",
};

type TopCardFacts = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postedAgo: string | null;
  applicantCount: number | null;
  employmentType: EmploymentType | null;
  workMode: WorkMode | null;
  promoted: boolean;
  responsesManaged: boolean;
  easyApply: boolean;
};

type LocationParts = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type DescriptionParts = {
  text: string | null;
  html: string | null;
};

/**
 * Production LinkedIn parser. Tries JSON-LD (`JobPosting`) first, then falls
 * back to semantic/data attributes and, last, the class-name selectors in
 * `linkedin.selectors.ts`. Every field is read independently — nothing here
 * infers one field from another, and a missing field never blocks the rest.
 *
 * `tryParse` returns `null` whenever there is no valid job-details DOM to
 * read — no page-URL gating happens here, so this runs the same way on
 * /jobs/view/*, /jobs/search/* (split-pane), /jobs/collections/*, or any
 * future LinkedIn surface that renders the same job-details panel.
 */
export class LinkedInParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;
    const jsonLd = this.findJsonLdByType(document, "JobPosting");
    const sourceJobId = this.readSourceJobId(document, url, jsonLd);

    // ── Locate the VISIBLE details pane ──
    // LinkedIn's current /jobs/* surfaces render with obfuscated, per-build
    // hashed class names (`_913286c8` …), so class selectors alone can't find
    // the selected job. The details pane is instead located by STABLE semantic
    // landmarks: the selected job's own `/jobs/view/<id>` title link and the
    // "About the job" description heading (list cards never contain the latter).
    const details = this.findDetailsPane(document, sourceJobId);

    // ── Title + company · priority: DOM → JSON-LD → document.title (last) ──
    // DOM ALWAYS wins. `readTitleDom`/`readCompanyDom` read the details pane's
    // own title/company links; the class selectors are a fallback for older
    // layouts; `document.title` only ever fills a field still empty after both
    // (it can never overwrite a DOM value).
    const domTitle =
      this.readTitleDom(document, details, sourceJobId) ??
      this.firstText(document, [...linkedInSelectors.title]);
    const domCompany =
      this.readCompanyDom(details) ?? this.firstText(document, [...linkedInSelectors.companyName]);

    const jsonTitle =
      typeof jsonLd?.title === "string" ? this.cleanText(jsonLd.title) || null : null;
    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const jsonCompany = typeof org?.name === "string" ? this.cleanText(org.name) || null : null;

    // A hard signal that a job is genuinely on this page. Non-job surfaces
    // (feed, profile, messaging) have none, which stops the document.title
    // fallback from mislabeling them as a job (they all have a document.title).
    const hasJobSignal =
      Boolean(jsonLd) ||
      Boolean(sourceJobId) ||
      Boolean(domTitle) ||
      Boolean(domCompany) ||
      Boolean(details) ||
      document.querySelector(linkedInSelectors.topCard.join(", ")) !== null;

    const docParts: DocTitleParts = hasJobSignal
      ? this.readDocumentTitleParts(document)
      : { title: null, company: null, location: null };

    const title = domTitle ?? jsonTitle ?? docParts.title;
    const companyName = domCompany ?? jsonCompany ?? docParts.company;

    // Return null ONLY when there is genuinely no LinkedIn job — no title, no
    // company, AND no job id. A single failed selector never nulls the parse.
    if (!title && !companyName && !sourceJobId) {
      return null;
    }

    // ── Description · DOM ("About the job") → JSON-LD/class fallback ──
    const domDesc = this.readDescriptionDom(document, details);
    const { text: description, html: descriptionHtml } = domDesc.text
      ? domDesc
      : this.readDescription(document, jsonLd);

    // ── Top-card metadata (location / posted / applicants / type / mode) ──
    // Parsed from the details pane's own tertiary line — layout-independent,
    // used only to FILL fields the structured sources didn't already provide.
    const top = this.parseTopCard(details, title ?? "");

    const sourceUrl = sourceJobId
      ? `https://www.linkedin.com/jobs/view/${sourceJobId}/`
      : this.stableUrl(url);

    const criteriaMap = parseCriteriaList(document);
    const criteriaText = this.readCriteriaText(document);
    const primarySegments = parsePrimaryDescriptionSegments(document);
    const insightSegments = parseJobInsightSegments(document);
    const fitPreferences = parseFitLevelPreferences(document);
    const companyUrl = this.readCompanyUrl(document, jsonLd, details);
    const locationParts = this.readLocationParts(jsonLd);
    const location =
      locationParts.location ??
      primarySegments.location ??
      this.firstText(document, [...linkedInSelectors.location]) ??
      top.location ??
      docParts.location;

    const workMode =
      this.readWorkMode(fitPreferences, criteriaMap, insightSegments, criteriaText) ?? top.workMode;
    const employmentType =
      this.readEmploymentType(jsonLd, fitPreferences, criteriaMap, insightSegments, criteriaText) ??
      top.employmentType;

    return createUniversalJob({
      source: SupportedSite.LinkedIn,
      parserVersion: LINKEDIN_PARSER_VERSION,
      sourceJobId,
      title: title ?? "",
      companyName: companyName ?? "",
      companyLogoUrl: this.readLogoDom(document, details) ?? this.readCompanyLogo(document, jsonLd),
      companyUrl,
      location,
      city: locationParts.city ?? top.city,
      state: locationParts.state ?? top.state,
      country: locationParts.country ?? top.country,
      workMode,
      employmentType,
      experienceLevel: this.readExperienceLevel(criteriaMap, insightSegments, criteriaText),
      salaryMin: this.readSalary(jsonLd, "minValue"),
      salaryMax: this.readSalary(jsonLd, "maxValue"),
      salaryCurrency: this.readSalaryCurrency(jsonLd),
      salaryPeriod: this.readSalaryPeriod(jsonLd),
      skills: this.readSkills(document),
      postedAt: this.readPostedAt(document, jsonLd),
      postedAgo: primarySegments.postedAgo ?? top.postedAgo,
      expiryDate: this.readExpiryDate(jsonLd),
      applicantCount: primarySegments.applicantCount ?? top.applicantCount,
      hiringTeam: this.readHiringTeam(document),
      companySize: this.readCompanySize(document),
      hiringInsights: this.readHiringInsights(document),
      easyApply: this.readEasyApply(document) || top.easyApply,
      promoted: this.readPromoted(document) || top.promoted,
      reposted: this.readReposted(document),
      responsesManaged: this.readResponsesManaged(document) || top.responsesManaged,
      industry: this.readIndustry(criteriaMap),
      jobFunction: this.readJobFunction(criteriaMap),
      benefits: this.readBenefits(document),
      description,
      descriptionHtml,
      applyUrl: this.readApplyDom(document, details) ?? this.readApplyUrl(document) ?? sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document, jsonLd),
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Visible-DOM extraction (obfuscated-class-proof) — Module 6C
  //
  // LinkedIn's live /jobs/* DOM uses hashed, per-build class names, so these
  // read the details pane via STABLE semantic anchors only: the selected job's
  // `/jobs/view/<id>` title link, the `/company/<slug>` company link, the
  // `img[alt*="logo"]` company logo, the `aria-label*="apply"` button, and the
  // "About the job" description heading. Verified against real saved DOM.
  // ══════════════════════════════════════════════════════════════════════

  /** The description heading — a stable text landmark unique to the selected job's full view. */
  private findAboutHeading(root: ParentNode): Element | null {
    const heads = Array.from(root.querySelectorAll("h1, h2, h3, h4, strong"));
    return heads.find((h) => /^\s*about the job\s*$/i.test(h.textContent ?? "")) ?? null;
  }

  /** The selected job's title link — scoped to `currentJobId` so it's this job, never a left-list card. */
  private jobTitleLink(document: Document, jobId: string | null): Element | null {
    if (jobId) {
      const scoped = document.querySelector(`a[href*="/jobs/view/${jobId}"]`);
      if (scoped) return scoped;
    }
    return document.querySelector('a[href*="/jobs/view/"]');
  }

  /**
   * The details pane = the smallest ancestor of the selected job's title link
   * that also contains the "About the job" heading. Falls back to the heading's
   * or title link's own container. Returns null on non-job pages.
   */
  private findDetailsPane(document: Document, jobId: string | null): Element | null {
    const titleLink = this.jobTitleLink(document, jobId);
    const about = this.findAboutHeading(document);
    if (titleLink && about) {
      let node: Element | null = titleLink.parentElement;
      for (let i = 0; node && i < 30; i++) {
        if (node.contains(about)) return node;
        node = node.parentElement;
      }
    }
    return about?.parentElement ?? titleLink?.parentElement ?? null;
  }

  private readTitleDom(
    document: Document,
    details: Element | null,
    jobId: string | null,
  ): string | null {
    const link =
      this.jobTitleLink(document, jobId) ??
      details?.querySelector('a[href*="/jobs/view/"]') ??
      null;
    const text = link ? this.cleanText(link.textContent ?? "") : "";
    // Strip a trailing "(Verified job)" / "with verification" decoration.
    return text ? text.replace(/\s*\((?:verified job|with verification)\)\s*$/i, "").trim() : null;
  }

  private readCompanyDom(details: Element | null): string | null {
    if (!details) return null;
    // First /company/ link inside the pane — the top card precedes the company
    // card, so the first clean link text is the company NAME (not "N followers").
    for (const a of Array.from(details.querySelectorAll('a[href*="/company/"]'))) {
      const t = this.cleanText(a.textContent ?? "");
      if (t && t.length <= 80 && !/follower|^show more$|^see all/i.test(t)) return t;
    }
    return null;
  }

  private readLogoDom(document: Document, details: Element | null): string | null {
    const scope: ParentNode = details ?? document;
    const img =
      scope.querySelector('img[alt*="logo" i]') ??
      document.querySelector('img[alt*="logo" i]') ??
      (details ? details.querySelector("img") : null);
    if (!img) return null;
    for (const attr of ["src", "data-delayed-url", "data-ghost-url", "data-src"]) {
      const v = img.getAttribute(attr)?.trim();
      if (v && !v.startsWith("data:") && !isPlaceholderImageUrl(v)) return v;
    }
    return null;
  }

  private readApplyDom(document: Document, details: Element | null): string | null {
    const scope: ParentNode = details ?? document;
    const btn =
      scope.querySelector('a[aria-label*="apply" i][href]') ??
      document.querySelector('a[aria-label*="apply" i][href]');
    const href = btn?.getAttribute("href")?.trim();
    if (!href) return null;
    // LinkedIn wraps external apply links: /safety/go/?url=<encoded>&… — unwrap it.
    if (/\/safety\/go/i.test(href)) {
      const m = /[?&]url=([^&]+)/.exec(href);
      if (m) {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          /* fall through to raw href */
        }
      }
    }
    return href.startsWith("http") ? href : null;
  }

  private readDescriptionDom(document: Document, details: Element | null): DescriptionParts {
    const about = this.findAboutHeading(details ?? document);
    if (!about) return { text: null, html: null };
    // The heading sits in its own sub-wrapper; the body paragraphs are its
    // siblings, so the section holding BOTH is the heading's grandparent.
    const section = about.parentElement?.parentElement ?? about.parentElement;
    if (!section) return { text: null, html: null };
    const html = (section.innerHTML ?? "")
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i, "") // drop the "About the job" heading
      .trim();
    const text = this.htmlToText(html);
    if (!text || text.length < 20) return { text: null, html: null };
    return { text, html: sanitizeDescriptionHtml(html) };
  }

  /**
   * Parses the details pane's tertiary line (e.g. "Bengaluru, Karnataka, India ·
   * 13 hours ago · Over 100 people clicked apply … Full-time") for the fields
   * the structured sources don't expose on obfuscated layouts. Deterministic
   * patterns only — never guesses; a field it can't confidently read stays null.
   */
  private parseTopCard(details: Element | null, title: string): TopCardFacts {
    const empty: TopCardFacts = {
      location: null,
      city: null,
      state: null,
      country: null,
      postedAgo: null,
      applicantCount: null,
      employmentType: null,
      workMode: null,
      promoted: false,
      responsesManaged: false,
      easyApply: false,
    };
    if (!details) return empty;
    const full = this.cleanText(details.textContent ?? "");
    const at = title ? full.indexOf(title) : -1;
    const win = (at >= 0 ? full.slice(at + title.length) : full).slice(0, 400);

    const facts: TopCardFacts = { ...empty };

    const seg0 = (win.split("·")[0] ?? "").trim();
    if (
      seg0 &&
      seg0.length <= 80 &&
      /[a-z]/i.test(seg0) &&
      !/\bago\b|applicant|clicked apply|promoted|managed|full-?time|part-?time|contract|internship|save\b|apply\b/i.test(
        seg0,
      )
    ) {
      const loc = seg0.replace(/\s*\((?:on-?site|remote|hybrid)\)\s*$/i, "").trim();
      if (loc) {
        facts.location = loc;
        const p = loc
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (p.length >= 3) [facts.city, facts.state, facts.country] = [p[0], p[1], p[p.length - 1]];
        else if (p.length === 2) [facts.city, facts.country] = [p[0], p[1]];
        else facts.city = p[0] ?? null;
      }
    }

    const posted = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(win);
    if (posted) facts.postedAgo = `${posted[1]} ${posted[2]}${posted[1] === "1" ? "" : "s"} ago`;

    const appl = /over\s+(\d+)\s+(?:people|applicant)|(\d[\d,]*)\s+applicants?/i.exec(win);
    if (appl) facts.applicantCount = Number((appl[1] ?? appl[2]).replace(/,/g, ""));

    // Employment type / work mode are their own leaf chips (e.g. a `<span>`
    // "Full-time"). In the concatenated textContent they glue to neighbours
    // ("LinkedInFull-timeApply"), which defeats a word-boundary regex — so read
    // them from leaf elements whose OWN text is exactly the label instead.
    const et = this.findChipLabel(
      details,
      /^(full-?time|part-?time|contract|internship|temporary|freelance)$/i,
    );
    if (et) facts.employmentType = EMPLOYMENT_TYPE_TEXT[et.toLowerCase().replace("-", "")] ?? null;

    const wm = this.findChipLabel(details, /^\(?(on-?site|remote|hybrid)\)?$/i);
    if (wm) {
      const key = wm.toLowerCase().replace(/[()-]/g, "");
      facts.workMode = WORK_MODE_TEXT[key] ?? null;
    }

    facts.promoted = /\bpromoted\b/i.test(win);
    facts.responsesManaged = /responses?\s+managed\s+off\s+linkedin/i.test(win);
    facts.easyApply = /\beasy apply\b/i.test(full);
    return facts;
  }

  /**
   * The text of the first leaf-ish element whose OWN trimmed text is EXACTLY a
   * short chip label (e.g. "Full-time", "On-site"). Reading the label off its
   * own element sidesteps the whitespace-free concatenation that a wide
   * textContent regex trips over, and the exact ^…$ match prevents false hits.
   */
  private findChipLabel(details: Element, label: RegExp): string | null {
    for (const el of Array.from(details.querySelectorAll("span, li, button, strong"))) {
      const t = this.cleanText(el.textContent ?? "");
      if (t.length <= 20 && label.test(t)) return t;
    }
    return null;
  }

  /**
   * Layout-independent title/company/location extracted from `document.title`.
   * LinkedIn sets the tab title to the selected job on EVERY jobs surface
   * (/jobs/view, /jobs/search, /jobs/search-results, /jobs/collections/*, …),
   * so this resolves fields even when a surface's top-card DOM classes differ
   * from every selector we know. Handles the two long-standing formats:
   *   • "Company hiring Job Title in Location | LinkedIn"  (logged-out / public)
   *   • "Job Title | Company | LinkedIn"  /  "Job Title - Company | LinkedIn"
   * A leading "(3) " unread-count badge and the trailing " | LinkedIn" are
   * stripped first. Only called once a hard job signal is present (see
   * `tryParse`), and generic page titles are rejected, so it can never turn a
   * non-job LinkedIn page into a phantom job.
   */
  private readDocumentTitleParts(document: Document): DocTitleParts {
    const empty: DocTitleParts = { title: null, company: null, location: null };
    const rawTitle = document.title ?? "";
    const stripped = rawTitle
      .replace(/^\(\d+\+?\)\s*/, "") // leading "(3) " / "(9+) " unread badge
      .replace(/\s*[|–-]\s*LinkedIn\s*$/i, "") // trailing " | LinkedIn"
      .trim();
    if (!stripped) return empty;

    const clean = (v: string): string | null => {
      const c = this.cleanText(v);
      return c && !GENERIC_LINKEDIN_TITLE.test(c) ? c : null;
    };

    // "Company hiring Job Title in Location"
    const hiring = /^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i.exec(stripped);
    if (hiring) {
      return {
        company: clean(hiring[1]),
        title: clean(hiring[2]),
        location: hiring[3] ? this.cleanText(hiring[3]) || null : null,
      };
    }

    // "Job Title | Company" / "Job Title – Company" / "Job Title - Company".
    // Split on `|`/`–` (optional surrounding space) OR a hyphen that has spaces
    // on BOTH sides — never a hyphen inside a word (e.g. "Front-End Engineer").
    const parts = stripped
      .split(/\s*[|–]\s*|\s+-\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return { title: clean(parts[0]), company: clean(parts[1]), location: null };
    }
    return { title: clean(stripped), company: null, location: null };
  }

  /**
   * DOM first here — deliberately the opposite priority from most other
   * fields on this parser. The visible top-card's own company-name anchor is
   * read fresh from the CURRENT page on every parse, so it's always
   * this specific job's own company link. `hiringOrganization.sameAs` in
   * LinkedIn's JobPosting JSON-LD turned out to be an unreliable signal for
   * this one field — often generic or repeated across postings even though
   * `hiringOrganization.name` (a different field, used for the company NAME)
   * stayed correct — which was silently storing the same company URL (and,
   * via the favicon fallback in readCompanyLogo, the same wrong logo) for
   * nearly every job regardless of which company actually posted it. `sameAs`
   * is now only a fallback for when the DOM has no link at all.
   */
  private readCompanyUrl(
    document: Document,
    jsonLd: JsonLdJobPosting | null,
    details: Element | null,
  ): string | null {
    // Details-pane company link first (obfuscated-class-proof). Normalize a
    // relative "/company/<slug>/…" href to an absolute LinkedIn company URL.
    if (details) {
      for (const a of Array.from(details.querySelectorAll('a[href*="/company/"]'))) {
        const t = this.cleanText(a.textContent ?? "");
        if (t && !/follower|^show more$|^see all/i.test(t)) {
          const href = a.getAttribute("href")?.trim();
          if (href) {
            const abs = href.startsWith("http")
              ? href
              : `https://www.linkedin.com${href.startsWith("/") ? "" : "/"}${href}`;
            // Canonicalize to the company root — drop a tab suffix (/life/,
            // /jobs/, /people/, …) and any query string.
            return abs.replace(/(\/company\/[^/?#]+)(?:\/[^?#]*)?.*$/i, "$1/");
          }
        }
      }
    }

    const domUrl = this.firstAttr(document, [...linkedInSelectors.companyName], "href");
    if (domUrl) return domUrl;

    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    if (typeof org?.sameAs === "string" && org.sameAs.trim()) return org.sameAs;

    return null;
  }

  /**
   * The company logo is read straight from the CURRENT job's top-card `<img>`
   * in the live DOM. LinkedIn serves it from media.licdn.com (…/company-logo_…)
   * and re-renders it for the selected job on every split-pane navigation, so
   * each parse captures THAT company's own `img.src` (via `src` → `data-src` →
   * other lazy-load attrs → `srcset`; placeholder/ghost images skipped). The
   * search is scoped to the `topCard` container so it can never pick up a
   * left-list item's logo, the global nav logo, or a previously-viewed job's
   * image — the reuse the previous fixes kept missing.
   *
   * Deliberately NO derived or page-level sources: `og:image` (a single stale
   * SPA `<meta>` tag), a favicon guessed from the company URL, and any
   * generated/fallback mark are all excluded — each produced the SAME image
   * for many companies. JSON-LD `hiringOrganization.logo` (a real per-company
   * URL, usually the same media.licdn.com asset) and the company-info panel
   * are the only non-top-card sources, tried only when the top card has no
   * logo `<img>` at all. Otherwise this returns `null` and the dashboard shows
   * a per-company initials avatar.
   */
  private readCompanyLogo(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    const topCard = document.querySelector(linkedInSelectors.topCard.join(", "));
    const domLogo =
      (topCard ? firstImageUrl(topCard, linkedInSelectors.companyLogo) : null) ??
      firstImageUrl(document, linkedInSelectors.companyLogoStrict);
    if (domLogo) return domLogo;

    const org = jsonLd?.hiringOrganization as Record<string, unknown> | undefined;
    const logo = org?.logo;
    if (typeof logo === "string" && !isPlaceholderImageUrl(logo)) return logo;
    if (
      logo &&
      typeof logo === "object" &&
      typeof (logo as Record<string, unknown>).url === "string" &&
      !isPlaceholderImageUrl((logo as Record<string, unknown>).url as string)
    ) {
      return (logo as Record<string, unknown>).url as string;
    }

    const companyPageLogo = firstImageUrl(document, linkedInSelectors.companyPageLogo);
    if (companyPageLogo) return companyPageLogo;

    return null;
  }

  private readLocationParts(jsonLd: JsonLdJobPosting | null): LocationParts {
    const place = jsonLd?.jobLocation as Record<string, unknown> | undefined;
    const address = place?.address as Record<string, unknown> | undefined;
    if (!address) return { location: null, city: null, state: null, country: null };

    const city =
      typeof address.addressLocality === "string"
        ? this.cleanText(address.addressLocality) || null
        : null;
    const region =
      typeof address.addressRegion === "string"
        ? this.cleanText(address.addressRegion) || null
        : null;
    const country =
      typeof address.addressCountry === "string"
        ? this.cleanText(address.addressCountry) || null
        : null;

    const parts = [city, region, country].filter((p): p is string => p !== null);
    const location = parts.length > 0 ? parts.join(", ") : null;

    return { location, city, state: region, country };
  }

  private readSalaryPeriod(jsonLd: JsonLdJobPosting | null): SalaryPeriod | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = salary?.value as Record<string, unknown> | undefined;
    const unit = value?.unitText;
    if (typeof unit !== "string") return null;
    return SALARY_UNIT_MAP[unit.toUpperCase()] ?? null;
  }

  private readExpiryDate(jsonLd: JsonLdJobPosting | null): string | null {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return null;
  }

  /**
   * "Meet the hiring team" cards, when present. Scoped to the hirer/poster
   * cards (not any `/in/` link on the page) and de-duplicated by name. Often
   * empty — LinkedIn only shows this to signed-in users on some layouts.
   */
  private readHiringTeam(document: Document): HiringTeamMember[] {
    const cards = Array.from(
      document.querySelectorAll(linkedInSelectors.hiringTeamCards.join(", ")),
    );
    const members: HiringTeamMember[] = [];
    const seen = new Set<string>();

    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>("a[href*='/in/']");
      const name =
        (link ? this.cleanText(link.textContent ?? "") : "") ||
        this.firstText(card, [...linkedInSelectors.hiringTeamName]) ||
        "";
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      members.push({ name, profileUrl: link?.getAttribute("href") ?? null, role: null });
    }

    return members;
  }

  /** Extracts a "…employees" company-size phrase from the About-the-company region. */
  private readCompanySize(document: Document): string | null {
    for (const selector of linkedInSelectors.companyInfo) {
      const text = document.querySelector(selector)?.textContent ?? "";
      const match = /([\d,]+(?:\s*[-–]\s*[\d,]+)?\+?\s*employees)/i.exec(text);
      if (match) return this.cleanText(match[1]);
    }
    return null;
  }

  /**
   * Layered resolution, most-structured/reliable source first: the "fit &
   * preferences" row's own labeled chip (highest priority — LinkedIn's most
   * current layout) → JSON-LD → the labeled criteria list (`Employment type:
   * Full-time`) → the top insight pills (segmented independently, not a
   * shared blob) → a last-resort regex over the raw criteria text. Every
   * layer below the first is a fallback for layouts where the fit &
   * preferences row isn't present.
   */
  private readEmploymentType(
    jsonLd: JsonLdJobPosting | null,
    fitPreferences: FitLevelPreferences,
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): EmploymentType | null {
    if (fitPreferences.employmentType) return fitPreferences.employmentType;

    const raw = jsonLd?.employmentType;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (typeof key === "string" && EMPLOYMENT_TYPE_MAP[key.toUpperCase()]) {
      return EMPLOYMENT_TYPE_MAP[key.toUpperCase()];
    }

    const fromCriteria = criteriaMap.get("employment type");
    if (fromCriteria) {
      for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
        if (pattern.test(fromCriteria)) return mapped;
      }
    }

    if (insightSegments.employmentType) return insightSegments.employmentType;

    for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
      if (pattern.test(criteriaText)) return mapped;
    }

    return null;
  }

  /** Same layering as `readEmploymentType`, minus JSON-LD (LinkedIn's `JobPosting` doesn't carry seniority). */
  private readExperienceLevel(
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): string | null {
    const fromCriteria = criteriaMap.get("seniority level");
    if (fromCriteria) return fromCriteria;

    if (insightSegments.experienceLevel) return insightSegments.experienceLevel;

    const match = /seniority level\s*:?\s*([a-z\s-]+)/i.exec(criteriaText);
    return match
      ? this.cleanText(match[1]).replace(/\s+(employment|type|industries).*/i, "")
      : null;
  }

  private readIndustry(criteriaMap: Map<string, string>): string | null {
    return criteriaMap.get("industries") ?? criteriaMap.get("industry") ?? null;
  }

  private readJobFunction(criteriaMap: Map<string, string>): string | null {
    return criteriaMap.get("job function") ?? criteriaMap.get("job functions") ?? null;
  }

  /**
   * Workplace type (Remote/Hybrid/Onsite) almost never appears in the
   * labeled criteria list — the "fit & preferences" row's own chip is
   * checked first, then the top insight pills, before falling back to a
   * blob-wide keyword scan.
   */
  private readWorkMode(
    fitPreferences: FitLevelPreferences,
    criteriaMap: Map<string, string>,
    insightSegments: JobInsightSegments,
    criteriaText: string,
  ): WorkMode | null {
    if (fitPreferences.workMode) return fitPreferences.workMode;

    const fromCriteria = criteriaMap.get("workplace type");
    if (fromCriteria) {
      for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
        if (pattern.test(fromCriteria)) return mode;
      }
    }

    if (insightSegments.workMode) return insightSegments.workMode;

    for (const [pattern, mode] of WORK_MODE_KEYWORDS) {
      if (pattern.test(criteriaText)) return mode;
    }

    return null;
  }

  private readSalary(jsonLd: JsonLdJobPosting | null, key: "minValue" | "maxValue"): number | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    const value = salary?.value as Record<string, unknown> | undefined;
    const raw = value?.[key];
    return typeof raw === "number" ? raw : null;
  }

  private readSalaryCurrency(jsonLd: JsonLdJobPosting | null): string | null {
    const salary = jsonLd?.baseSalary as Record<string, unknown> | undefined;
    return typeof salary?.currency === "string" ? salary.currency : null;
  }

  private readSkills(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.skillItems);
  }

  private readHiringInsights(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.hiringInsights);
  }

  private readBenefits(document: Document): string[] {
    return this.readTextList(document, linkedInSelectors.benefits);
  }

  private readTextList(document: Document, selectors: readonly string[]): string[] {
    const nodes = Array.from(document.querySelectorAll(selectors.join(", ")));
    const values = nodes
      .map((node) => this.cleanText(node.textContent ?? ""))
      .filter((text) => text.length > 0);
    return Array.from(new Set(values));
  }

  private readEasyApply(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.easyApplyButton.join(", "))) return true;
    return /easy apply/i.test(document.body?.innerText ?? "");
  }

  private readPromoted(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.promotedIndicator.join(", "))) return true;
    const primaryText =
      this.firstText(document, [...linkedInSelectors.primaryDescriptionContainer]) ?? "";
    return /\bpromoted\b/i.test(primaryText);
  }

  private readReposted(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.repostedIndicator.join(", "))) return true;
    const primaryText =
      this.firstText(document, [...linkedInSelectors.primaryDescriptionContainer]) ?? "";
    return /\breposted\b/i.test(primaryText);
  }

  private readResponsesManaged(document: Document): boolean {
    if (document.querySelector(linkedInSelectors.responsesManagedIndicator.join(", "))) {
      return true;
    }
    return /responses?\s+(are\s+)?managed\s+(off|outside)\s+linkedin/i.test(
      document.body?.innerText ?? "",
    );
  }

  private readPostedAt(document: Document, jsonLd: JsonLdJobPosting | null): string | null {
    if (typeof jsonLd?.datePosted === "string") {
      const parsed = new Date(jsonLd.datePosted);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    for (const selector of linkedInSelectors.postedTime) {
      const el = document.querySelector(selector);
      const datetime = el?.getAttribute("datetime");
      if (datetime) {
        const parsed = new Date(datetime);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
    }

    return null;
  }

  private readDescription(document: Document, jsonLd: JsonLdJobPosting | null): DescriptionParts {
    if (typeof jsonLd?.description === "string" && jsonLd.description.trim()) {
      return {
        text: this.htmlToText(jsonLd.description),
        html: sanitizeDescriptionHtml(jsonLd.description),
      };
    }

    for (const selector of linkedInSelectors.description) {
      const el = document.querySelector(selector);
      if (el?.innerHTML && el.innerHTML.trim()) {
        return {
          text: this.cleanText(el.textContent ?? ""),
          html: sanitizeDescriptionHtml(el.innerHTML),
        };
      }
    }

    return { text: null, html: null };
  }

  private readApplyUrl(document: Document): string | null {
    return this.firstAttr(document, [...linkedInSelectors.applyLink], "href");
  }

  private readSourceJobId(
    document: Document,
    url: string,
    jsonLd: JsonLdJobPosting | null,
  ): string | null {
    const fromUrl = extractLinkedInJobIdFromUrl(url);
    if (fromUrl) return fromUrl;

    const identifier = jsonLd?.identifier as Record<string, unknown> | undefined;
    if (typeof identifier?.value === "string" && /^\d+$/.test(identifier.value)) {
      return identifier.value;
    }

    // DOM last resort — scoped to the job-details region first so it reads THIS
    // job's id, never a left-list card's `[data-job-id]`. Only falls back to a
    // document-wide read when no details container is found.
    const detailsRoot =
      document.querySelector(linkedInSelectors.topCard.join(", ")) ??
      document.querySelector(".jobs-details, .scaffold-layout__detail");
    const dataJobId = (detailsRoot ?? document)
      .querySelector("[data-job-id]")
      ?.getAttribute("data-job-id");
    if (dataJobId && /^\d+$/.test(dataJobId)) return dataJobId;

    return null;
  }

  private readCriteriaText(document: Document): string {
    return Array.from(document.querySelectorAll(linkedInSelectors.criteriaItems.join(", ")))
      .map((node) => node.textContent ?? "")
      .join(" ");
  }

  private readIsClosed(document: Document, jsonLd: JsonLdJobPosting | null): boolean {
    const validThrough = jsonLd?.validThrough;
    if (typeof validThrough === "string") {
      const parsed = new Date(validThrough);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now()) return true;
    }

    const bodyText = document.body?.innerText?.toLowerCase() ?? "";
    return CLOSED_JOB_PHRASES.some((phrase) => bodyText.includes(phrase));
  }

  private stableUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }
}
