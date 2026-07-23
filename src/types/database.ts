// ── Database Types ─────────────────────────────────────────────────────────
//
// Conforms to @supabase/postgrest-js v1 GenericSchema / GenericTable contract:
//
//   GenericSchema = { Tables: Record<string, GenericTable>; Views: Record<string, GenericView>; Functions: Record<string, GenericFunction> }
//   GenericTable  = { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: GenericRelationship[] }
//
// The `Insert` type mirrors generated Supabase output:
//   - Columns with DB DEFAULT → optional in Insert
//   - Nullable columns        → optional with | null in Insert
//   - NOT NULL without DEFAULT → required in Insert
//
// Update is always Partial<Row> — only the fields being changed need to be supplied.
//
// `Relationships` is an empty array for every table; foreign-key joins are not
// used via Supabase's embedded syntax in this project (Sprint 1+).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Shared relationship record (satisfies GenericRelationship) ─────────────
export type TableRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

// ── Row types ─────────────────────────────────────────────────────────────
// These exactly mirror the database columns and are used by the repository
// layer. They must stay in sync with migrations.

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

export type GlobalJobRow = {
  id: string;
  company_id: string | null;
  company_name: string;
  role: string;
  role_id: string | null;
  location_id: string | null;
  location: string | null;
  remote: boolean;
  work_mode: string | null;
  employment_type: string | null;
  experience_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  url: string | null;
  source: string;
  posted_at: string | null;
  source_job_id: string | null;
  fingerprint: string | null;
  company_logo_url: string | null;
  is_closed: boolean;
  source_url: string | null;
  company_url: string | null;
  city: string | null;
  country: string | null;
  posted_ago: string | null;
  applicant_count: number | null;
  hiring_insights: string[] | null;
  easy_apply: boolean;
  promoted: boolean;
  reposted: boolean;
  responses_managed: boolean;
  industry: string | null;
  job_function: string | null;
  benefits: string[] | null;
  description_html: string | null;
  // ── Module 4A: Universal Job Model additions ──
  state: string | null;
  department: string | null;
  company_career_url: string | null;
  salary_period: string | null;
  salary_text: string | null;
  responsibilities: string[] | null;
  requirements: string[] | null;
  preferred_qualifications: string[] | null;
  technologies: string[] | null;
  languages: string[] | null;
  expiry_date: string | null;
  hiring_team: Json | null;
  recruiter_name: string | null;
  recruiter_profile: string | null;
  company_size: string | null;
  parser_version: string | null;
  parser_confidence: number | null;
  extraction_warnings: string[] | null;
  // ── Module 4A QA fix: discovery-feed visibility flag ──
  is_manual_import: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillRow = {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
};

export type RoleRow = {
  id: string;
  title: string;
  category: string | null;
  created_at: string;
};

export type LocationRow = {
  id: string;
  city: string;
  state: string | null;
  country: string;
  remote: boolean;
  created_at: string;
};

export type JobSkillRow = {
  id: string;
  job_id: string;
  skill_id: string;
  required: boolean;
  created_at: string;
};

export type SavedJobRow = {
  id: string;
  user_id: string;
  job_id: string;
  notes: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
};

// ── Module 5B: Collections ──
export type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type CollectionJobRow = {
  id: string;
  collection_id: string;
  job_id: string;
  user_id: string;
  added_at: string;
};

// ── Module 5C: Recently Viewed ──
export type RecentlyViewedRow = {
  id: string;
  user_id: string;
  job_id: string;
  viewed_at: string;
};

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
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  source: string | null;
  url: string | null;
  archived: boolean;
  archived_at: string | null;
  /** How this row was created — 'apply_flow' (via a GlobalJob) or 'manual'. */
  created_via: string;
  /** Free-form extension point (recruiter, hiring manager, referral, reminder, etc.) — see Module 3A schema notes. */
  metadata: Json;
  notes_updated_at: string | null;
  priority: string | null;
  resume_id: string | null;
  cover_letter_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationActivityRow = {
  id: string;
  application_id: string;
  user_id: string;
  /** Event type — see ApplicationTimelineEventType in src/types/index.ts for the full set. */
  kind: string;
  /** Rendered human-readable summary. */
  text: string;
  previous_value: string | null;
  new_value: string | null;
  metadata: Json;
  created_at: string;
};

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
  // ── Module 6A additive columns ──
  is_default: boolean;
  file_name: string | null;
  file_hash: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  page_count: number | null;
  parse_status: string;
  parse_error: string | null;
  parsed_at: string | null;
};

// ── Module 6A: AI Foundation & Resume Management ──
export type ResumeParsedRow = {
  resume_id: string;
  user_id: string;
  resume_file_hash: string | null;
  parser_version: string;
  raw_text: string | null;
  structured: Json | null;
  health: Json | null;
  parse_confidence: number | null;
  char_count: number | null;
  token_estimate: number | null;
  created_at: string;
  updated_at: string;
};

export type ResumeParsedInsert = {
  resume_id: string;
  user_id: string;
  resume_file_hash?: string | null;
  parser_version: string;
  raw_text?: string | null;
  structured?: Json | null;
  health?: Json | null;
  parse_confidence?: number | null;
  char_count?: number | null;
  token_estimate?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type AiRunRow = {
  id: string;
  user_id: string;
  capability: string;
  provider: string;
  model: string;
  prompt_id: string | null;
  prompt_version: string | null;
  analysis_version: string | null;
  input_hash: string | null;
  job_hash: string | null;
  resume_id: string | null;
  job_id: string | null;
  status: string;
  cache_hit: boolean;
  credits_charged: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export type AiRunInsert = {
  id?: string;
  user_id: string;
  capability: string;
  provider: string;
  model: string;
  prompt_id?: string | null;
  prompt_version?: string | null;
  analysis_version?: string | null;
  input_hash?: string | null;
  job_hash?: string | null;
  resume_id?: string | null;
  job_id?: string | null;
  status?: string;
  cache_hit?: boolean;
  credits_charged?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms?: number | null;
  cost_usd?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
};

export type AiCacheRow = {
  id: string;
  user_id: string;
  capability: string;
  input_hash: string;
  prompt_version: string;
  analysis_version: string;
  model: string;
  job_hash: string | null;
  response: Json;
  expires_at: string | null;
  created_at: string;
};

export type AiCacheInsert = {
  id?: string;
  user_id: string;
  capability: string;
  input_hash: string;
  prompt_version: string;
  analysis_version: string;
  model: string;
  job_hash?: string | null;
  response: Json;
  expires_at?: string | null;
  created_at?: string;
};

export type UserAiUsageRow = {
  user_id: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  credits_remaining: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserAiUsageInsert = {
  user_id: string;
  plan?: string;
  credits_total?: number;
  credits_used?: number;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ── Module 6B: Resume Match ──
export type AiAnalysisRow = {
  id: string;
  user_id: string;
  capability: string;
  resume_id: string | null;
  job_id: string | null;
  resume_file_hash: string | null;
  job_hash: string | null;
  input_hash: string;
  prompt_version: string;
  analysis_version: string;
  model: string;
  score: number | null;
  result: Json;
  cache_hit: boolean;
  created_at: string;
};

export type AiAnalysisInsert = {
  id?: string;
  user_id: string;
  capability: string;
  resume_id?: string | null;
  job_id?: string | null;
  resume_file_hash?: string | null;
  job_hash?: string | null;
  input_hash: string;
  prompt_version: string;
  analysis_version: string;
  model: string;
  score?: number | null;
  result: Json;
  cache_hit?: boolean;
  created_at?: string;
};

export type ResumeVersionRow = {
  id: string;
  resume_id: string;
  version_number: number;
  content: string;
  created_at: string;
};

export type ResumeAtsScoreRow = {
  id: string;
  resume_version_id: string;
  user_id: string;
  score: number;
  breakdown: Json | null;
  created_at: string;
};

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

export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  type: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type UserPreferenceRow = {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
};

export type AnalyticsEventRow = {
  id: string;
  user_id: string;
  event: string;
  properties: Json | null;
  created_at: string;
};

export type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  creator_id: string | null; // Added by 20260713200000_fix_community_rls.sql
  created_at: string;
  updated_at: string;
};

export type CommunityMemberRow = {
  id: string;
  community_id: string;
  user_id: string;
  joined_at: string;
};

export type MessageRow = {
  id: string;
  community_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

// ── Insert types ──────────────────────────────────────────────────────────
// Convention:
//   - `id`, `created_at`, `updated_at`  → optional (DB supplies DEFAULT)
//   - nullable columns                  → optional  (Type | null)
//   - NOT NULL without DEFAULT          → required

export type ProfileInsert = {
  id: string; // Required — must match auth.users.id; no DEFAULT
  full_name?: string | null;
  email?: string | null;
  location?: string | null;
  target_role?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CompanyInsert = {
  id?: string;
  name: string; // NOT NULL, no DEFAULT
  website?: string | null;
  logo_url?: string | null;
  industry?: string | null;
  size?: string | null;
  headquarters?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GlobalJobInsert = {
  id?: string;
  company_id?: string | null;
  company_name: string; // NOT NULL, no DEFAULT
  role: string; // NOT NULL, no DEFAULT
  role_id?: string | null;
  location_id?: string | null;
  location?: string | null;
  remote?: boolean; // NOT NULL DEFAULT false
  work_mode?: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  description?: string | null;
  url?: string | null;
  source?: string; // NOT NULL DEFAULT 'Manual'
  posted_at?: string | null;
  source_job_id?: string | null;
  fingerprint?: string | null;
  company_logo_url?: string | null;
  is_closed?: boolean;
  source_url?: string | null;
  company_url?: string | null;
  city?: string | null;
  country?: string | null;
  posted_ago?: string | null;
  applicant_count?: number | null;
  hiring_insights?: string[] | null;
  easy_apply?: boolean;
  promoted?: boolean;
  reposted?: boolean;
  responses_managed?: boolean;
  industry?: string | null;
  job_function?: string | null;
  benefits?: string[] | null;
  description_html?: string | null;
  // ── Module 4A: Universal Job Model additions ──
  state?: string | null;
  department?: string | null;
  company_career_url?: string | null;
  salary_period?: string | null;
  salary_text?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  preferred_qualifications?: string[] | null;
  technologies?: string[] | null;
  languages?: string[] | null;
  expiry_date?: string | null;
  hiring_team?: Json | null;
  recruiter_name?: string | null;
  recruiter_profile?: string | null;
  company_size?: string | null;
  parser_version?: string | null;
  parser_confidence?: number | null;
  extraction_warnings?: string[] | null;
  // ── Module 4A QA fix: discovery-feed visibility flag ──
  is_manual_import?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SkillInsert = {
  id?: string;
  name: string;
  category?: string | null;
  created_at?: string;
};

export type RoleInsert = {
  id?: string;
  title: string;
  category?: string | null;
  created_at?: string;
};

export type LocationInsert = {
  id?: string;
  city: string;
  state?: string | null;
  country: string;
  remote?: boolean;
  created_at?: string;
};

export type JobSkillInsert = {
  id?: string;
  job_id: string;
  skill_id: string;
  required?: boolean;
  created_at?: string;
};

export type SavedJobInsert = {
  id?: string;
  user_id: string; // NOT NULL
  job_id: string; // NOT NULL
  notes?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  created_at?: string;
};

// ── Module 5B: Collections ──
export type CollectionInsert = {
  id?: string;
  user_id: string; // NOT NULL
  name: string; // NOT NULL
  description?: string | null;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CollectionJobInsert = {
  id?: string;
  collection_id: string; // NOT NULL
  job_id: string; // NOT NULL
  user_id: string; // NOT NULL
  added_at?: string;
};

// ── Module 5C: Recently Viewed ──
export type RecentlyViewedInsert = {
  id?: string;
  user_id: string; // NOT NULL
  job_id: string; // NOT NULL
  viewed_at?: string;
};

export type ApplicationInsert = {
  id?: string;
  user_id: string;
  job_id?: string | null;
  company_name: string;
  role: string;
  status?: string;
  applied_at?: string | null;
  next_step?: string | null;
  notes?: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  url?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  created_via?: string;
  metadata?: Json;
  notes_updated_at?: string | null;
  priority?: string | null;
  resume_id?: string | null;
  cover_letter_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ApplicationActivityInsert = {
  id?: string;
  application_id: string;
  user_id: string;
  kind: string;
  text: string;
  previous_value?: string | null;
  new_value?: string | null;
  metadata?: Json;
  created_at?: string;
};

// ── Module 3B: Application Workspace ──

export type CoverLetterRow = {
  id: string;
  user_id: string;
  name: string;
  version_number: number;
  file_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CoverLetterInsert = {
  id?: string;
  user_id: string;
  name: string;
  version_number?: number;
  file_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ApplicationContactRow = {
  id: string;
  application_id: string;
  user_id: string;
  /** 'recruiter' | 'hiring_manager' | 'referral' */
  type: string;
  name: string;
  email: string | null;
  linkedin_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationContactInsert = {
  id?: string;
  application_id: string;
  user_id: string;
  type: string;
  name: string;
  email?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ApplicationReminderRow = {
  id: string;
  application_id: string;
  user_id: string;
  /** 'follow_up' | 'interview' | 'oa_deadline' | 'offer_expiry' | 'custom' */
  type: string;
  title: string;
  remind_at: string;
  note: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationReminderInsert = {
  id?: string;
  application_id: string;
  user_id: string;
  type: string;
  title: string;
  remind_at: string;
  note?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ApplicationAttachmentRow = {
  id: string;
  application_id: string;
  user_id: string;
  /** 'offer_letter' | 'assignment' | 'pdf' | 'other' */
  kind: string;
  name: string;
  /** Storage path within the private `documents` bucket — not a URL. */
  file_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  /** Optional link to application_reminders — NULL means a general application attachment. */
  reminder_id: string | null;
  created_at: string;
};

export type ApplicationAttachmentInsert = {
  id?: string;
  application_id: string;
  user_id: string;
  kind?: string;
  name: string;
  file_path: string;
  size_bytes?: number | null;
  mime_type?: string | null;
  reminder_id?: string | null;
  created_at?: string;
};

export type ResumeInsert = {
  id?: string;
  user_id: string;
  name: string;
  tailored_for?: string | null;
  file_url?: string | null;
  score?: number | null;
  keywords_count?: number;
  times_used?: number;
  created_at?: string;
  updated_at?: string;
  // ── Module 6A additive columns ──
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

export type ResumeVersionInsert = {
  id?: string;
  resume_id: string;
  version_number: number;
  content: string;
  created_at?: string;
};

export type ResumeAtsScoreInsert = {
  id?: string;
  resume_version_id: string;
  user_id: string;
  score: number;
  breakdown?: Json | null;
  created_at?: string;
};

export type InterviewInsert = {
  id?: string;
  user_id: string;
  application_id?: string | null;
  company_name: string;
  role: string;
  scheduled_at: string;
  interviewer?: string | null;
  type?: string;
  status?: string;
  link?: string | null;
  prep?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type NotificationInsert = {
  id?: string;
  user_id: string;
  type: string;
  priority?: string;
  title: string;
  body?: string | null;
  read?: boolean;
  created_at?: string;
};

export type NotificationPreferenceInsert = {
  id?: string;
  user_id: string;
  type: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type UserPreferenceInsert = {
  id?: string;
  user_id: string;
  key: string;
  value: string;
  created_at?: string;
  updated_at?: string;
};

export type AnalyticsEventInsert = {
  id?: string;
  user_id: string;
  event: string;
  properties?: Json | null;
  created_at?: string;
};

export type CommunityInsert = {
  id?: string;
  name: string;
  description?: string | null;
  member_count?: number;
  creator_id: string; // Required by RLS policy: auth.uid() = creator_id
  created_at?: string;
  updated_at?: string;
};

export type CommunityMemberInsert = {
  id?: string;
  community_id: string;
  user_id: string;
  joined_at?: string;
};

export type MessageInsert = {
  id?: string;
  community_id: string;
  user_id: string;
  body: string;
  created_at?: string;
};

// ── Database type map ─────────────────────────────────────────────────────
//
// IMPORTANT: This type must satisfy the constraint:
//   Database extends Record<string, GenericSchema>
//
// where GenericSchema = { Tables: Record<string, GenericTable>; Views: Record<string, GenericView>; Functions: Record<string, GenericFunction> }
// and   GenericTable  = { Row; Insert; Update; Relationships: GenericRelationship[] }
//
// Missing Views / Functions / Relationships previously caused every `.from()`
// call to resolve to `never`. All three fields are now present.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<ProfileRow>;
        Relationships: TableRelationship[];
      };
      companies: {
        Row: CompanyRow;
        Insert: CompanyInsert;
        Update: Partial<CompanyRow>;
        Relationships: TableRelationship[];
      };
      global_jobs: {
        Row: GlobalJobRow;
        Insert: GlobalJobInsert;
        Update: Partial<GlobalJobRow>;
        Relationships: TableRelationship[];
      };
      skills: {
        Row: SkillRow;
        Insert: SkillInsert;
        Update: Partial<SkillRow>;
        Relationships: TableRelationship[];
      };
      roles: {
        Row: RoleRow;
        Insert: RoleInsert;
        Update: Partial<RoleRow>;
        Relationships: TableRelationship[];
      };
      locations: {
        Row: LocationRow;
        Insert: LocationInsert;
        Update: Partial<LocationRow>;
        Relationships: TableRelationship[];
      };
      job_skills: {
        Row: JobSkillRow;
        Insert: JobSkillInsert;
        Update: Partial<JobSkillRow>;
        Relationships: TableRelationship[];
      };
      saved_jobs: {
        Row: SavedJobRow;
        Insert: SavedJobInsert;
        Update: Partial<SavedJobRow>;
        Relationships: TableRelationship[];
      };
      collections: {
        Row: CollectionRow;
        Insert: CollectionInsert;
        Update: Partial<CollectionRow>;
        Relationships: TableRelationship[];
      };
      collection_jobs: {
        Row: CollectionJobRow;
        Insert: CollectionJobInsert;
        Update: Partial<CollectionJobRow>;
        Relationships: TableRelationship[];
      };
      recently_viewed: {
        Row: RecentlyViewedRow;
        Insert: RecentlyViewedInsert;
        Update: Partial<RecentlyViewedRow>;
        Relationships: TableRelationship[];
      };
      applications: {
        Row: ApplicationRow;
        Insert: ApplicationInsert;
        Update: Partial<ApplicationRow>;
        Relationships: TableRelationship[];
      };
      application_activity: {
        Row: ApplicationActivityRow;
        Insert: ApplicationActivityInsert;
        Update: Partial<ApplicationActivityRow>;
        Relationships: TableRelationship[];
      };
      cover_letters: {
        Row: CoverLetterRow;
        Insert: CoverLetterInsert;
        Update: Partial<CoverLetterRow>;
        Relationships: TableRelationship[];
      };
      application_contacts: {
        Row: ApplicationContactRow;
        Insert: ApplicationContactInsert;
        Update: Partial<ApplicationContactRow>;
        Relationships: TableRelationship[];
      };
      application_reminders: {
        Row: ApplicationReminderRow;
        Insert: ApplicationReminderInsert;
        Update: Partial<ApplicationReminderRow>;
        Relationships: TableRelationship[];
      };
      application_attachments: {
        Row: ApplicationAttachmentRow;
        Insert: ApplicationAttachmentInsert;
        Update: Partial<ApplicationAttachmentRow>;
        Relationships: TableRelationship[];
      };
      resumes: {
        Row: ResumeRow;
        Insert: ResumeInsert;
        Update: Partial<ResumeRow>;
        Relationships: TableRelationship[];
      };
      resume_versions: {
        Row: ResumeVersionRow;
        Insert: ResumeVersionInsert;
        Update: Partial<ResumeVersionRow>;
        Relationships: TableRelationship[];
      };
      resume_ats_scores: {
        Row: ResumeAtsScoreRow;
        Insert: ResumeAtsScoreInsert;
        Update: Partial<ResumeAtsScoreRow>;
        Relationships: TableRelationship[];
      };
      resume_parsed: {
        Row: ResumeParsedRow;
        Insert: ResumeParsedInsert;
        Update: Partial<ResumeParsedRow>;
        Relationships: TableRelationship[];
      };
      ai_runs: {
        Row: AiRunRow;
        Insert: AiRunInsert;
        Update: Partial<AiRunRow>;
        Relationships: TableRelationship[];
      };
      ai_cache: {
        Row: AiCacheRow;
        Insert: AiCacheInsert;
        Update: Partial<AiCacheRow>;
        Relationships: TableRelationship[];
      };
      user_ai_usage: {
        Row: UserAiUsageRow;
        Insert: UserAiUsageInsert;
        Update: Partial<UserAiUsageRow>;
        Relationships: TableRelationship[];
      };
      ai_analyses: {
        Row: AiAnalysisRow;
        Insert: AiAnalysisInsert;
        Update: Partial<AiAnalysisRow>;
        Relationships: TableRelationship[];
      };
      interviews: {
        Row: InterviewRow;
        Insert: InterviewInsert;
        Update: Partial<InterviewRow>;
        Relationships: TableRelationship[];
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: Partial<NotificationRow>;
        Relationships: TableRelationship[];
      };
      notification_preferences: {
        Row: NotificationPreferenceRow;
        Insert: NotificationPreferenceInsert;
        Update: Partial<NotificationPreferenceRow>;
        Relationships: TableRelationship[];
      };
      user_preferences: {
        Row: UserPreferenceRow;
        Insert: UserPreferenceInsert;
        Update: Partial<UserPreferenceRow>;
        Relationships: TableRelationship[];
      };
      analytics_events: {
        Row: AnalyticsEventRow;
        Insert: AnalyticsEventInsert;
        Update: Partial<AnalyticsEventRow>;
        Relationships: TableRelationship[];
      };
      communities: {
        Row: CommunityRow;
        Insert: CommunityInsert;
        Update: Partial<CommunityRow>;
        Relationships: TableRelationship[];
      };
      community_members: {
        Row: CommunityMemberRow;
        Insert: CommunityMemberInsert;
        Update: Partial<CommunityMemberRow>;
        Relationships: TableRelationship[];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: Partial<MessageRow>;
        Relationships: TableRelationship[];
      };
    };
    // This project has no DB Views — satisfies GenericSchema.Views constraint
    Views: Record<string, never>;
    Functions: {
      // Find-or-create/update by (source, source_job_id) then fingerprint —
      // the only write path for global_jobs (see supabase/migrations/20260716000001_*).
      upsert_global_job: {
        Args: { payload: Json };
        Returns: GlobalJobRow;
      };
      // ── Module 6A ──
      ensure_ai_usage: {
        Args: { p_credits_total: number };
        Returns: UserAiUsageRow;
      };
      consume_ai_credit: {
        Args: { p_capability: string; p_cost: number; p_credits_total: number };
        Returns: Json;
      };
      set_default_resume: {
        Args: { p_resume_id: string };
        Returns: undefined;
      };
      // ── Module 6B ──
      refund_ai_credit: {
        Args: { p_capability: string; p_cost: number };
        Returns: Json;
      };
    };
  };
};
