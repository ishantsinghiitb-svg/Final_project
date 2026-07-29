import { authService } from "@/services/AuthService";
import {
  explainCoverLetter,
  generateCoverLetter,
  runCoverLetterAction,
} from "@/server-functions/coverLetter";
import type {
  CoverLetterActionParams,
  CoverLetterAIResult,
  ExplainCoverLetterParams,
  ExplainCoverLetterResult,
  GenerateCoverLetterParams,
} from "@/features/cover-letters/types";

// ── CoverLetterAIClient (Module 6E · client facade) ──
//
// Thin client-side wrapper over the Studio's server functions (mirrors AIClient
// and OptimizerClient). The server functions run where the provider keys live;
// this facade only injects the caller's Supabase access token.
//
// Document CRUD (create / save / rename / duplicate / delete / versions) does
// NOT go through here — it runs client-side under RLS via CoverLetterService,
// the same way resume CRUD does. Only credit-consuming AI calls need the server.

async function accessToken(): Promise<string> {
  const session = await authService.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const coverLetterAIClient = {
  /**
   * Generate a cover letter for (resume, job) with the chosen settings. The
   * caller must have shown the "this uses 1 AI Credit" confirmation first.
   */
  async generate(params: GenerateCoverLetterParams): Promise<CoverLetterAIResult> {
    return generateCoverLetter({ data: { accessToken: await accessToken(), ...params } });
  },

  /**
   * Run one AI action against the letter currently in the editor. Free
   * whenever the document has an active editing session (only Regenerate
   * Entire Letter charges a credit) — the server verifies this, never the client.
   */
  async runAction(params: CoverLetterActionParams): Promise<CoverLetterAIResult> {
    return runCoverLetterAction({ data: { accessToken: await accessToken(), ...params } });
  },

  /** Explain the tone/structure/highlights of the current letter. Free, session-gated. */
  async explain(params: ExplainCoverLetterParams): Promise<ExplainCoverLetterResult> {
    return explainCoverLetter({ data: { accessToken: await accessToken(), ...params } });
  },
};
