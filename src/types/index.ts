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
export type JobSource =
  | "LinkedIn"
  | "Wellfound"
  | "Greenhouse"
  | "Lever"
  | "Ashby"
  | "Careers"
  | "Manual";

export type EmploymentType =
  | "Full-Time"
  | "Part-Time"
  | "Contract"
  | "Internship"
  | "Temporary"
  | "Freelance";

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
  created_at: string;
  updated_at: string;
};

// ── Application ──
export type ApplicationStatus =
  | "wishlist"
  | "applied"
  | "online_assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "accepted";

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
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  url?: string | null;
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
  | "Recruiter"
  | "Technical"
  | "Design"
  | "Behavioral"
  | "Onsite"
  | "Offer chat";

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
  | "interview_reminder"
  | "match"
  | "offer"
  | "follow_up"
  | "resume"
  | "rejection"
  | "system";

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
  kind:
  | "match"
  | "interview"
  | "offer"
  | "saved"
  | "resume"
  | "reject";
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
  created_at: string;
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

