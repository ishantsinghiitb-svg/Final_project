import type { GlobalJob, SavedJob, Skill, PaginationParams, PaginatedResult } from "@/types";
import type { JobFilters, JobSort } from "@/features/jobs/types";
import { DEFAULT_JOB_SORT, DEFAULT_PAGINATION } from "@/features/jobs/constants";
import { normalizeFilters } from "@/features/jobs/filter-maps";
import { JobRepository } from "@/repositories/JobRepository";

// Single repository instance — no state, safe to reuse across requests.
const jobRepo = new JobRepository();

/**
 * JobService
 *
 * Owns all business logic for the Global Jobs Engine:
 *   - input normalisation (trim, lowercase where needed)
 *   - filter composition rules (e.g. remote implies workMode = remote)
 *   - pagination boundary enforcement
 *
 * Repositories are responsible only for database access.
 * Callers (React Query hooks) receive plain data or thrown errors.
 */
export class JobService {
  // ── Listings ──────────────────────────────────────────────────────────────

  async getJobs(
    filters: JobFilters = {},
    sort: JobSort = DEFAULT_JOB_SORT,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<PaginatedResult<GlobalJob>> {
    // Step 1: Trim free-text fields so the repository doesn't see padding
    const trimmed: JobFilters = {
      ...filters,
      q:        filters.q?.trim()        || undefined,
      company:  filters.company?.trim()  || undefined,
      role:     filters.role?.trim()     || undefined,
      location: filters.location?.trim() || undefined,
    };

    // Step 2: Map URL slugs → exact DB column values.
    //   The URL stores "full-time", "entry-level", "onsite", etc.
    //   The DB stores  "Full-Time", "Entry-Level", "Onsite", etc.
    //   Without this step, Supabase's .in() filter returns zero rows.
    const normalized = normalizeFilters(trimmed);

    return jobRepo.findAll(normalized, sort, pagination);
  }


  async getJob(id: string): Promise<GlobalJob | null> {
    return jobRepo.findById(id);
  }

  /** Batch fetch by id — used by CollectionService to hydrate a collection's job_ids. */
  async getJobsByIds(ids: string[]): Promise<GlobalJob[]> {
    return jobRepo.findByIds(ids);
  }

  // ── Recently Viewed ──────────────────────────────────────────────────────

  async recordJobView(userId: string, jobId: string): Promise<void> {
    return jobRepo.recordJobView(userId, jobId);
  }

  async getRecentlyViewedJobs(userId: string, limit: number = 10): Promise<GlobalJob[]> {
    return jobRepo.findRecentlyViewed(userId, limit);
  }

  /**
   * Finds an existing GlobalJob matching a company + role (+ optional
   * location), so manual application creation can reuse it instead of
   * duplicating job data. Returns null if no match is found.
   */
  async findMatchingJob(
    companyName: string,
    role: string,
    location?: string,
  ): Promise<GlobalJob | null> {
    if (!companyName.trim() || !role.trim()) return null;
    return jobRepo.findMatchingJob(companyName, role, location);
  }

  /**
   * Returns jobs related to a reference job, ranked by relevance (shared title
   * keywords, job function, experience level, employment type, industry, and
   * shared skills). Excludes the reference job. Reuses global_jobs only.
   */
  async getSimilarJobs(job: GlobalJob, limit: number = 6): Promise<GlobalJob[]> {
    return jobRepo.findSimilarJobs(job, limit);
  }

  /**
   * Returns skills associated with a job via job_skills junction.
   * Returns [] gracefully if no skills are stored.
   */
  async getJobSkills(jobId: string): Promise<Skill[]> {
    return jobRepo.findSkillsForJob(jobId);
  }

  // ── Saved jobs ────────────────────────────────────────────────────────────

  async getSavedJobs(
    userId: string,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<PaginatedResult<GlobalJob>> {
    return jobRepo.findSavedByUser(userId, pagination);
  }

  /** Archived (soft-hidden) saved jobs — the "archive instead of delete" partition. */
  async getArchivedSavedJobs(
    userId: string,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<PaginatedResult<GlobalJob>> {
    return jobRepo.findArchivedSavedByUser(userId, pagination);
  }

  async saveJob(userId: string, jobId: string, notes?: string): Promise<SavedJob> {
    return jobRepo.saveJob(userId, jobId, notes);
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    return jobRepo.unsaveJob(userId, jobId);
  }

  async archiveSavedJob(userId: string, jobId: string): Promise<void> {
    return jobRepo.archiveSavedJob(userId, jobId);
  }

  async unarchiveSavedJob(userId: string, jobId: string): Promise<void> {
    return jobRepo.unarchiveSavedJob(userId, jobId);
  }

  /**
   * Whether the saved-job archive columns exist in this environment. The UI
   * uses it to hide archive controls until the Module 5A migration is applied,
   * so a pending migration never shows a control that can't work.
   */
  async isSavedArchiveEnabled(): Promise<boolean> {
    return jobRepo.isArchiveEnabled();
  }

  async isSaved(userId: string, jobId: string): Promise<boolean> {
    return jobRepo.isSaved(userId, jobId);
  }

  /**
   * Returns all saved job IDs for the user.
   * Used by the UI to determine saved state for every job card on the list
   * without firing one query per card.
   */
  async getSavedJobIds(userId: string): Promise<string[]> {
    return jobRepo.getSavedJobIds(userId);
  }

  // ── Counts (sidebar badges) ───────────────────────────────────────────────

  /**
   * Count behind the sidebar "Jobs" badge. Must equal the number of jobs the
   * Jobs page lists, so it uses the SAME discovery-feed filter as the list
   * (countDiscoverable) rather than a raw table count — see JobRepository.
   */
  async countDiscoverableJobs(): Promise<number> {
    return jobRepo.countDiscoverable();
  }

  async countSavedJobs(userId: string): Promise<number> {
    return jobRepo.countSavedByUser(userId);
  }

  async countApplications(userId: string): Promise<number> {
    return jobRepo.countApplicationsByUser(userId);
  }
}

// Singleton — import `jobService` everywhere instead of `new JobService()`
export const jobService = new JobService();
