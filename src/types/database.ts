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
  created_at: string;
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
  created_at: string;
  updated_at: string;
};

export type ApplicationActivityRow = {
  id: string;
  application_id: string;
  user_id: string;
  kind: string;
  text: string;
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
  id: string;                  // Required — must match auth.users.id; no DEFAULT
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
  name: string;               // NOT NULL, no DEFAULT
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
  company_name: string;       // NOT NULL, no DEFAULT
  role: string;               // NOT NULL, no DEFAULT
  role_id?: string | null;
  location_id?: string | null;
  location?: string | null;
  remote?: boolean;           // NOT NULL DEFAULT false
  work_mode?: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  description?: string | null;
  url?: string | null;
  source?: string;            // NOT NULL DEFAULT 'Manual'
  posted_at?: string | null;
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
  user_id: string;            // NOT NULL
  job_id: string;             // NOT NULL
  notes?: string | null;
  created_at?: string;
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
  created_at?: string;
  updated_at?: string;
};

export type ApplicationActivityInsert = {
  id?: string;
  application_id: string;
  user_id: string;
  kind: string;
  text: string;
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
  creator_id: string;         // Required by RLS policy: auth.uid() = creator_id
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
    // This project has no DB Functions — satisfies GenericSchema.Functions constraint
    Functions: Record<string, never>;
  };
};
