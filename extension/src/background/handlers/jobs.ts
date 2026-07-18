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
import {
  findApplicationByJob,
  isJobSaved,
  saveJob,
  upsertGlobalJob,
} from "../../shared/supabase/jobs-api";

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
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const globalJob = await upsertGlobalJob(resolvedJob);

  const [saved, application] = await Promise.all([
    isJobSaved(user.id, globalJob.id),
    findApplicationByJob(user.id, globalJob.id),
  ]);

  return {
    globalJobId: globalJob.id,
    isClosed: globalJob.is_closed,
    isSaved: saved,
    application,
  };
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
