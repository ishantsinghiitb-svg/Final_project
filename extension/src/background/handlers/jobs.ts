import { DuplicateResolver } from "../../core/dedup/DuplicateResolver";
import { ManualImport, type ManualImportInput } from "../../core/manual-import/ManualImport";
import { JobNormalizer } from "../../core/normalization/JobNormalizer";
import type { UniversalJob } from "../../core/parsers/types";
import { JobValidator } from "../../core/validation/JobValidator";
import type {
  AuthUser,
  GlobalJobSyncResult,
  ImportJobUrlResult,
} from "../../shared/messaging/types";
import type { ResumeMatchSummary, ResumeOption } from "../../shared/messaging/types";
import {
  findApplicationByJob,
  isJobSaved,
  saveJob,
  upsertGlobalJob,
} from "../../shared/supabase/jobs-api";
import {
  getAiCreditsRemaining,
  getLatestResumeMatch,
  getUserResumes,
} from "../../shared/supabase/resume-match-api";

/**
 * Grows/refreshes the Global Jobs database and reports the current user's
 * relationship to the resolved job (saved? already tracked?) so the panel
 * can render the right state without a second round trip.
 *
 * Pipeline tail: the incoming job is already normalized (by the content
 * script) — here it is dedup-resolved → validated → persisted. Both the
 * extension capture path and the manual-URL importer converge on this
 * function so identity resolution and required-field checks happen once.
 */
export async function syncGlobalJob(
  job: UniversalJob,
  user: AuthUser,
): Promise<GlobalJobSyncResult> {
  const resolvedJob = await DuplicateResolver.resolve(job);

  const validation = JobValidator.validate(resolvedJob);
  console.log("[NextOffer] Validation:", validation);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const globalJob = await upsertGlobalJob(resolvedJob);

  const [saved, application, resumeContext] = await Promise.all([
    isJobSaved(user.id, globalJob.id),
    findApplicationByJob(user.id, globalJob.id),
    getResumeMatchContext(user.id, globalJob.id),
  ]);

  return {
    globalJobId: globalJob.id,
    isClosed: globalJob.is_closed,
    isSaved: saved,
    resumes: resumeContext.resumes,
    resumeMatch: resumeContext.resumeMatch,
    credits: resumeContext.credits,
    application,
  };
}

// The resume list changes rarely and is user-level (not job-level), so
// re-reading it on every job sync — as the user browses job to job — is pure
// waste. Memoize it per user for a short window. The MV3 worker is ephemeral,
// so this cache naturally lives only across an active browsing burst, which is
// exactly when back-to-back syncs happen. The match score and credits are NOT
// cached here (they must stay fresh after a dashboard analysis) — only the
// heavier resume-list query is deduped.
const RESUMES_TTL_MS = 60_000;
let resumesCache: { userId: string; resumes: ResumeOption[]; at: number } | null = null;

async function getCachedUserResumes(userId: string): Promise<ResumeOption[]> {
  const now = Date.now();
  if (resumesCache && resumesCache.userId === userId && now - resumesCache.at < RESUMES_TTL_MS) {
    return resumesCache.resumes;
  }
  const resumes = await getUserResumes(userId);
  resumesCache = { userId, resumes, at: now };
  return resumes;
}

/**
 * The user's ready resumes + the cached match for the first (default) one +
 * remaining AI credits — never generates an analysis (Module 6B/6C).
 * Best-effort: a resume-match/credits lookup failure (e.g. the migration not
 * yet applied in this environment) must NEVER break job save/track, so this
 * swallows errors and reports an empty context rather than throwing. The
 * resume list is memoized (see above); credits and the per-job match are read
 * fresh so a dashboard analysis reflects immediately.
 */
async function getResumeMatchContext(
  userId: string,
  globalJobId: string,
): Promise<{
  resumes: ResumeOption[];
  resumeMatch: ResumeMatchSummary | null;
  credits: number | null;
}> {
  try {
    const [resumes, credits] = await Promise.all([
      getCachedUserResumes(userId),
      getAiCreditsRemaining().catch(() => null),
    ]);
    if (resumes.length === 0) return { resumes, resumeMatch: null, credits };
    const resumeMatch = await getLatestResumeMatch(resumes[0].id, globalJobId);
    return { resumes, resumeMatch, credits };
  } catch {
    return { resumes: [], resumeMatch: null, credits: null };
  }
}

/**
 * Cached match for one specific (resume, job) — the read behind the panel's
 * resume selector. Read-only, best-effort; returns null on any failure or
 * when that resume has no analysis for this job yet.
 */
export async function getResumeMatchForResume(
  resumeId: string,
  globalJobId: string,
): Promise<ResumeMatchSummary | null> {
  try {
    return await getLatestResumeMatch(resumeId, globalJobId);
  } catch {
    return null;
  }
}

/** Saves an already-synced Global Job to the user's dashboard. Never duplicates (unique on user_id+job_id). */
export async function saveGlobalJob(globalJobId: string, user: AuthUser): Promise<void> {
  await saveJob(user.id, globalJobId);
}

/**
 * Manual URL import (extension popup). Assembles a minimal job from the URL +
 * user-typed identity fields and runs the SAME
 * ManualImport → Normalizer → Validator → DuplicateResolver → upsert pipeline
 * as extension capture — so importing a URL whose job was already captured
 * resolves to the existing Global Job (by external id or fingerprint) rather
 * than creating a duplicate.
 */
export async function importJobFromUrl(input: ManualImportInput): Promise<ImportJobUrlResult> {
  const normalized = JobNormalizer.normalize(ManualImport.build(input));
  const resolved = await DuplicateResolver.resolve(normalized);

  const validation = JobValidator.validate(resolved);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const globalJob = await upsertGlobalJob(resolved);

  return {
    globalJobId: globalJob.id,
    source: globalJob.source,
    parserConfidence: resolved.parserConfidence,
    warnings: resolved.extractionWarnings,
  };
}
