import type { InterviewMode } from "@/types";

// ── "When" filter ─────────────────────────────────────────────────────────

export type InterviewWhenFilter = "today" | "upcoming" | "completed";

// ── Linked / standalone filter ──────────────────────────────────────────────

export type InterviewLinkedFilter = "linked" | "standalone";

// ── Interview filter shape ───────────────────────────────────────────────────

export type InterviewFilters = {
  /** Free-text keyword — matched against company_name, role, interviewer */
  q?: string;
  when?: InterviewWhenFilter;
  /** One or more Interview Round values */
  round?: string[];
  linked?: InterviewLinkedFilter;
};

// ── Sort shape ───────────────────────────────────────────────────────────────

export type InterviewSortField = "scheduled_at";

export type InterviewSortDirection = "asc" | "desc";

export type InterviewSort = {
  field: InterviewSortField;
  direction: InterviewSortDirection;
};

export type InterviewSortOption = "earliest" | "latest";

// ── View mode ────────────────────────────────────────────────────────────────

export type InterviewViewMode = "card" | "table";

// ── Create/schedule input ────────────────────────────────────────────────────
// Shared by both flows; `scheduleForApplication` fills in company_name/role/
// job_id from the linked application, `createStandalone` takes them from
// StandaloneInterviewInput below.

export type ScheduleInterviewInput = {
  round: string;
  /** ISO datetime — combined from the dialog's separate Date + Time inputs. */
  scheduled_at: string;
  mode: InterviewMode;
  link?: string | null;
  location?: string | null;
  interviewer?: string | null;
  /** Which resume to snapshot against this interview, if any. */
  resume_id?: string | null;
  notes?: string | null;
};

export type StandaloneInterviewInput = ScheduleInterviewInput & {
  company_name: string;
  role: string;
};
