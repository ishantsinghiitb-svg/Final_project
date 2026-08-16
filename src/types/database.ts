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
  /** Module 8A goal targets — null means "use the recommended default". */
  goal_applications: number | null;
  goal_interviews: number | null;
  goal_offers: number | null;
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
  /** Module 11A: stable identity/conflict key — see companies_set_normalized_key_trigger. */
  normalized_key: string | null;
  /** Module 11A: other known names for this entity. */
  aliases: string[];
  /** Module 11A: lowercased, www.-stripped hostname, when known. */
  domain: string | null;
  /** Module 11A: 'job_scraped' | 'domain_favicon' | null. */
  logo_source: string | null;
  /** Module 11A: when the domain-based logo fallback last attempted this company. */
  logo_checked_at: string | null;
};

export type GlobalJobRow = {
  /** Module 10B.2: most recent crawl that observed this job live. Drives 30-day active visibility. */
  last_seen_at: string | null;
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
  // ── Module 10A: Job Intelligence Foundation additions ──
  tags: string[] | null;
  normalized_company: string | null;
  normalized_role: string | null;
  /** Trigger-maintained tsvector column — never written by app code, only read via full-text queries. */
  search_vector: unknown | null;
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
  /** How this row was created — 'apply_flow' (via a GlobalJob), 'manual', or 'gmail'. */
  created_via: string;
  /** Free-form extension point (recruiter, hiring manager, referral, reminder, etc.) — see Module 3A schema notes. */
  metadata: Json;
  notes_updated_at: string | null;
  priority: string | null;
  resume_id: string | null;
  cover_letter_id: string | null;
  /** Module 9A/9B — the suggestion (Gmail- or Calendar-derived) that created/updated this row, if any. */
  source_suggestion_id: string | null;
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
  refunded_at: string | null;
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
  refunded_at?: string | null;
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

// ── Module 13 · Phase 2 (B2): resume-parse rate limit / daily quota ──
export type ResumeParseUsageRow = {
  user_id: string;
  window_started_at: string;
  window_count: number;
  day_bucket: string;
  day_count: number;
  updated_at: string;
};

export type ResumeParseUsageInsert = {
  user_id: string;
  window_started_at?: string;
  window_count?: number;
  day_bucket?: string;
  day_count?: number;
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
  // ── Module 6D: optimizer version metadata (additive, nullable) ──
  name: string | null;
  source: string | null;
  category: string | null;
  analysis_id: string | null;
  // ── Module 6E: durable optimizer change history (additive, nullable) ──
  optimization: Json | null;
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
  mode: string;
  location: string | null;
  resume_id: string | null;
  resume_name_snapshot: string | null;
  job_id: string | null;
  notes: string | null;
  /** Module 9A/9B — the suggestion (Gmail- or Calendar-derived) that created/updated this row, if any. */
  source_suggestion_id: string | null;
  /** Module 9B — the calendar_events row this interview is linked to, if any. */
  calendar_event_id: string | null;
  /** 'manual' | 'gmail' | 'calendar' | 'both' */
  source: string;
  /** True once the user hand-edits scheduled_at/mode/link/location — sync then stops silently overwriting them. */
  calendar_fields_locked: boolean;
  last_calendar_sync_at: string | null;
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
  goal_applications?: number | null;
  goal_interviews?: number | null;
  goal_offers?: number | null;
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
  normalized_key?: string | null; // nullable in the DB, defaulted by trigger when omitted
  aliases?: string[]; // NOT NULL DEFAULT '{}'
  domain?: string | null;
  logo_source?: string | null;
  logo_checked_at?: string | null;
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
  // ── Module 10A: Job Intelligence Foundation additions ──
  tags?: string[] | null;
  normalized_company?: string | null;
  normalized_role?: string | null;
  // search_vector is maintained by a BEFORE INSERT OR UPDATE trigger —
  // deliberately omitted here so app code can never write it by hand.
  created_at?: string;
  updated_at?: string;
};

export type SkillInsert = {
  id?: string;
  name: string;
  category?: string | null;
  created_at?: string;
};

// ── Module 10A: job_sources ──
// Retains every contributing platform's (source, source_job_id, source_url,
// url) for a canonical global_jobs row — see the Module 10A migration.
export type JobSourceRow = {
  id: string;
  job_id: string;
  source: string;
  source_job_id: string | null;
  source_url: string | null;
  url: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type JobSourceInsert = {
  id?: string;
  job_id: string;
  source: string;
  source_job_id?: string | null;
  source_url?: string | null;
  url?: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
};

// ── Module 10B.1: crawl_company_registry ──
// The Company Registry the crawl orchestrator iterates. Crawl targets are
// data, not code — see the Module 10B.1 migration.
export type CrawlCompanyRegistryRow = {
  id: string;
  company_name: string;
  careers_url: string;
  platform: string;
  enabled: boolean;
  crawl_frequency_hours: number;
  last_crawl_at: string | null;
  last_success_at: string | null;
  last_status: "success" | "partial" | "failed" | "skipped" | null;
  last_error: string | null;
  last_jobs_imported: number | null;
  notes: string | null;
  /** Adapter-specific overrides (board token, feed category, …). `{}` when unused. */
  config: Json;
  created_at: string;
  updated_at: string;

  // ── Module 10B.1.5: identity + source health ──
  // Health tracks whether the URL is a working jobs source; the `last_*`
  // columns above track whether the last CRAWL worked. Different facts.
  parent_company: string | null;
  aliases: string[] | null;
  health_status: "HEALTHY" | "REDIRECTED" | "BLOCKED" | "BROKEN" | "UNAVAILABLE" | "UNKNOWN" | null;
  last_checked_at: string | null;
  last_health_success_at: string | null;
  last_failure_at: string | null;
  http_status: number | null;
  detected_platform: string | null;
  error_reason: string | null;
  resolved_url: string | null;
  postings_seen: number | null;
};

export type SourceVerificationRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  status: "running" | "completed" | "failed";
  sources_checked: number;
  healthy: number;
  redirected: number;
  blocked: number;
  broken: number;
  unavailable: number;
  unknown: number;
  report: Json;
  error: string | null;
};

export type SourceVerificationRunInsert = {
  id?: string;
  started_at?: string;
  finished_at?: string | null;
  duration_ms?: number | null;
  triggered_by?: string | null;
  status?: "running" | "completed" | "failed";
  sources_checked?: number;
  healthy?: number;
  redirected?: number;
  blocked?: number;
  broken?: number;
  unavailable?: number;
  unknown?: number;
  report?: Json;
  error?: string | null;
};

export type CrawlCompanyRegistryInsert = {
  id?: string;
  company_name: string;
  careers_url: string;
  platform: string;
  enabled?: boolean;
  crawl_frequency_hours?: number;
  last_crawl_at?: string | null;
  last_success_at?: string | null;
  last_status?: "success" | "partial" | "failed" | "skipped" | null;
  last_error?: string | null;
  last_jobs_imported?: number | null;
  notes?: string | null;
  config?: Json;
  created_at?: string;
  updated_at?: string;
};

// ── Module 10B.1: crawl_runs ──
// One row per crawl (live or dry run) holding its report, so "View Last Crawl
// Report" survives a reload. Counters are denormalized out of `report` so the
// admin list renders without parsing jsonb.
export type CrawlRunRow = {
  id: string;
  mode: "live" | "dry_run";
  scope: "platform" | "all";
  platform: string | null;
  triggered_by: string | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  companies_scanned: number;
  jobs_discovered: number;
  jobs_parsed: number;
  jobs_imported: number;
  jobs_updated: number;
  jobs_duplicates: number;
  /** Module 10B.2: validator refusals, distinct from crawler-side skips. */
  jobs_rejected: number;
  jobs_skipped: number;
  jobs_failed: number;
  report: Json;
  error: string | null;
};

export type CrawlRunInsert = {
  id?: string;
  mode: "live" | "dry_run";
  scope: "platform" | "all";
  platform?: string | null;
  triggered_by?: string | null;
  status?: "running" | "completed" | "failed";
  started_at?: string;
  finished_at?: string | null;
  duration_ms?: number | null;
  companies_scanned?: number;
  jobs_discovered?: number;
  jobs_parsed?: number;
  jobs_imported?: number;
  jobs_updated?: number;
  jobs_duplicates?: number;
  jobs_skipped?: number;
  jobs_failed?: number;
  report?: Json;
  error?: string | null;
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
  source_suggestion_id?: string | null;
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
  // ── Module 6E: Cover Letter Studio document metadata (additive, nullable/defaulted) ──
  /** 'upload' (Module 3B) | 'studio' */
  source: string;
  content: string | null;
  job_id: string | null;
  resume_id: string | null;
  company_name: string | null;
  role_title: string | null;
  tone: string | null;
  length: string | null;
  custom_instructions: string | null;
  /** 'draft' | 'final' | 'downloaded' */
  status: string;
  current_version_id: string | null;
  word_count: number | null;
  last_edited_at: string | null;
  downloaded_at: string | null;
  // ── Module 6E: editing session model (foundation refinement) ──
  /** Non-null while a paid-for AI editing session is active — see CoverLetterAIService. */
  ai_session_id: string | null;
  ai_session_started_at: string | null;
  /** Free actions spent on the current session — see COVER_LETTER_MAX_SESSION_ACTIONS. */
  ai_action_count: number;
};

export type CoverLetterInsert = {
  id?: string;
  user_id: string;
  name: string;
  version_number?: number;
  file_url?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: string;
  content?: string | null;
  job_id?: string | null;
  resume_id?: string | null;
  company_name?: string | null;
  role_title?: string | null;
  tone?: string | null;
  length?: string | null;
  custom_instructions?: string | null;
  status?: string;
  current_version_id?: string | null;
  word_count?: number | null;
  last_edited_at?: string | null;
  downloaded_at?: string | null;
  ai_session_id?: string | null;
  ai_session_started_at?: string | null;
  ai_action_count?: number;
};

// ── Module 6E: Cover Letter Studio version history (append-only) ──

export type CoverLetterVersionRow = {
  id: string;
  cover_letter_id: string;
  user_id: string;
  version_number: number;
  content: string;
  label: string | null;
  /** 'generate' | 'ai_action' | 'manual' | 'duplicate' | 'restore' */
  source: string;
  ai_action: string | null;
  tone: string | null;
  length: string | null;
  custom_instructions: string | null;
  analysis_id: string | null;
  model: string | null;
  prompt_version: string | null;
  analysis_version: string | null;
  word_count: number | null;
  created_at: string;
};

export type CoverLetterVersionInsert = {
  id?: string;
  cover_letter_id: string;
  user_id: string;
  version_number: number;
  content: string;
  label?: string | null;
  source?: string;
  ai_action?: string | null;
  tone?: string | null;
  length?: string | null;
  custom_instructions?: string | null;
  analysis_id?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  analysis_version?: string | null;
  word_count?: number | null;
  created_at?: string;
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
  /** Module 9B — nullable now that a reminder can hang off a standalone interview instead. At least one of application_id/interview_id is always set (DB CHECK). */
  application_id: string | null;
  /** Module 9B — direct link for reminders on a standalone (non-application-linked) interview. */
  interview_id: string | null;
  user_id: string;
  /** 'follow_up' | 'interview' | 'oa_deadline' | 'offer_expiry' | 'custom' */
  type: string;
  title: string;
  remind_at: string;
  note: string | null;
  completed: boolean;
  completed_at: string | null;
  /** Module 9A/9B — the suggestion (Gmail- or Calendar-derived) that created this row, if any. */
  source_suggestion_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationReminderInsert = {
  id?: string;
  application_id?: string | null;
  interview_id?: string | null;
  user_id: string;
  type: string;
  title: string;
  remind_at: string;
  note?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  source_suggestion_id?: string | null;
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
  /** Module 9A/9B — the suggestion (Gmail- or Calendar-derived) that created this row, if any. */
  source_suggestion_id: string | null;
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
  source_suggestion_id?: string | null;
  created_at?: string;
};

// ── Module 9A/9B: Gmail + Calendar Intelligence ──
//
// One Google OAuth connection per user (google_connections, née
// gmail_connections) now carries two independently-grantable, incrementally
// authorized scopes. Engine-state columns are split gmail_*/calendar_*;
// identity/token columns (google_email, scope, refresh token) stay shared.

export type GoogleConnectionRow = {
  id: string;
  user_id: string;
  google_email: string;
  /** The full space-separated scope string Google last granted — may cover one or both products. */
  scope: string;
  /** Never select this in a client-facing query — ciphertext only, decrypted server-side via TokenCrypto.ts. */
  refresh_token_ciphertext: string;
  refresh_token_nonce: string;
  connected_at: string;

  /** Target checkpoint captured at connect time — only valid as an incremental sync starting point once gmail_backfill_complete is true. */
  gmail_history_id: string | null;
  gmail_backfill_complete: boolean;
  gmail_backfill_page_token: string | null;
  /** 'connected' | 'syncing' | 'disconnected' | 'error' | 'needs_reauth' */
  gmail_status: string;
  gmail_auto_sync_enabled: boolean;
  gmail_last_synced_at: string | null;
  gmail_last_sync_error: string | null;
  gmail_next_sync_at: string | null;
  gmail_sync_lock_acquired_at: string | null;

  /** 'connected' | 'syncing' | 'disconnected' | 'error' | 'needs_reauth' */
  calendar_status: string;
  calendar_auto_sync_enabled: boolean;
  calendar_last_synced_at: string | null;
  calendar_last_sync_error: string | null;
  calendar_next_sync_at: string | null;
  calendar_sync_lock_acquired_at: string | null;

  created_at: string;
  updated_at: string;
};

export type GoogleConnectionInsert = {
  id?: string;
  user_id: string;
  google_email: string;
  scope: string;
  refresh_token_ciphertext: string;
  refresh_token_nonce: string;
  connected_at?: string;

  gmail_history_id?: string | null;
  gmail_backfill_complete?: boolean;
  gmail_backfill_page_token?: string | null;
  gmail_status?: string;
  gmail_auto_sync_enabled?: boolean;
  gmail_last_synced_at?: string | null;
  gmail_last_sync_error?: string | null;
  gmail_next_sync_at?: string | null;
  gmail_sync_lock_acquired_at?: string | null;

  calendar_status?: string;
  calendar_auto_sync_enabled?: boolean;
  calendar_last_synced_at?: string | null;
  calendar_last_sync_error?: string | null;
  calendar_next_sync_at?: string | null;
  calendar_sync_lock_acquired_at?: string | null;

  created_at?: string;
  updated_at?: string;
};

export type GmailMessageRow = {
  id: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_address: string;
  from_domain: string;
  subject: string | null;
  /** Gmail's own pre-truncated snippet — the full email body is never persisted. */
  snippet: string | null;
  company_name: string | null;
  internal_date: string;
  /** one of the 10 classification categories, or 'unknown' */
  category: string;
  confidence: number;
  /** 'rule' | 'ai' */
  classified_by: string;
  matched_application_id: string | null;
  /** Gmail UNREAD state at first sync — a snapshot, not live. NULL = predates the column. */
  is_unread: boolean | null;
  /** Module 9B — parsed from a .ics attachment for interview-category messages. Strongest merge key against a calendar_events row. */
  ical_uid: string | null;
  processed_at: string;
  created_at: string;
};

export type GmailMessageInsert = {
  id?: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_address: string;
  from_domain: string;
  subject?: string | null;
  snippet?: string | null;
  company_name?: string | null;
  internal_date: string;
  category?: string;
  confidence?: number;
  classified_by: string;
  matched_application_id?: string | null;
  is_unread?: boolean | null;
  ical_uid?: string | null;
  processed_at?: string;
  created_at?: string;
};

// ── suggestions (née gmail_suggestions) ──
// Generalized to carry either a Gmail message or a calendar event, or both
// when the two sources corroborate the same interview. No stored `source`
// column — derived at read time from which FK is present (see
// SuggestionRepository), so it can never drift from the data it describes.
export type SuggestionRow = {
  id: string;
  user_id: string;
  gmail_message_id: string | null;
  calendar_event_id: string | null;
  /** 'create_application' | 'update_application' | 'create_interview' | 'add_reminder' | 'import_attachment' */
  type: string;
  /** 'pending' | 'accepted' | 'dismissed' | 'expired' | 'superseded' */
  status: string;
  confidence: number;
  /** Human-readable "why this was detected" — always shown in the UI. */
  explanation: string;
  target_application_id: string | null;
  suggested_payload: Json;
  resolved_at: string | null;
  /** 'accepted' | 'dismissed' | null */
  resolved_action: string | null;
  created_at: string;
  updated_at: string;
};

export type SuggestionInsert = {
  id?: string;
  user_id: string;
  gmail_message_id?: string | null;
  calendar_event_id?: string | null;
  type: string;
  status?: string;
  confidence?: number;
  explanation: string;
  target_application_id?: string | null;
  suggested_payload?: Json;
  resolved_at?: string | null;
  resolved_action?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ── Module 9B: Calendar Intelligence ──

export type CalendarSyncStateRow = {
  id: string;
  user_id: string;
  google_calendar_id: string;
  sync_token: string | null;
  page_token: string | null;
  window_start: string | null;
  window_end: string | null;
  backfill_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type CalendarSyncStateInsert = {
  id?: string;
  user_id: string;
  google_calendar_id?: string;
  sync_token?: string | null;
  page_token?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  backfill_complete?: boolean;
  created_at?: string;
  updated_at?: string;
};

/** Candidate ledger, mirrors gmail_messages — only events that pass the relevance gate (Tier 1-3) are ever written here. */
export type CalendarEventRow = {
  id: string;
  user_id: string;
  google_calendar_id: string;
  google_event_id: string;
  ical_uid: string | null;
  recurring_event_id: string | null;
  title: string | null;
  description_snippet: string | null;
  location: string | null;
  meeting_link: string | null;
  organizer_email: string | null;
  organizer_name: string | null;
  attendee_emails: Json;
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  event_timezone: string | null;
  /** 'confirmed' | 'tentative' | 'cancelled' */
  google_status: string;
  /** 'needsAction' | 'declined' | 'tentative' | 'accepted' | null */
  self_response_status: string | null;
  etag: string | null;
  google_updated_at: string | null;
  /** 'tier_1' | 'tier_2' | 'tier_3' */
  relevance_tier: string;
  confidence: number;
  /** 'rule' | 'ai' */
  classified_by: string;
  matched_application_id: string | null;
  matched_interview_id: string | null;
  /** Dismiss/delete tombstone — set once the resulting suggestion is dismissed or its interview deleted, so it's never re-suggested. */
  ignored_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type CalendarEventInsert = {
  id?: string;
  user_id: string;
  google_calendar_id?: string;
  google_event_id: string;
  ical_uid?: string | null;
  recurring_event_id?: string | null;
  title?: string | null;
  description_snippet?: string | null;
  location?: string | null;
  meeting_link?: string | null;
  organizer_email?: string | null;
  organizer_name?: string | null;
  attendee_emails?: Json;
  starts_at: string;
  ends_at?: string | null;
  is_all_day?: boolean;
  event_timezone?: string | null;
  google_status?: string;
  self_response_status?: string | null;
  etag?: string | null;
  google_updated_at?: string | null;
  relevance_tier: string;
  confidence?: number;
  classified_by: string;
  matched_application_id?: string | null;
  matched_interview_id?: string | null;
  ignored_at?: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
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
  // ── Module 6D: optimizer version metadata (additive, nullable) ──
  name?: string | null;
  source?: string | null;
  category?: string | null;
  analysis_id?: string | null;
  // ── Module 6E: durable optimizer change history (additive, nullable) ──
  optimization?: Json | null;
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
  mode?: string;
  location?: string | null;
  resume_id?: string | null;
  resume_name_snapshot?: string | null;
  job_id?: string | null;
  notes?: string | null;
  source_suggestion_id?: string | null;
  calendar_event_id?: string | null;
  source?: string;
  calendar_fields_locked?: boolean;
  last_calendar_sync_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ── Module 7B: Interview Preparation ──

export type InterviewPrepRow = {
  id: string;
  interview_id: string;
  user_id: string;
  manual_job_description: string | null;
  manual_company_description: string | null;
  additional_context: string | null;
  content: Json | null;
  reasoning: Json | null;
  model: string | null;
  prompt_version: string | null;
  analysis_version: string | null;
  resume_file_hash: string | null;
  job_hash: string | null;
  input_hash: string | null;
  /** Frozen resume/job input that produced `content` — see InterviewPrepAIService's InterviewPrepInputSnapshot. Module 7E. */
  input_snapshot: Json | null;
  ai_session_id: string | null;
  ai_session_started_at: string | null;
  /** Free actions spent on the current session — see INTERVIEW_PREP_MAX_SESSION_ACTIONS. */
  ai_action_count: number;
  progress: Json;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewPrepInsert = {
  id?: string;
  interview_id: string;
  user_id: string;
  manual_job_description?: string | null;
  manual_company_description?: string | null;
  additional_context?: string | null;
  content?: Json | null;
  reasoning?: Json | null;
  model?: string | null;
  prompt_version?: string | null;
  analysis_version?: string | null;
  resume_file_hash?: string | null;
  job_hash?: string | null;
  input_hash?: string | null;
  input_snapshot?: Json | null;
  ai_session_id?: string | null;
  ai_session_started_at?: string | null;
  ai_action_count?: number;
  progress?: Json;
  generated_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InterviewPrepAnswerRow = {
  id: string;
  interview_prep_id: string;
  user_id: string;
  question_id: string;
  answer: string;
  ai_generated: boolean;
  last_generated_at: string | null;
  edited_at: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewPrepAnswerInsert = {
  id?: string;
  interview_prep_id: string;
  user_id: string;
  question_id: string;
  answer?: string;
  ai_generated?: boolean;
  last_generated_at?: string | null;
  edited_at?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ── Module 7C: AI Mock Interview Studio ──

export type MockInterviewSessionRow = {
  id: string;
  interview_id: string;
  user_id: string;
  client_key: string;
  interviewer_role: string;
  interviewer_role_label: string;
  role_family: string;
  round_label: string | null;
  focus: string | null;
  manual_job_description: string | null;
  manual_company_description: string | null;
  plan: Json | null;
  plan_reasoning: Json | null;
  status: string;
  ended_reason: string | null;
  started_at: string;
  elapsed_ms: number;
  last_resumed_at: string | null;
  ended_at: string | null;
  turn_count: number;
  coverage: Json;
  rolling_summary: string | null;
  report: Json | null;
  report_reasoning: Json | null;
  report_generated_at: string | null;
  report_attempts: number;
  model: string | null;
  prompt_version: string | null;
  analysis_version: string | null;
  resume_file_hash: string | null;
  job_hash: string | null;
  credits_charged: number;
  created_at: string;
  updated_at: string;
};

export type MockInterviewSessionInsert = {
  id?: string;
  interview_id: string;
  user_id: string;
  client_key: string;
  interviewer_role: string;
  interviewer_role_label: string;
  role_family: string;
  round_label?: string | null;
  focus?: string | null;
  manual_job_description?: string | null;
  manual_company_description?: string | null;
  plan?: Json | null;
  plan_reasoning?: Json | null;
  status?: string;
  ended_reason?: string | null;
  started_at?: string;
  elapsed_ms?: number;
  last_resumed_at?: string | null;
  ended_at?: string | null;
  turn_count?: number;
  coverage?: Json;
  rolling_summary?: string | null;
  report?: Json | null;
  report_reasoning?: Json | null;
  report_generated_at?: string | null;
  report_attempts?: number;
  model?: string | null;
  prompt_version?: string | null;
  analysis_version?: string | null;
  resume_file_hash?: string | null;
  job_hash?: string | null;
  credits_charged?: number;
  created_at?: string;
  updated_at?: string;
};

export type MockInterviewTurnRow = {
  id: string;
  session_id: string;
  user_id: string;
  turn_index: number;
  interviewer_message: string;
  action: string | null;
  target_competency: string | null;
  references_turn: number | null;
  candidate_answer: string | null;
  answer_input_mode: string | null;
  answered_at: string | null;
  evaluation: Json | null;
  created_at: string;
  updated_at: string;
};

export type MockInterviewTurnInsert = {
  id?: string;
  session_id: string;
  user_id: string;
  turn_index: number;
  interviewer_message: string;
  action?: string | null;
  target_competency?: string | null;
  references_turn?: number | null;
  candidate_answer?: string | null;
  answer_input_mode?: string | null;
  answered_at?: string | null;
  evaluation?: Json | null;
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
      job_sources: {
        Row: JobSourceRow;
        Insert: JobSourceInsert;
        Update: Partial<JobSourceRow>;
        Relationships: TableRelationship[];
      };
      // ── Module 10B.1 ──
      crawl_company_registry: {
        Row: CrawlCompanyRegistryRow;
        Insert: CrawlCompanyRegistryInsert;
        Update: Partial<CrawlCompanyRegistryRow>;
        Relationships: TableRelationship[];
      };
      source_verification_runs: {
        Row: SourceVerificationRunRow;
        Insert: SourceVerificationRunInsert;
        Update: Partial<SourceVerificationRunRow>;
        Relationships: TableRelationship[];
      };
      crawl_runs: {
        Row: CrawlRunRow;
        Insert: CrawlRunInsert;
        Update: Partial<CrawlRunRow>;
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
      cover_letter_versions: {
        Row: CoverLetterVersionRow;
        Insert: CoverLetterVersionInsert;
        Update: Partial<CoverLetterVersionRow>;
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
      google_connections: {
        Row: GoogleConnectionRow;
        Insert: GoogleConnectionInsert;
        Update: Partial<GoogleConnectionRow>;
        Relationships: TableRelationship[];
      };
      gmail_messages: {
        Row: GmailMessageRow;
        Insert: GmailMessageInsert;
        Update: Partial<GmailMessageRow>;
        Relationships: TableRelationship[];
      };
      suggestions: {
        Row: SuggestionRow;
        Insert: SuggestionInsert;
        Update: Partial<SuggestionRow>;
        Relationships: TableRelationship[];
      };
      calendar_sync_state: {
        Row: CalendarSyncStateRow;
        Insert: CalendarSyncStateInsert;
        Update: Partial<CalendarSyncStateRow>;
        Relationships: TableRelationship[];
      };
      calendar_events: {
        Row: CalendarEventRow;
        Insert: CalendarEventInsert;
        Update: Partial<CalendarEventRow>;
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
      resume_parse_usage: {
        Row: ResumeParseUsageRow;
        Insert: ResumeParseUsageInsert;
        Update: Partial<ResumeParseUsageRow>;
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
      interview_preps: {
        Row: InterviewPrepRow;
        Insert: InterviewPrepInsert;
        Update: Partial<InterviewPrepRow>;
        Relationships: TableRelationship[];
      };
      interview_prep_answers: {
        Row: InterviewPrepAnswerRow;
        Insert: InterviewPrepAnswerInsert;
        Update: Partial<InterviewPrepAnswerRow>;
        Relationships: TableRelationship[];
      };
      mock_interview_sessions: {
        Row: MockInterviewSessionRow;
        Insert: MockInterviewSessionInsert;
        Update: Partial<MockInterviewSessionRow>;
        Relationships: TableRelationship[];
      };
      mock_interview_turns: {
        Row: MockInterviewTurnRow;
        Insert: MockInterviewTurnInsert;
        Update: Partial<MockInterviewTurnRow>;
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
        Args: { p_ai_run_id: string };
        Returns: Json;
      };
      // ── Module 10A: admin-only manual crawl write path (service_role only) ──
      admin_upsert_global_job: {
        Args: { payload: Json };
        Returns: Json; // { id: string; created: boolean }
      };
      // ── Module 13 · Phase 2 (B2): resume-parse rate limit / daily quota ──
      check_resume_parse_rate_limit: {
        Args: {
          p_window_seconds: number;
          p_window_max: number;
          p_daily_limit_free: number;
          p_daily_limit_paid: number;
        };
        Returns: Json;
      };
      record_resume_parse_success: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
  };
};
