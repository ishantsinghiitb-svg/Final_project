-- ── Performance Indexes ──
-- Optimized for millions of records.

-- ── companies ──
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies (industry);

-- ── global_jobs ──
CREATE INDEX IF NOT EXISTS idx_global_jobs_company_id ON global_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_global_jobs_role ON global_jobs (role);
CREATE INDEX IF NOT EXISTS idx_global_jobs_location ON global_jobs (location);
CREATE INDEX IF NOT EXISTS idx_global_jobs_source ON global_jobs (source);
CREATE INDEX IF NOT EXISTS idx_global_jobs_posted_at ON global_jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_jobs_created_at ON global_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_jobs_remote ON global_jobs (remote);
CREATE INDEX IF NOT EXISTS idx_global_jobs_work_mode ON global_jobs (work_mode);
CREATE INDEX IF NOT EXISTS idx_global_jobs_employment_type ON global_jobs (employment_type);
CREATE INDEX IF NOT EXISTS idx_global_jobs_role_location ON global_jobs (role, location);
CREATE INDEX IF NOT EXISTS idx_global_jobs_company_role ON global_jobs (company_id, role);

-- ── job_skills ──
CREATE INDEX IF NOT EXISTS idx_job_skills_job_id ON job_skills (job_id);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill_id ON job_skills (skill_id);

-- ── saved_jobs ──
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job_id ON saved_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_created ON saved_jobs (user_id, created_at DESC);

-- ── applications ──
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_user_created ON applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications (applied_at DESC);

-- ── application_activity ──
CREATE INDEX IF NOT EXISTS idx_application_activity_application_id ON application_activity (application_id);
CREATE INDEX IF NOT EXISTS idx_application_activity_user_id ON application_activity (user_id);
CREATE INDEX IF NOT EXISTS idx_application_activity_created_at ON application_activity (created_at DESC);

-- ── resumes ──
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes (user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON resumes (user_id, created_at DESC);

-- ── resume_versions ──
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_id ON resume_versions (resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_created_at ON resume_versions (created_at DESC);

-- ── resume_ats_scores ──
CREATE INDEX IF NOT EXISTS idx_resume_ats_scores_resume_version_id ON resume_ats_scores (resume_version_id);
CREATE INDEX IF NOT EXISTS idx_resume_ats_scores_user_id ON resume_ats_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_resume_ats_scores_created_at ON resume_ats_scores (created_at DESC);

-- ── interviews ──
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews (user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews (application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_user_scheduled ON interviews (user_id, scheduled_at);

-- ── notifications ──
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- ── notification_preferences ──
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences (user_id);

-- ── user_preferences ──
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences (user_id);

-- ── analytics_events ──
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events (event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_event ON analytics_events (user_id, event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events (created_at DESC);

-- ── community_members ──
CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user_id ON community_members (user_id);

-- ── messages ──
CREATE INDEX IF NOT EXISTS idx_messages_community_id ON messages (community_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);
