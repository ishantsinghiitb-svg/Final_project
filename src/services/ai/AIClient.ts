import { authService } from "@/services/AuthService";
import {
  getAICredits,
  getResumeMatch,
  analyzeResumeMatch,
  getAtsScore,
  analyzeAtsScore,
} from "@/server-functions/ai";
import { parseResume } from "@/server-functions/resume";
import type { AICreditStatus } from "@/features/ai/types";

// ── AIClient (Module 6A · client facade) ──
//
// Thin client-side wrapper over the TanStack server functions. Server functions
// run on the Cloudflare Worker (where provider keys + parsing live); this facade
// just injects the user's Supabase access token and returns typed results.

async function accessToken(): Promise<string> {
  const session = await authService.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const aiClient = {
  /** Current AI credit balance (ensures the usage row exists). */
  async getCredits(): Promise<AICreditStatus> {
    return getAICredits({ data: { accessToken: await accessToken() } });
  },

  /** Kick off the deterministic parse pipeline for a resume. */
  async parseResume(resumeId: string) {
    return parseResume({ data: { accessToken: await accessToken(), resumeId } });
  },

  /** Read-only peek at the latest Resume Match for (resumeId, jobId) — 0 credits. */
  async getResumeMatch(resumeId: string, jobId: string) {
    return getResumeMatch({ data: { accessToken: await accessToken(), resumeId, jobId } });
  },

  /** Generate (or re-generate) a Resume Match. The caller must have already shown the credit-confirmation dialog. */
  async analyzeResumeMatch(resumeId: string, jobId: string, forceRefresh = false) {
    return analyzeResumeMatch({
      data: { accessToken: await accessToken(), resumeId, jobId, forceRefresh },
    });
  },

  /** Read-only peek at the latest ATS Compatibility analysis for (resumeId, jobId) — 0 credits. */
  async getAtsScore(resumeId: string, jobId: string) {
    return getAtsScore({ data: { accessToken: await accessToken(), resumeId, jobId } });
  },

  /** Generate (or re-generate) an ATS Compatibility analysis. The caller must have already shown the credit-confirmation dialog. */
  async analyzeAtsScore(resumeId: string, jobId: string, forceRefresh = false) {
    return analyzeAtsScore({
      data: { accessToken: await accessToken(), resumeId, jobId, forceRefresh },
    });
  },
};
