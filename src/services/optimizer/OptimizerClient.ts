import { authService } from "@/services/AuthService";
import { optimizeResume } from "@/server-functions/optimizer";
import type { CareerCategoryId, OptimizeSectionId } from "@/features/optimizer/constants";

// ── OptimizerClient (Module 6D · client facade) ──
//
// Thin client-side wrapper over the optimizer server function (mirrors AIClient).
// The server function runs on the worker where provider keys live; this facade
// just injects the caller's Supabase access token and returns the typed result.

async function accessToken(): Promise<string> {
  const session = await authService.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const optimizerClient = {
  /**
   * Run an optimization for a resume against a career category + section
   * selection. The caller must have shown the "this uses 1 AI Credit"
   * confirmation first — this only executes.
   */
  async optimize(
    resumeId: string,
    category: CareerCategoryId,
    sections: OptimizeSectionId[],
    forceRefresh = false,
  ) {
    return optimizeResume({
      data: { accessToken: await accessToken(), resumeId, category, sections, forceRefresh },
    });
  },
};
