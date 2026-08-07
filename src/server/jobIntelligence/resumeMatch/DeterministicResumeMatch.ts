// ── Module 10A: Deterministic Resume Match engine ──
//
// Score a parsed resume against a parsed job using ONLY the two already-
// parsed structures — no AI/LLM call, no paid API, fully offline and
// deterministic (same inputs always produce the same output). Distinct from
// the AI-based Resume Match (Module 6B/6E, src/server/ai/ResumeMatchService.ts)
// — that one is a paid, per-analysis AI capability with its own credit/cache
// machinery; this one is free, instant, and meant to run at catalog scale
// (e.g. ranking every crawled job against a resume) where an LLM call per
// pair would be both too slow and too expensive.

import type { StructuredResume } from "@/features/ai/schemas";

export type DeterministicMatchInput = {
  /** Explicit skill list (e.g. a resume's "Skills" section, or a job's job_skills). */
  resumeSkills: string[];
  /** Free text to search for keyword/skill mentions beyond the explicit list (e.g. experience bullets). */
  resumeText: string;
  jobSkills: string[];
  /** Free text to mine job keywords from (requirements + preferred qualifications + technologies + description). */
  jobKeywordText: string;
};

export type DeterministicMatchResult = {
  /** 0–100, rounded. */
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedKeywords: string[];
};

const GENERIC_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "of",
  "to",
  "in",
  "at",
  "with",
  "or",
  "a",
  "an",
  "is",
  "are",
  "will",
  "you",
  "we",
  "our",
  "your",
  "have",
  "has",
  "be",
  "as",
  "on",
  "this",
  "that",
  "role",
  "job",
  "team",
  "work",
  "years",
  "year",
  "experience",
  "strong",
  "ability",
  "skills",
  "including",
  "etc",
]);

/** Lowercase + trim, keep +/#/. so multi-symbol tech names ("C++", "C#", "Node.js") survive comparison. */
function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#.\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordBoundaryIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // Multi-word or symbol-bearing needles ("node.js", "machine learning") use
  // a plain substring test — a \b boundary around "." or "+" doesn't behave
  // usefully. Single alphanumeric words get a real word-boundary match so
  // "go" doesn't false-positive inside "going".
  if (/^[a-z0-9]+$/.test(needle)) {
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
  }
  return haystack.includes(needle);
}

function extractKeywords(text: string, limit = 40): string[] {
  const seen = new Set<string>();
  for (const raw of normalizeToken(text).split(/[^a-z0-9+#.]+/)) {
    if (raw.length < 3 || GENERIC_STOPWORDS.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/**
 * Core scoring function — pure, no I/O. Skill coverage is weighted 70%,
 * keyword coverage 30% (skills are the stronger, more deliberate signal on
 * both sides); a dimension with no data on the job side is simply excluded
 * from the weighted average rather than counted as 0.
 */
export function computeDeterministicResumeMatch(
  input: DeterministicMatchInput,
): DeterministicMatchResult {
  const resumeSkillSet = new Set(input.resumeSkills.map(normalizeToken).filter(Boolean));
  const resumeText = normalizeToken(input.resumeText);

  const jobSkillsNormalized = [...new Set(input.jobSkills.map(normalizeToken).filter(Boolean))];
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of jobSkillsNormalized) {
    const inSkillList = resumeSkillSet.has(skill);
    const inResumeText = wordBoundaryIncludes(resumeText, skill);
    if (inSkillList || inResumeText) matchedSkills.push(skill);
    else missingSkills.push(skill);
  }

  const jobKeywords = extractKeywords(input.jobKeywordText);
  const matchedKeywords = jobKeywords.filter(
    (kw) => resumeSkillSet.has(kw) || wordBoundaryIncludes(resumeText, kw),
  );

  const skillCoverage =
    jobSkillsNormalized.length > 0 ? matchedSkills.length / jobSkillsNormalized.length : null;
  const keywordCoverage =
    jobKeywords.length > 0 ? matchedKeywords.length / jobKeywords.length : null;

  let score: number;
  if (skillCoverage != null && keywordCoverage != null) {
    score = skillCoverage * 0.7 + keywordCoverage * 0.3;
  } else if (skillCoverage != null) {
    score = skillCoverage;
  } else if (keywordCoverage != null) {
    score = keywordCoverage;
  } else {
    score = 0;
  }

  return {
    matchPercentage: Math.round(Math.max(0, Math.min(1, score)) * 100),
    matchedSkills,
    missingSkills,
    matchedKeywords,
  };
}

export type DeterministicJobInput = {
  skills?: string[] | null;
  requirements?: string[] | null;
  preferredQualifications?: string[] | null;
  technologies?: string[] | null;
  description?: string | null;
};

/**
 * Convenience wrapper that aggregates a parsed `StructuredResume` (Module
 * 6A's deterministic resume parser output) and a parsed job's fields into
 * `DeterministicMatchInput`, then scores them. This is the entry point most
 * callers want; `computeDeterministicResumeMatch` stays exported for callers
 * that already have flat skill/text lists (e.g. tests, or a future bulk
 * "rank every job against this resume" job).
 */
export function matchResumeToJob(
  resume: StructuredResume,
  job: DeterministicJobInput,
): DeterministicMatchResult {
  const resumeText = [resume.summary ?? "", ...resume.sections.map((s) => s.content)].join("\n");

  const jobKeywordText = [
    ...(job.requirements ?? []),
    ...(job.preferredQualifications ?? []),
    ...(job.technologies ?? []),
    job.description ?? "",
  ].join("\n");

  return computeDeterministicResumeMatch({
    resumeSkills: resume.skills,
    resumeText,
    jobSkills: job.skills ?? [],
    jobKeywordText,
  });
}
