// ── Database Types ──
// Auto-derived from the Supabase schema migrations.
// These types mirror the database tables exactly and are used by the repository layer.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── profiles (existing — included for completeness) ──
export type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  target_role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

// ── companies ──
export type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  created_at: string;
  updated_at: string;
};

// ── global_jobs ──
export type GlobalJobRow = {
  id: string;
  company_id: string | null;
  company_name: string;
  role: string;
  role_id: string | null;
  location_id: string | null;
  location: string | null;
  remote: boolean;
  work_mode: string;
  employment_type: string;
  experience_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string | null;
  url: string | null;
  source: string;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── skills ──
export type SkillRow = {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
};

// ── roles ──
export type RoleRow = {
  id: string;
  title: string;
  category: string | null;
  created_at: string;
};

// ── locations ──
export type LocationRow = {
  id: string;
  city: string;
  state: string | null;
  country: string;
  remote: boolean;
  created_at: string;
};

// ── job_skills ──
export type JobSkillRow = {
  id: string;
  job_id: string;
  skill_id: string;
  required: boolean;
  created_at: string;
};

// ── saved_jobs ──
export type SavedJobRow = {
  id: string;
  user_id: string;
  job_id: string;
  notes: string | null;
  created_at: string;
};

// ── applications ──
export type ApplicationRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  company_name: string;
  role: string;
  status: string;
  applied_at: string | null;
  next_step: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ── application_activity ──
export type ApplicationActivityRow = {
  id: string;
  application_id: string;
  user_id: string;
  kind: string;
  text: string;
  created_at: string;
};

// ── resumes ──
export type ResumeRow = {
  id: string;
  user_id: string;
  name: string;
  tailored_for: string | null;
  file_url: string | null;
  score: number | null;
  keywords_count: number;
  times_used: number;
  created_at: string;
  updated_at: string;
};

// ── resume_versions ──
export type ResumeVersionRow = {
  id: string;
  resume_id: string;
  version_number: number;
  content: string;
  created_at: string;
};

// ── resume_ats_scores ──
export type ResumeAtsScoreRow = {
  id: string;
  resume_version_id: string;
  user_id: string;
  score: number;
  breakdown: Json | null;
  created_at: string;
};

// ── interviews ──
export type InterviewRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  company_name: string;
  role: string;
  scheduled_at: string;
  interviewer: string | null;
  type: string;
  status: string;
  link: string | null;
  prep: string | null;
  created_at: string;
  updated_at: string;
};

// ── notifications ──
export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

// ── notification_preferences ──
export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  type: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// ── user_preferences ──
export type UserPreferenceRow = {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
};

// ── analytics_events ──
export type AnalyticsEventRow = {
  id: string;
  user_id: string;
  event: string;
  properties: Json | null;
  created_at: string;
};

// ── communities ──
export type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  creator_id: string | null; // Added by 20260713200000_fix_community_rls.sql
  created_at: string;
  updated_at: string;
};

// ── community_members ──
export type CommunityMemberRow = {
  id: string;
  community_id: string;
  user_id: string;
  joined_at: string;
};

// ── messages ──
export type MessageRow = {
  id: string;
  community_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

// ── Database type map (for use with typed Supabase client) ──
export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow> };
      companies: { Row: CompanyRow; Insert: Partial<CompanyRow>; Update: Partial<CompanyRow> };
      global_jobs: { Row: GlobalJobRow; Insert: Partial<GlobalJobRow>; Update: Partial<GlobalJobRow> };
      skills: { Row: SkillRow; Insert: Partial<SkillRow>; Update: Partial<SkillRow> };
      roles: { Row: RoleRow; Insert: Partial<RoleRow>; Update: Partial<RoleRow> };
      locations: { Row: LocationRow; Insert: Partial<LocationRow>; Update: Partial<LocationRow> };
      job_skills: { Row: JobSkillRow; Insert: Partial<JobSkillRow>; Update: Partial<JobSkillRow> };
      saved_jobs: { Row: SavedJobRow; Insert: Partial<SavedJobRow>; Update: Partial<SavedJobRow> };
      applications: { Row: ApplicationRow; Insert: Partial<ApplicationRow>; Update: Partial<ApplicationRow> };
      application_activity: { Row: ApplicationActivityRow; Insert: Partial<ApplicationActivityRow>; Update: Partial<ApplicationActivityRow> };
      resumes: { Row: ResumeRow; Insert: Partial<ResumeRow>; Update: Partial<ResumeRow> };
      resume_versions: { Row: ResumeVersionRow; Insert: Partial<ResumeVersionRow>; Update: Partial<ResumeVersionRow> };
      resume_ats_scores: { Row: ResumeAtsScoreRow; Insert: Partial<ResumeAtsScoreRow>; Update: Partial<ResumeAtsScoreRow> };
      interviews: { Row: InterviewRow; Insert: Partial<InterviewRow>; Update: Partial<InterviewRow> };
      notifications: { Row: NotificationRow; Insert: Partial<NotificationRow>; Update: Partial<NotificationRow> };
      notification_preferences: { Row: NotificationPreferenceRow; Insert: Partial<NotificationPreferenceRow>; Update: Partial<NotificationPreferenceRow> };
      user_preferences: { Row: UserPreferenceRow; Insert: Partial<UserPreferenceRow>; Update: Partial<UserPreferenceRow> };
      analytics_events: { Row: AnalyticsEventRow; Insert: Partial<AnalyticsEventRow>; Update: Partial<AnalyticsEventRow> };
      communities: { Row: CommunityRow; Insert: Partial<CommunityRow>; Update: Partial<CommunityRow> };
      community_members: { Row: CommunityMemberRow; Insert: Partial<CommunityMemberRow>; Update: Partial<CommunityMemberRow> };
      messages: { Row: MessageRow; Insert: Partial<MessageRow>; Update: Partial<MessageRow> };
    };
  };
};
