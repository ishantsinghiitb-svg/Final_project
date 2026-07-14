import type { GlobalJob, SavedJob, Skill, PaginationParams, PaginatedResult } from "@/types";
import type { JobFilters, JobSort } from "@/features/jobs/types";
import { DEFAULT_JOB_SORT, DEFAULT_PAGINATION } from "@/features/jobs/constants";
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
    // Normalise free-text query so the repository doesn't worry about it
    const normalisedFilters: JobFilters = {
      ...filters,
      q: filters.q?.trim() || undefined,
      company: filters.company?.trim() || undefined,
      role: filters.role?.trim() || undefined,
      location: filters.location?.trim() || undefined,
    };

    // Business rule: `remote: true` implies work_mode should include "remote"
    // unless the caller has explicitly set a workMode filter already.
    // (No-op for now; add logic here when the UI sends both simultaneously.)

    return jobRepo.findAll(normalisedFilters, sort, pagination);
  }

  async getJob(id: string): Promise<GlobalJob | null> {
    return jobRepo.findById(id);
  }

  /**
   * Returns similar jobs to a reference job.
   * Similar = same role (fuzzy) OR same location, excluding the reference job.
   */
  async getSimilarJobs(
    jobId: string,
    role: string,
    location: string | undefined,
    limit: number = 6,
  ): Promise<GlobalJob[]> {
    return jobRepo.findSimilarJobs(jobId, role, location, limit);
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

  async saveJob(userId: string, jobId: string, notes?: string): Promise<SavedJob> {
    return jobRepo.saveJob(userId, jobId, notes);
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    return jobRepo.unsaveJob(userId, jobId);
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
}

// Singleton — import `jobService` everywhere instead of `new JobService()`
export const jobService = new JobService();
