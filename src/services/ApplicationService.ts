import type { Application, ApplicationStatus, GlobalJob, PaginationParams, PaginatedResult } from "@/types";
import type { ApplicationFilters, ApplicationSort } from "@/features/applications/types";
import { DEFAULT_APPLICATION_SORT } from "@/features/applications/constants";
import { ApplicationRepository } from "@/repositories/ApplicationRepository";

const DEFAULT_PAGINATION: PaginationParams = { page: 1, pageSize: 50 };

const appRepo = new ApplicationRepository();

/**
 * ApplicationService
 *
 * Owns business logic for the Application Tracking feature:
 *   - Creating an application from a GlobalJob (inheriting all relevant fields)
 *   - Validating status transitions
 *   - Delegating CRUD to the repository
 *
 * Repositories handle DB access only.
 * React Query hooks call service methods directly.
 */
export class ApplicationService {
  // ── Create from Job ───────────────────────────────────────────────────────

  /**
   * Called when user confirms "Did you apply?" after clicking Apply Now.
   * Inherits Company, Role, Location, Salary, Source, URL, and GlobalJobId
   * from the selected GlobalJob — user never manually enters these fields.
   */
  async createFromJob(userId: string, job: GlobalJob): Promise<Application> {
    return appRepo.create(userId, {
      job_id: job.id,
      company_name: job.company_name,
      role: job.role,
      status: "applied",
      applied_at: new Date().toISOString(),
      location: job.location ?? null,
      salary_min: job.salary_min ?? null,
      salary_max: job.salary_max ?? null,
      salary_currency: job.salary_currency ?? null,
      source: job.source ?? null,
      url: job.url ?? null,
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getApplications(
    userId: string,
    filters: ApplicationFilters = {},
    sort: ApplicationSort = DEFAULT_APPLICATION_SORT,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<PaginatedResult<Application>> {
    const trimmed: ApplicationFilters = {
      ...filters,
      q: filters.q?.trim() || undefined,
      company: filters.company?.trim() || undefined,
    };
    return appRepo.findByUser(userId, trimmed, sort, pagination);
  }

  /**
   * Returns ALL applications for a user — used by the Kanban board.
   * Applies search filter client-side after fetching so the Kanban doesn't
   * need pagination complexity.
   */
  async getAllApplications(userId: string): Promise<Application[]> {
    return appRepo.findAllByUser(userId);
  }

  async getApplication(id: string): Promise<Application | null> {
    return appRepo.findById(id);
  }

  /** Returns the user's existing application for a job, if one was already tracked. */
  async findApplicationByJob(userId: string, jobId: string): Promise<Application | null> {
    return appRepo.findByJobId(userId, jobId);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateStatus(id: string, status: ApplicationStatus): Promise<Application> {
    // Validate status is a known value
    const VALID: ApplicationStatus[] = [
      "wishlist",
      "applied",
      "online_assessment",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
      "accepted",
    ];
    if (!VALID.includes(status)) {
      throw new Error(`Invalid application status: ${status}`);
    }
    return appRepo.updateStatus(id, status);
  }

  async updateApplication(
    id: string,
    updates: Partial<Omit<Application, "id" | "user_id" | "created_at" | "updated_at">>,
  ): Promise<Application> {
    return appRepo.update(id, updates);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteApplication(id: string): Promise<void> {
    return appRepo.delete(id);
  }

  // ── Counts ────────────────────────────────────────────────────────────────

  async countApplications(userId: string): Promise<number> {
    return appRepo.countByUser(userId);
  }

  async countByStatus(userId: string): Promise<Record<string, number>> {
    return appRepo.countByStatus(userId);
  }
}

export const applicationService = new ApplicationService();
