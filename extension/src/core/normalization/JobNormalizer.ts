import type { EmploymentType, SalaryPeriod, UniversalJob, WorkMode } from "../parsers/types";

const WORK_MODES: readonly WorkMode[] = ["Remote", "Hybrid", "Onsite"];
const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "Full-Time",
  "Part-Time",
  "Contract",
  "Internship",
  "Temporary",
  "Freelance",
];
const SALARY_PERIODS: readonly SalaryPeriod[] = ["Hourly", "Daily", "Weekly", "Monthly", "Yearly"];

const SALARY_PERIOD_SUFFIX: Record<SalaryPeriod, string> = {
  Hourly: "/hr",
  Daily: "/day",
  Weekly: "/wk",
  Monthly: "/mo",
  Yearly: "/yr",
};

/**
 * The pipeline's normalization stage: **Parser → Normalizer → Validator**.
 *
 * Takes a parser's raw extraction and returns a cleaned `UniversalJob` with a
 * consistent shape: trimmed strings, canonical enums, de-duplicated lists,
 * `remote` derived from `workMode`, a synthesized salary display string, and —
 * critically — a `parserConfidence` COMPUTED from extraction completeness plus
 * human-readable `extractionWarnings`. Parsers never do any of this; a single
 * implementation here keeps every source (and the future generic/manual
 * importer) consistent.
 *
 * Pure and synchronous — no DOM, no I/O. Behaviour-preserving for every field
 * the LinkedIn parser already populated.
 */
export class JobNormalizer {
  static normalize(job: UniversalJob): UniversalJob {
    const workMode = this.coerceEnum(job.workMode, WORK_MODES);
    const employmentType = this.coerceEnum(job.employmentType, EMPLOYMENT_TYPES);
    const salaryPeriod = this.coerceEnum(job.salaryPeriod, SALARY_PERIODS);

    const { salaryMin, salaryMax } = this.normalizeSalaryRange(job.salaryMin, job.salaryMax);
    const salaryCurrency = this.cleanStr(job.salaryCurrency);

    const hiringTeam = job.hiringTeam
      .map((member) => ({
        name: this.collapse(member.name),
        profileUrl: this.cleanStr(member.profileUrl),
        role: this.cleanStr(member.role),
      }))
      .filter((member) => member.name.length > 0);

    // Promote the first hiring-team member to the flat recruiter fields when the
    // parser didn't set them explicitly — same data, just surfaced.
    const recruiterName = this.cleanStr(job.recruiterName) ?? hiringTeam[0]?.name ?? null;
    const recruiterProfile =
      this.cleanStr(job.recruiterProfile) ?? hiringTeam[0]?.profileUrl ?? null;

    const normalized: UniversalJob = {
      ...job,
      title: this.collapse(job.title),
      companyName: this.collapse(job.companyName),
      companyLogoUrl: this.cleanStr(job.companyLogoUrl),
      companyUrl: this.cleanStr(job.companyUrl),
      companyCareerUrl: this.cleanStr(job.companyCareerUrl),
      location: this.cleanStr(job.location),
      city: this.cleanStr(job.city),
      state: this.cleanStr(job.state),
      country: this.cleanStr(job.country),
      workMode,
      remote: workMode === "Remote",
      employmentType,
      experienceLevel: this.cleanStr(job.experienceLevel),
      department: this.cleanStr(job.department),
      jobFunction: this.cleanStr(job.jobFunction),
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      salaryText:
        this.cleanStr(job.salaryText) ??
        this.formatSalary(salaryMin, salaryMax, salaryCurrency, salaryPeriod),
      description: this.cleanStr(job.description),
      descriptionHtml: this.cleanStr(job.descriptionHtml),
      responsibilities: this.cleanList(job.responsibilities),
      requirements: this.cleanList(job.requirements),
      preferredQualifications: this.cleanList(job.preferredQualifications),
      benefits: this.cleanList(job.benefits),
      skills: this.cleanList(job.skills),
      technologies: this.cleanList(job.technologies),
      languages: this.cleanList(job.languages),
      postedAgo: this.cleanStr(job.postedAgo),
      hiringTeam,
      recruiterName,
      recruiterProfile,
      companySize: this.cleanStr(job.companySize),
      industry: this.cleanStr(job.industry),
      hiringInsights: this.cleanList(job.hiringInsights),
      applyUrl: this.cleanStr(job.applyUrl),
      extractionWarnings: this.cleanList(job.extractionWarnings),
    };

    normalized.extractionWarnings = this.mergeWarnings(
      normalized.extractionWarnings,
      this.deriveWarnings(normalized),
    );
    normalized.parserConfidence = this.computeConfidence(normalized);

    return normalized;
  }

  // ── String / list helpers ───────────────────────────────────────────────

  private static collapse(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  /** Trim + collapse whitespace; empty becomes `null`. */
  private static cleanStr(value: string | null | undefined): string | null {
    if (value == null) return null;
    const cleaned = this.collapse(value);
    return cleaned.length > 0 ? cleaned : null;
  }

  /** Trim entries, drop empties, de-duplicate case-insensitively (first wins). */
  private static cleanList(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
      const cleaned = this.collapse(raw);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
    }
    return out;
  }

  private static coerceEnum<T extends string>(
    value: string | null,
    allowed: readonly T[],
  ): T | null {
    if (value == null) return null;
    return (allowed as readonly string[]).includes(value) ? (value as T) : null;
  }

  // ── Salary ──────────────────────────────────────────────────────────────

  private static normalizeSalaryRange(
    min: number | null,
    max: number | null,
  ): { salaryMin: number | null; salaryMax: number | null } {
    const clean = (n: number | null): number | null =>
      typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;

    let lo = clean(min);
    let hi = clean(max);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    return { salaryMin: lo, salaryMax: hi };
  }

  private static formatSalary(
    min: number | null,
    max: number | null,
    currency: string | null,
    period: SalaryPeriod | null,
  ): string | null {
    if (min === null && max === null) return null;

    const prefix = currency ? `${currency} ` : "";
    const suffix = period ? SALARY_PERIOD_SUFFIX[period] : "";
    const fmt = (n: number) => n.toLocaleString("en-US");

    let range: string;
    if (min !== null && max !== null) {
      range = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
    } else {
      range = fmt((min ?? max) as number);
    }
    return `${prefix}${range}${suffix}`.trim();
  }

  // ── Warnings + confidence ────────────────────────────────────────────────

  private static mergeWarnings(existing: string[], derived: string[]): string[] {
    return this.cleanList([...existing, ...derived]);
  }

  /** Human-readable notes for the important fields that came back empty. */
  private static deriveWarnings(job: UniversalJob): string[] {
    const warnings: string[] = [];
    if (!job.description) warnings.push("missing description");
    if (!job.location && !job.city && !job.country) warnings.push("missing location");
    if (!job.workMode) warnings.push("missing work mode");
    if (!job.employmentType) warnings.push("missing employment type");
    if (job.salaryMin === null && job.salaryMax === null && !job.salaryText) {
      warnings.push("missing salary");
    }
    if (!job.postedAt) warnings.push("missing posted date");
    if (!job.sourceJobId) warnings.push("no external id (will dedupe by fingerprint)");
    return warnings;
  }

  /**
   * Confidence = fraction of important fields successfully extracted, in
   * [0, 1]. Title/company/sourceUrl are required elsewhere so they don't count.
   * A dedicated parser that fills many of these scores high; a sparse
   * generic/manual extraction scores low — exactly the signal Module 4B's
   * generic parser will lean on.
   */
  private static computeConfidence(job: UniversalJob): number {
    const signals: boolean[] = [
      Boolean(job.description),
      Boolean(job.descriptionHtml),
      Boolean(job.location),
      Boolean(job.city || job.country),
      Boolean(job.workMode),
      Boolean(job.employmentType),
      Boolean(job.experienceLevel),
      job.salaryMin !== null || job.salaryMax !== null || Boolean(job.salaryText),
      job.skills.length > 0,
      job.technologies.length > 0 || job.languages.length > 0,
      Boolean(job.postedAt),
      job.applicantCount !== null,
      Boolean(job.companyLogoUrl),
      Boolean(job.companyUrl || job.companyCareerUrl),
      Boolean(job.industry),
      Boolean(job.jobFunction),
      Boolean(job.sourceJobId),
      Boolean(job.recruiterName) || job.hiringTeam.length > 0,
      Boolean(job.companySize),
      job.benefits.length > 0 || job.responsibilities.length > 0 || job.requirements.length > 0,
    ];

    const hits = signals.filter(Boolean).length;
    return Math.round((hits / signals.length) * 100) / 100;
  }
}
