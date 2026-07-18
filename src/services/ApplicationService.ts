import type { Application, ApplicationStatus, GlobalJob, PaginationParams, PaginatedResult } from "@/types";
import type { ApplicationFilters, ApplicationSort, ManualApplicationInput } from "@/features/applications/types";
import { ALL_STATUSES, DEFAULT_APPLICATION_SORT } from "@/features/applications/constants";
import { ApplicationRepository } from "@/repositories/ApplicationRepository";
import { jobService } from "@/services/JobService";

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

  /**
   * Called from "+ Add Application". Looks for an existing GlobalJob that
   * matches the entered company + role (+ location) and reuses it instead of
   * creating a duplicate; falls back to a job-less application otherwise.
   * `source` reflects the matched job's origin when reused, or "Manual" when not.
   */
  async createManual(userId: string, input: ManualApplicationInput): Promise<Application> {
    const company = input.company_name.trim();
    const role = input.role.trim();
    const location = input.location?.trim() || undefined;

    const matched = await jobService.findMatchingJob(company, role, location);

    return appRepo.create(userId, {
      job_id: matched?.id ?? null,
      company_name: company,
      role,
      status: input.status,
      applied_at: new Date().toISOString(),
      location: location ?? matched?.location ?? null,
      salary_min: input.salary ?? matched?.salary_min ?? null,
      salary_max: matched?.salary_max ?? null,
      salary_currency: matched?.salary_currency ?? "USD",
      source: matched?.source ?? "Manual",
      url: input.url?.trim() || matched?.url || null,
      notes: input.notes?.trim() || null,
      created_via: "manual",
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
   * need pagination complexity. `archived` toggles the active board (default)
   * vs. the archive view.
   */
  async getAllApplications(userId: string, archived = false): Promise<Application[]> {
    return appRepo.findAllByUser(userId, archived);
  }

  async getApplication(id: string): Promise<Application | null> {
    return appRepo.findById(id);
  }

  /** Returns the user's existing application for a job, if one was already tracked. */
  async findApplicationByJob(userId: string, jobId: string): Promise<Application | null> {
    return appRepo.findByJobId(userId, jobId);
  }

  /** All job IDs the user has a tracked (non-archived) application for — drives the "Tracked" badge. */
  async getTrackedJobIds(userId: string): Promise<string[]> {
    return appRepo.findTrackedJobIds(userId);
  }

  /** Returns the application's timeline, newest first — see ApplicationRepository.findTimeline. */
  async getTimeline(applicationId: string) {
    return appRepo.findTimeline(applicationId);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateStatus(id: string, status: ApplicationStatus): Promise<Application> {
    if (!ALL_STATUSES.includes(status)) {
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

  // ── Archive ───────────────────────────────────────────────────────────────
  // Timeline events for these transitions are logged automatically by a DB
  // trigger (see supabase/migrations/20260717000001_module3a_application_management.sql).

  async archiveApplication(id: string): Promise<Application> {
    return appRepo.update(id, { archived: true, archived_at: new Date().toISOString() });
  }

  async restoreApplication(id: string): Promise<Application> {
    return appRepo.update(id, { archived: false, archived_at: null });
  }

  // ── Workspace (Module 3B) ────────────────────────────────────────────────
  // notes/priority/resume/cover-letter changes all log a timeline event
  // automatically via the DB trigger — see
  // supabase/migrations/20260718000001_module3b_application_workspace.sql.

  async updateNotes(id: string, notes: string): Promise<Application> {
    return appRepo.update(id, { notes, notes_updated_at: new Date().toISOString() });
  }

  async updatePriority(id: string, priority: Application["priority"]): Promise<Application> {
    return appRepo.update(id, { priority });
  }

  async setResume(id: string, resumeId: string | null): Promise<Application> {
    return appRepo.update(id, { resume_id: resumeId });
  }

  async setCoverLetter(id: string, coverLetterId: string | null): Promise<Application> {
    return appRepo.update(id, { cover_letter_id: coverLetterId });
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
