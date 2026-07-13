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
  | "full-time"
  | "part-time"
  | "contract"
  | "internship";

export type WorkMode = "remote" | "hybrid" | "onsite";

export type ExperienceLevel =
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "staff"
  | "principal";

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
  created_at: string;
  updated_at: string;
};

// ── Application ──
export type ApplicationStatus =
  | "interested"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";

export type Application = {
  id: string;
  user_id: string;
  job_id: string;
  status: ApplicationStatus;
  applied_at?: string;
  next_step?: string;
  notes?: string;
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
