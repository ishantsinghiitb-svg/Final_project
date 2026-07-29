-- ── Module 6E: AI Cover Letter Studio — editing session model ──
--
-- Purely additive on top of 20260730000001_module6e_cover_letter_studio.sql.
--
-- Foundation refinement: replaces "one credit per AI call" with "one credit
-- per editing session". Generating a letter (or explicitly regenerating the
-- entire letter) opens a session and charges one credit; every other AI
-- action performed on that document while the session is active — rewrite a
-- section, change tone/length, grammar, persuasive, simplify, highlight
-- achievements, explain AI decisions — reuses the same session and is free.
--
-- `ai_session_id` is the authoritative, server-checked marker of "this
-- document has an active, paid-for session" (see CoverLetterAIService). A
-- null value means no session has been opened yet — free actions are refused
-- until a session exists, so a client can never manufacture free access.

ALTER TABLE cover_letters
  ADD COLUMN IF NOT EXISTS ai_session_id uuid,
  ADD COLUMN IF NOT EXISTS ai_session_started_at timestamptz;
