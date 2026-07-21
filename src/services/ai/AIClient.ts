import { authService } from "@/services/AuthService";
import { getAICredits } from "@/server-functions/ai";
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
};
