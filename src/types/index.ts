import type { Json } from "@/types/database";

// ── Auth ──
export type AuthProvider = "email" | "google";

export type AuthUser = {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  provider: AuthProvider;
};

// ── Profile ──
export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  target_role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = Partial<
  Pick<Profile, "full_name" | "location" | "target_role" | "avatar_url">
>;

export type Preference = {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
};

// ── Company ──
export type Company = {
  id: string;
  name: string;
  website?: string;
  logo_url?: string;
  industry?: string;
  size?: string;
  location?: string;
  created_at: string;
  updated_at: string;
};

// ── Job ──
// Matches exactly what's written to `global_jobs.source` — the extension's
// `SupportedSite` tags (lowercase) for board captures, or "Manual" for the
// manual-URL importer/default. Previously this listed title-cased board names
// ("LinkedIn", "Wellfound", …) that were never actually written anywhere,
// which silently broke the Jobs page source filter (`.in("source", [...])`
// never matched real lowercase rows) — see SOURCE_OPTIONS in
// features/jobs/constants and ManualImport's source detection.
//
// "wellfound", "foundit", "indeed" and "unstop" each have a dedicated parser
// (Module 4B phase 2A/2B), so the Source filter offers them and they match real
// captured rows.
export type JobSource =
  "linkedin" | "internshala" | "naukri" | "wellfound" | "foundit" | "indeed" | "unstop" | "Manual";

export type EmploymentType =
  "Full-Time" | "Part-Time" | "Contract" | "Internship" | "Temporary" | "Freelance";

export type WorkMode = "Remote" | "Hybrid" | "Onsite";

export type ExperienceLevel =
  | "Entry-Level"
  | "Mid-Level"
  | "Senior-Level"
  | "Intern"
  | "Junior"
  | "Lead"
  | "Staff"
  | "Principal";

export type SalaryPeriod = "Hourly" | "Daily" | "Weekly" | "Monthly" | "Yearly";

/** One member of a job's hiring team — stored in `global_jobs.hiring_team` (jsonb). */
export type HiringTeamMember = {
  name: string;
  profileUrl: string | null;
  role: string | null;
};

export type GlobalJob = {
  id: string;
  company_id?: string;
  company_name: string;
  role: string;
  location?: string;
  remote?: boolean;
  work_mode?: WorkMode;
  employment_type?: EmploymentType;
  experience_level?: ExperienceLevel;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  description?: string;
  url?: string;
  source: JobSource;
  posted_at?: string;
  /** External job-board ID (e.g. LinkedIn job ID) — dedup key alongside `fingerprint`. */
  source_job_id?: string | null;
  /** Deterministic hash of title+company+location — fallback dedup key when no `source_job_id`. */
  fingerprint?: string | null;
  company_logo_url?: string | null;
  is_closed?: boolean;
  /** Canonical job-posting page URL (e.g. the LinkedIn job page) — distinct from `url`, the apply-action link. */
  source_url?: string | null;
  company_url?: string | null;
  city?: string | null;
  country?: string | null;
  /** Human "time ago" string captured verbatim from the source (e.g. "2 weeks ago"). */
  posted_ago?: string | null;
  applicant_count?: number | null;
  hiring_insights?: string[] | null;
  easy_apply?: boolean;
  promoted?: boolean;
  reposted?: boolean;
  /** True when applications route through an external ATS rather than LinkedIn's own inbox. */
  responses_managed?: boolean;
  industry?: string | null;
  job_function?: string | null;
  benefits?: string[] | null;
  /** Sanitized HTML (structural tags only, no attributes) for rich rendering — falls back to `description` when absent. */
  description_html?: string | null;
  // ── Module 4A: Universal Job Model additions (all optional / nullable) ──
  /** Region/state, alongside the existing `city`/`country`. */
  state?: string | null;
  department?: string | null;
  /** The company's own careers/ATS page — distinct from `company_url` (its profile page). */
  company_career_url?: string | null;
  salary_period?: SalaryPeriod | string | null;
  /** Verbatim salary display string; synthesized from the numeric range when a source gives none. */
  salary_text?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  preferred_qualifications?: string[] | null;
  /** Distinct from `skills` — concrete tools/frameworks. */
  technologies?: string[] | null;
  languages?: string[] | null;
  expiry_date?: string | null;
  hiring_team?: HiringTeamMember[] | null;
  recruiter_name?: string | null;
  recruiter_profile?: string | null;
  company_size?: string | null;
  /** Which parser + version produced the row (e.g. "linkedin-1", "manual-1"). */
  parser_version?: string | null;
  /** Extraction completeness in [0, 1], computed by the Normalizer. */
  parser_confidence?: number | null;
  extraction_warnings?: string[] | null;
  /**
   * True only for jobs created via the manual-URL importer. Hidden from the
   * Global Jobs discovery feed (see JobRepository.findAll) but never deleted —
   * still visible via Applications, Saved Jobs, or a direct job-detail link.
   * Flips back to `false` permanently once a real parser captures the same
   * job identity (see `upsert_global_job`).
   */
  is_manual_import?: boolean;
  created_at: string;
  updated_at: string;
};

// ── Application ──
export type ApplicationStatus =
  "applied" | "online_assessment" | "interview" | "offer" | "accepted" | "rejected" | "withdrawn";

export type Application = {
  id: string;
  user_id: string;
  /** FK to global_jobs — may be null if the source job was deleted */
  job_id?: string | null;
  company_name: string;
  role: string;
  status: ApplicationStatus;
  applied_at?: string | null;
  next_step?: string | null;
  notes?: string | null;
  // Inherited from GlobalJob at creation time
  location?: string | null;
  /**
   * The linked global_job's stored logo, attached at read time by
   * `ApplicationRepository.attachLogos` (not a persisted `applications` column).
   * Lets application avatars reuse the same company logo the Jobs pages show;
   * `null`/absent → `CompanyMark` falls back to initials.
   */
  company_logo_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  url?: string | null;
  /** Soft-archive state — archived applications are hidden from the active board. */
  archived?: boolean;
  archived_at?: string | null;
  /** How this application was created. */
  created_via?: "apply_flow" | "manual";
  /** Free-form extension point (recruiter, hiring manager, referral, reminder, etc.). */
  metadata?: Json;
  /** Set alongside `notes` whenever it's saved — see ApplicationService.updateNotes. */
  notes_updated_at?: string | null;
  priority?: ApplicationPriority | null;
  /** FK to resumes — which resume was used for this application. */
  resume_id?: string | null;
  /** FK to cover_letters. */
  cover_letter_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationPriority = "low" | "medium" | "high" | "urgent";

// ── Application Timeline ──
// Backed by `application_activity`, populated automatically by DB triggers
// (see supabase/migrations/20260717000001_module3a_application_management.sql
// and 20260718000001_module3b_application_workspace.sql). Read-only from the UI.
export type ApplicationTimelineEventType =
  | "application_created"
  | "manual_application_created"
  | "status_changed"
  | "archived"
  | "restored"
  | "notes_updated"
  | "priority_changed"
  | "resume_changed"
  | "contact_added"
  | "reminder_created"
  | "reminder_completed";

export type ApplicationTimelineEvent = {
  id: string;
  application_id: string;
  user_id: string;
  event_type: ApplicationTimelineEventType;
  /** Rendered human-readable summary. */
  text: string;
  previous_value: string | null;
  new_value: string | null;
  metadata: Json;
  created_at: string;
};

// ── Application Contacts (Recruiter / Hiring Manager / Referral) ──
export type ApplicationContactType = "recruiter" | "hiring_manager" | "referral";

export type ApplicationContact = {
  id: string;
  application_id: string;
  user_id: string;
  type: ApplicationContactType;
  name: string;
  email?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

// ── Application Reminders ──
export type ApplicationReminderType =
  "follow_up" | "interview" | "oa_deadline" | "offer_expiry" | "custom";

export type ApplicationReminder = {
  id: string;
  application_id: string;
  user_id: string;
  type: ApplicationReminderType;
  title: string;
  remind_at: string;
  note?: string | null;
  completed: boolean;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

// ── Application Attachments ──
// Metadata only — file bytes live in the existing private `documents` storage
// bucket (see src/services/storage/DocumentStorage.ts).
export type ApplicationAttachmentKind = "offer_letter" | "assignment" | "pdf" | "other";

export type ApplicationAttachment = {
  id: string;
  application_id: string;
  user_id: string;
  kind: ApplicationAttachmentKind;
  name: string;
  file_path: string;
  size_bytes?: number | null;
  mime_type?: string | null;
  /** Optional link to a reminder — NULL means a general application attachment. */
  reminder_id?: string | null;
  created_at: string;
};

// ── Cover Letter ──
// Deliberately minimal — no separate versions table like Resume has, since
// nothing produces cover-letter content today. One row per version.
export type CoverLetter = {
  id: string;
  user_id: string;
  name: string;
  version_number: number;
  file_url?: string | null;
  created_at: string;
  updated_at: string;
};

// ── Resume ──
export type Resume = {
  id: string;
  user_id: string;
  name: string;
  tailored_for?: string;
  file_url?: string;
  score?: number;
  keywords_count?: number;
  times_used?: number;
  created_at: string;
  updated_at: string;
  // ── Module 6A: resume management metadata ──
  is_default?: boolean;
  file_name?: string | null;
  file_hash?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  page_count?: number | null;
  parse_status?: string;
  parse_error?: string | null;
  parsed_at?: string | null;
};

export type ResumeVersion = {
  id: string;
  resume_id: string;
  version_number: number;
  content: string;
  created_at: string;
};

// ── Interview ──
export type InterviewType =
  "Recruiter" | "Technical" | "Design" | "Behavioral" | "Onsite" | "Offer chat";

export type InterviewStatus = "scheduled" | "completed" | "cancelled";

export type Interview = {
  id: string;
  user_id: string;
  application_id?: string;
  company_name: string;
  role: string;
  scheduled_at: string;
  interviewer?: string;
  type: InterviewType;
  status: InterviewStatus;
  link?: string;
  prep?: string;
  created_at: string;
  updated_at: string;
};

// ── Notification ──
export type NotificationType =
  "interview_reminder" | "match" | "offer" | "follow_up" | "resume" | "rejection" | "system";

export type NotificationPriority = "high" | "medium" | "low";

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

// ── Analytics ──
export type Analytics = {
  active_applications: number;
  interviews: number;
  match_avg: number;
  offers: number;
  weekly_goal: number;
  weekly_done: number;
};

export type Activity = {
  id: string;
  user_id: string;
  kind: "match" | "interview" | "offer" | "saved" | "resume" | "reject";
  text: string;
  when: string;
  created_at: string;
};

// ── Skill & Role ──
export type Skill = {
  id: string;
  name: string;
  category?: string;
};

export type Role = {
  id: string;
  title: string;
  category?: string;
};

export type Location = {
  id: string;
  city: string;
  state?: string;
  country: string;
  remote?: boolean;
};

// ── Community ──
export type Community = {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  created_at: string;
};

export type Message = {
  id: string;
  community_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type Comment = {
  id: string;
  parent_type: string;
  parent_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type Reaction = {
  id: string;
  parent_type: string;
  parent_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

// ── Saved Jobs ──
export type SavedJob = {
  id: string;
  user_id: string;
  job_id: string;
  notes: string | null;
  /** Soft-archive state — archived saves are hidden from the active Saved list but never deleted. */
  archived?: boolean;
  archived_at?: string | null;
  created_at: string;
};

// ── Collections (Module 5B) ──
// User-defined groupings of Global Jobs. A job may belong to many collections
// and does NOT need to be saved first — collections reference global_jobs
// directly via collection_jobs, never duplicating job data.

/** Preset color key — mirrors the existing Chip tone vocabulary (see primitives.tsx). */
export type CollectionColor = "default" | "blue" | "purple" | "green" | "amber" | "rose";

export type Collection = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: CollectionColor | null;
  created_at: string;
  updated_at: string;
};

/** A collection enriched with lightweight, cheaply-computed stats for the Collections grid. */
export type CollectionWithStats = Collection & {
  job_count: number;
  /** Up to 3 most common sources among the collection's jobs, most-common first. */
  top_sources: { source: string; count: number }[];
};

// ── Pagination ──
export type PaginationParams = {
  /** 1-indexed current page */
  page: number;
  /** Number of items per page */
  pageSize: number;
};

export type PaginatedResult<T> = {
  data: T[];
  /** Total number of records matching the query (before pagination) */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
