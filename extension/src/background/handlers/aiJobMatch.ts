import type { AnalyzeMatchResult, UploadResumeResult } from "../../shared/messaging/types";
import { analyzeMatchDirect, parseResumeDirect } from "../../shared/extensionApiClient";
import { uploadResumeFile } from "../../shared/supabase/resume-upload-api";
import { getStoredSession } from "../../shared/supabase/session-store";
import { getAuthState } from "./auth";

/**
 * A validated (refreshed-if-needed), currently-stored access token — reads
 * through `getAuthState()` first so an expired token is refreshed and
 * re-persisted before this returns, then reads the (now-current) token back
 * out of storage. `null` when signed out.
 */
async function getValidAccessToken(): Promise<string | null> {
  const auth = await getAuthState();
  if (!auth.authenticated) return null;
  const stored = await getStoredSession();
  return stored?.accessToken ?? null;
}

/** Runs the analysis directly (Module 6C) — no dashboard visit required. */
export async function analyzeMatch(
  resumeId: string,
  globalJobId: string,
  forceRefresh: boolean,
): Promise<AnalyzeMatchResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { ok: false, code: "not_authenticated", message: "Please sign in to NextOffer." };
  }
  const result = await analyzeMatchDirect(accessToken, resumeId, globalJobId, forceRefresh);
  if (!result.ok) {
    return { ok: false, code: result.code ?? "error", message: result.message };
  }
  return {
    ok: true,
    score: result.score,
    label: result.label,
    creditsRemaining: result.creditsRemaining,
  };
}

/** Uploads + parses a resume directly (Module 6C) — storage/DB write here, parsing via the server route. */
export async function uploadResume(
  name: string,
  mimeType: string,
  bytes: ArrayBuffer,
): Promise<UploadResumeResult> {
  const auth = await getAuthState();
  if (!auth.authenticated || !auth.user) {
    return { ok: false, message: "Please sign in to NextOffer." };
  }
  if (mimeType !== "application/pdf") {
    return { ok: false, message: "Only PDF resumes can be analyzed." };
  }

  const { resume, isNew } = await uploadResumeFile(auth.user.id, { name, mimeType, bytes });

  // A reused (already-uploaded, byte-identical) resume has already been
  // parsed — no need to parse again.
  if (isNew) {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      const parsed = await parseResumeDirect(accessToken, resume.id);
      if (!parsed.ok) {
        return { ok: false, message: parsed.message };
      }
    }
  }

  return { ok: true, resume };
}
