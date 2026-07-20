import { SupportedSite } from "../../site-detection/types";
import { BaseParser } from "../BaseParser";
// Generic, security-critical HTML rebuilder — reused, not duplicated per board.
import { sanitizeDescriptionHtml } from "../linkedin/sanitize";
import { classifyEmploymentTypeText } from "../shared/employmentType";
import { parseSalary } from "../shared/salary";
import { extractListAfterHeading } from "../shared/sections";
import { createUniversalJob } from "../types";
import type { EmploymentType, ParserContext, UniversalJob, WorkMode } from "../types";
import {
  buildIndeedCanonicalUrl,
  extractIndeedJobIdFromUrl,
  isIndeedJobId,
  normalizeIndeedSalaryText,
} from "./indeed.shared";
import { INDEED_CLOSED_PHRASES, indeedSelectors } from "./indeed.selectors";

/** Bumped when this parser's extraction logic changes materially. */
const INDEED_PARSER_VERSION = "indeed-detail-1";

type DescriptionParts = { text: string | null; html: string | null };

/**
 * Production Indeed job parser. Indeed's homepage/search/company pages carry NO
 * `JobPosting` JSON-LD (only WebSite/BreadcrumbList), so extraction is DOM-based
 * (like Wellfound). A job is rendered in one of two server-rendered shells,
 * reached by the four supported URL forms:
 *
 *   • the VIEWJOB pane (`?vjk=<id>`, `?from=gnav-homepage&vjk=<id>`) — parsed
 *     from the stable `jobsearch-JobInfoHeader-title` / `inlineHeader-*` /
 *     `salaryInfoAndJobType` / `jobDescriptionText` nodes; and
 *   • the company JOB-DETAIL section (`/cmp/<Company>/jobs?jk=<id>`) — parsed
 *     from `#acme-webapp-job-details-section`'s `jobDetail*` testids.
 *
 * `tryParse` detects which shell is present and dispatches; both derive the
 * SAME `sourceJobId` (the `vjk`/`jk` job key) and canonical `sourceUrl`
 * (`https://<host>/viewjob?jk=<id>`), so every URL form dedupes to one Global
 * Job (and enriches the row an `IndeedListingParser` card already seeded).
 *
 * On the bare listing/homepage URL (no `vjk`/`jk`) the content script takes the
 * listing-capture branch instead — `IndeedListingParser.matches()` returns true
 * only there and false whenever a job key is in the URL — so a job that is only
 * auto-previewed in the pane is never presented as "the job the user opened".
 */
export class IndeedParser extends BaseParser {
  tryParse(context: ParserContext): UniversalJob | null {
    const { document, url } = context;

    const companyContainer = document.querySelector(indeedSelectors.company.container);
    if (companyContainer) return this.parseCompany(companyContainer, document, url);

    const viewjobTitle = document.querySelector(indeedSelectors.viewjob.title);
    if (viewjobTitle) return this.parseViewjob(document, url);

    // No open job on this page (bare homepage/search with no selected job).
    return null;
  }

  // ── VIEWJOB pane (`?vjk=…`) ────────────────────────────────────────────────

  private parseViewjob(document: Document, url: string): UniversalJob | null {
    // URL-authoritative: on the homepage/search SPA the viewjob pane is a job
    // the user actually opened ONLY when its key is in the URL (`?vjk=`). The
    // bare listing URL auto-previews an arbitrary job in the same pane, so
    // reading the pane's own apply-widget id there would present a job the user
    // never chose — hence the URL id, not the DOM, gates this layout.
    const jobId = extractIndeedJobIdFromUrl(url);
    if (!jobId) return null;

    const title = this.readViewjobTitle(document);
    const companyName = this.firstText(document, [indeedSelectors.viewjob.companyName]);

    if (!title || !companyName) {
      // Key is in the URL but the pane hasn't hydrated yet — re-runs on the next
      // DOM mutation (see `watchForNavigation` in the content script).
      return null;
    }

    const locationText = this.firstText(document, [indeedSelectors.viewjob.location]);
    const salaryRaw = this.firstText(document, [indeedSelectors.viewjob.salaryAndJobType]);
    const salary = parseSalary(normalizeIndeedSalaryText(salaryRaw));
    const { text: description, html: descriptionHtml } = this.readDescription(
      document,
      indeedSelectors.viewjob.description,
    );
    const sections = this.readDescriptionSections(descriptionHtml);
    const sourceUrl = buildIndeedCanonicalUrl(jobId, url);

    return createUniversalJob({
      source: SupportedSite.Indeed,
      parserVersion: INDEED_PARSER_VERSION,
      sourceJobId: jobId,
      title,
      companyName,
      companyUrl: this.firstAttr(document, [indeedSelectors.viewjob.companyLink], "href"),
      location: locationText,
      city: this.isRemote(locationText) ? null : locationText,
      workMode: this.readWorkMode(locationText),
      employmentType: this.readEmploymentType(salaryRaw, document),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      responsibilities: sections.responsibilities,
      requirements: sections.requirements,
      preferredQualifications: sections.preferredQualifications,
      benefits: this.readBenefits(document),
      easyApply: !!document.querySelector(indeedSelectors.applyJk),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(document.querySelector(indeedSelectors.viewjob.detailRoot)),
    });
  }

  /** `<h2 data-testid="jobsearch-JobInfoHeader-title">Product Manager<span> - job post</span></h2>` → strip the " - job post" suffix. */
  private readViewjobTitle(document: Document): string | null {
    const raw = this.firstText(document, [indeedSelectors.viewjob.title]);
    if (!raw) return null;
    return this.cleanText(raw.replace(/\s*-\s*job post\s*$/i, "")) || null;
  }

  // ── Company JOB-DETAIL section (`/cmp/<Company>/jobs?jk=…`) ─────────────────

  private parseCompany(root: Element, document: Document, url: string): UniversalJob | null {
    const title = this.firstText(root, [indeedSelectors.company.title]);
    const subtitle = this.firstText(root, [indeedSelectors.company.subtitle]);
    const { company, location } = this.splitCompanySubtitle(subtitle);
    const jobId = this.resolveJobId(document, url);

    if (!title || !company || !jobId) {
      return null;
    }

    const salaryRaw = this.readCompanySalary(root);
    const salary = parseSalary(normalizeIndeedSalaryText(salaryRaw));
    const { text: description, html: descriptionHtml } = this.readDescription(
      root,
      indeedSelectors.company.description,
    );
    const sections = this.readDescriptionSections(descriptionHtml);
    const sourceUrl = buildIndeedCanonicalUrl(jobId, url);

    return createUniversalJob({
      source: SupportedSite.Indeed,
      parserVersion: INDEED_PARSER_VERSION,
      sourceJobId: jobId,
      title,
      companyName: company,
      location,
      city: this.isRemote(location) ? null : location,
      workMode: this.readWorkMode(location),
      employmentType: this.readEmploymentType(salaryRaw, root),
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryPeriod: salary.salaryPeriod,
      salaryText: salary.salaryText,
      description,
      descriptionHtml,
      responsibilities: sections.responsibilities,
      requirements: sections.requirements,
      preferredQualifications: sections.preferredQualifications,
      easyApply: !!root.querySelector(indeedSelectors.applyJk),
      applyUrl: sourceUrl,
      sourceUrl,
      isClosed: this.readIsClosed(root),
    });
  }

  /** The company subtitle is "<Company> - <Location>" (e.g. "CuringBusy - Remote"). */
  private splitCompanySubtitle(subtitle: string | null): {
    company: string | null;
    location: string | null;
  } {
    if (!subtitle) return { company: null, location: null };
    const match = /^(.*?)\s+-\s+(.*)$/.exec(subtitle);
    if (match) {
      return {
        company: this.cleanText(match[1]) || null,
        location: this.cleanText(match[2]) || null,
      };
    }
    return { company: subtitle, location: null };
  }

  /** Salary sits in a `<span>` beside the title/subtitle in the company head — matched by its currency/period text, not a hashed class. */
  private readCompanySalary(root: Element): string | null {
    const titleEl = root.querySelector(indeedSelectors.company.title);
    const scope = titleEl?.parentElement ?? root;
    for (const span of Array.from(scope.querySelectorAll("span"))) {
      const text = this.cleanText(span.textContent ?? "");
      if (text && this.looksLikeSalary(text)) return text;
    }
    return null;
  }

  private looksLikeSalary(text: string): boolean {
    return /[₹$€£]/.test(text) || /\ban?\s+(year|month|week|day|hour)\b/i.test(text);
  }

  // ── Shared readers ─────────────────────────────────────────────────────────

  private readDescription(root: ParentNode, selector: string): DescriptionParts {
    const el = root.querySelector(selector);
    if (!el?.innerHTML?.trim()) return { text: null, html: null };
    return {
      text: this.cleanText(el.textContent ?? "") || null,
      html: sanitizeDescriptionHtml(el.innerHTML),
    };
  }

  /** Recovers responsibility/requirement/preferred-qualification lists from the sanitized description. */
  private readDescriptionSections(html: string | null): {
    responsibilities: string[];
    requirements: string[];
    preferredQualifications: string[];
  } {
    if (!html) return { responsibilities: [], requirements: [], preferredQualifications: [] };
    const container = document.createElement("div");
    container.innerHTML = html;
    return {
      responsibilities: extractListAfterHeading(
        container,
        /responsibilit|what you.?ll (?:be )?do|key duties|role overview/i,
      ),
      requirements: extractListAfterHeading(
        container,
        /requirement|what you.?ll need|qualification|who you are|must have/i,
      ),
      preferredQualifications: extractListAfterHeading(
        container,
        /nice to have|preferred|bonus|good to have/i,
      ),
    };
  }

  /** The "Benefits" block Indeed pulls from the description (`#benefits ul li`). */
  private readBenefits(document: Document): string[] {
    const items = Array.from(document.querySelectorAll(indeedSelectors.viewjob.benefitsItems));
    const values = items
      .map((li) => this.cleanText(li.textContent ?? ""))
      .filter((text) => text.length > 0);
    return Array.from(new Set(values));
  }

  /**
   * Employment type from the `#salaryInfoAndJobType` text first (it often carries
   * "Full-time"), then the structured "Job type" attribute group's tiles
   * (`data-testid="<Value>-tile"`). Left `null` when Indeed reports a value
   * outside the `UniversalJob` enum (e.g. "Permanent") — never fabricated.
   */
  private readEmploymentType(salaryText: string | null, scope: ParentNode): EmploymentType | null {
    const fromSalaryRow = classifyEmploymentTypeText(salaryText);
    if (fromSalaryRow) return fromSalaryRow;

    const groups = Array.from(scope.querySelectorAll(indeedSelectors.viewjob.attributeGroup));
    const jobTypeGroup = groups.find((g) =>
      /^job type$/i.test((g.getAttribute("aria-label") ?? "").trim()),
    );
    if (!jobTypeGroup) return null;

    const tiles = Array.from(jobTypeGroup.querySelectorAll(indeedSelectors.viewjob.attributeTile));
    for (const tile of tiles) {
      const value =
        tile.getAttribute("data-testid")?.replace(/-tile$/, "") ??
        this.cleanText(tile.textContent ?? "");
      const mapped = classifyEmploymentTypeText(value);
      if (mapped) return mapped;
    }
    return null;
  }

  private readWorkMode(locationText: string | null): WorkMode | null {
    if (!locationText) return null;
    if (/hybrid/i.test(locationText)) return "Hybrid";
    if (/\bremote\b/i.test(locationText)) return "Remote";
    return null;
  }

  private isRemote(locationText: string | null): boolean {
    return !!locationText && /^remote$/i.test(this.cleanText(locationText));
  }

  /**
   * Job key resolution: the `vjk`/`jk` URL param (authoritative), falling back
   * to the `data-indeed-apply-jk` attribute on the "Apply with Indeed" widget
   * (present in both shells) so a soft-navigated pane whose URL hasn't updated
   * still resolves an id.
   */
  private resolveJobId(document: Document, url: string): string | null {
    const fromUrl = extractIndeedJobIdFromUrl(url);
    if (fromUrl) return fromUrl;

    const fromDom = document
      .querySelector(indeedSelectors.applyJk)
      ?.getAttribute("data-indeed-apply-jk")
      ?.toLowerCase();
    return isIndeedJobId(fromDom) ? fromDom : null;
  }

  /**
   * Closed/expired detection, scoped to the job-detail container and read from
   * a script/style-stripped clone. Indeed embeds an i18n dictionary containing
   * the literal string "this job has expired on indeed" inside a page-level
   * `<script>` on EVERY page, so scanning `document.body` text (or any text
   * that includes script content) would report every open job as closed — this
   * reads only the rendered detail region instead.
   */
  private readIsClosed(scope: Element | null): boolean {
    if (!scope) return false;
    const clone = scope.cloneNode(true) as Element;
    clone.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());
    const text = this.cleanText(clone.textContent ?? "").toLowerCase();
    return INDEED_CLOSED_PHRASES.some((phrase) => text.includes(phrase));
  }
}
