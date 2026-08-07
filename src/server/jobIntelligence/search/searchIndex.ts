// ── Module 10A: Search index strategy (no UI — see the module's scope note) ──
//
// Defines WHICH fields a job posting is searchable by and builds the
// flattened document those fields produce. This is the field list the DB
// `global_jobs.search_vector` generated column (see the Module 10A
// migration) mirrors — role/normalized_role weighted highest, company/
// normalized_company/tags next, location/employment/experience next,
// description last. Kept here as a pure, unit-testable function so the
// weighting/field-list contract has one definition a test can pin down,
// independent of whatever query surface (SQL full-text search today, a
// dedicated search service later) eventually reads it.

import type { NormalizedJobPosting } from "../types";

export type SearchIndexDocument = {
  jobId: string;
  normalizedRole: string;
  originalRole: string;
  company: string;
  normalizedCompany: string;
  skills: string[];
  description: string;
  tags: string[];
  location: string;
  employmentType: string;
  experienceLevel: string;
  /** Flattened, lowercased, deduplicated token bag — a naive substring/token search can run directly against this. */
  searchText: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length >= 2);
}

export function buildSearchIndexDocument(
  jobId: string,
  job: NormalizedJobPosting,
): SearchIndexDocument {
  const skills = [...(job.skills ?? []), ...(job.technologies ?? [])];
  const tags = job.tags ?? [];
  const location = [job.city, job.state, job.country, job.location].filter(Boolean).join(" ");
  const description = job.description ?? "";
  const employmentType = job.employmentType ?? "";
  const experienceLevel = job.experienceLevel ?? "";

  const fields = [
    job.normalizedRole,
    job.role,
    job.companyName,
    job.normalizedCompany,
    skills.join(" "),
    tags.join(" "),
    location,
    employmentType,
    experienceLevel,
    description,
  ];

  const tokens = new Set<string>();
  for (const field of fields) {
    for (const token of tokenize(field)) tokens.add(token);
  }

  return {
    jobId,
    normalizedRole: job.normalizedRole,
    originalRole: job.role,
    company: job.companyName,
    normalizedCompany: job.normalizedCompany,
    skills,
    description,
    tags,
    location,
    employmentType,
    experienceLevel,
    searchText: [...tokens].join(" "),
  };
}
