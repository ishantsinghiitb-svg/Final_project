import type { Interview, InterviewStatus } from "@/types";
import type { ScheduleInterviewInput, StandaloneInterviewInput } from "@/features/interviews/types";
import { LINKED_STATUSES, STANDALONE_STATUSES } from "@/features/interviews/constants";
import { InterviewRepository } from "@/repositories/InterviewRepository";
import { applicationService } from "@/services/ApplicationService";
import { resumeService } from "@/services/ResumeService";

const interviewRepo = new InterviewRepository();

/**
 * InterviewService
 *
 * Owns business logic for the Interview Workspace feature:
 *   - Scheduling an interview from an existing application (inherits company/
 *     role/job snapshot; resume defaults to the application's, but the input
 *     always carries the final resume_id since the dialog itself owns the
 *     "inherit vs. Change Resume" decision).
 *   - Creating a standalone interview — job_id is always null; unlike
 *     ApplicationService.createManual this never auto-matches a GlobalJob,
 *     since company/role text alone is too weak a signal to safely attach one.
 *   - Validating status transitions against the linked/standalone status sets.
 *   - Delegating CRUD to the repository.
 */
export class InterviewService {
  // ── Create ────────────────────────────────────────────────────────────────

  async scheduleForApplication(
    userId: string,
    applicationId: string,
    input: ScheduleInterviewInput,
  ): Promise<Interview> {
    const application = await applicationService.getApplication(applicationId);
    if (!application) throw new Error("Application not found");

    return interviewRepo.create(userId, {
      application_id: applicationId,
      company_name: application.company_name,
      role: application.role,
      scheduled_at: input.scheduled_at,
      interviewer: input.interviewer ?? null,
      type: input.round,
      status: "scheduled",
      link: input.mode === "online" ? (input.link ?? null) : null,
      mode: input.mode,
      location: input.mode === "offline" ? (input.location ?? null) : null,
      resume_id: input.resume_id ?? null,
      resume_name_snapshot: await this.snapshotResumeName(input.resume_id),
      job_id: application.job_id ?? null,
      notes: input.notes ?? null,
    });
  }

  /** job_id is always null — no auto-matching, see class doc. */
  async createStandalone(userId: string, input: StandaloneInterviewInput): Promise<Interview> {
    return interviewRepo.create(userId, {
      application_id: null,
      company_name: input.company_name.trim(),
      role: input.role.trim(),
      scheduled_at: input.scheduled_at,
      interviewer: input.interviewer ?? null,
      type: input.round,
      status: "scheduled",
      link: input.mode === "online" ? (input.link ?? null) : null,
      mode: input.mode,
      location: input.mode === "offline" ? (input.location ?? null) : null,
      resume_id: input.resume_id ?? null,
      resume_name_snapshot: await this.snapshotResumeName(input.resume_id),
      job_id: null,
      notes: input.notes ?? null,
    });
  }

  private async snapshotResumeName(resumeId: string | null | undefined): Promise<string | null> {
    if (!resumeId) return null;
    const resume = await resumeService.getResume(resumeId);
    return resume?.name ?? null;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getAllInterviews(userId: string): Promise<Interview[]> {
    return interviewRepo.findAllByUser(userId);
  }

  async getInterview(id: string): Promise<Interview | null> {
    return interviewRepo.findById(id);
  }

  async getInterviewsForApplication(applicationId: string): Promise<Interview[]> {
    return interviewRepo.findByApplicationId(applicationId);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateInterview(
    id: string,
    updates: Partial<Omit<Interview, "id" | "user_id" | "created_at" | "updated_at">>,
  ): Promise<Interview> {
    if (updates.resume_id !== undefined) {
      updates = {
        ...updates,
        resume_name_snapshot: await this.snapshotResumeName(updates.resume_id),
      };
    }
    return interviewRepo.update(id, updates);
  }

  /**
   * Validates `status` against the allowed set for the interview's linked/
   * standalone context — linked interviews only ever go scheduled/completed;
   * outcome (Passed/Rejected) stays on the Application's own status.
   */
  async updateStatus(interview: Interview, status: InterviewStatus): Promise<Interview> {
    const allowed = interview.application_id ? LINKED_STATUSES : STANDALONE_STATUSES;
    if (!allowed.includes(status)) {
      throw new Error(`Invalid interview status: ${status}`);
    }
    return interviewRepo.updateStatus(interview.id, status);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteInterview(id: string): Promise<void> {
    return interviewRepo.delete(id);
  }
}

export const interviewService = new InterviewService();
