import { FingerprintGenerator } from "../../core/fingerprint/FingerprintGenerator";
import type { NormalizedJob } from "../../core/parsers/types";
import { JobValidator } from "../../core/validation/JobValidator";
import type { AuthUser, GlobalJobSyncResult } from "../../shared/messaging/types";
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
 */
export async function syncGlobalJob(
  job: NormalizedJob,
  user: AuthUser,
): Promise<GlobalJobSyncResult> {
  const resolvedJob: NormalizedJob = job.sourceJobId
    ? job
    : {
        ...job,
        fingerprint: await FingerprintGenerator.generate(job.title, job.companyName, job.location),
      };

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
