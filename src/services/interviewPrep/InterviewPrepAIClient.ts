import { authService } from "@/services/AuthService";
import { generateInterviewAnswerFn, generateInterviewPrep } from "@/server-functions/interviewPrep";
import type {
  GenerateInterviewAnswerParams,
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepParams,
  GenerateInterviewPrepResult,
} from "@/features/interview-prep/types";

// ── InterviewPrepAIClient (Module 7B · client facade) ──
//
// Thin client-side wrapper over the workspace's server functions (mirrors
// CoverLetterAIClient). The server functions run where the provider keys
// live; this facade only injects the caller's Supabase access token.
//
// Non-AI reads/writes (reading the prep, toggling checklist progress, hand-
// editing an already-generated answer) do NOT go through here — they run
// client-side under RLS via InterviewPrepService, the same way interview CRUD
// does. Only credit-consuming or session-gated AI calls need the server.

async function accessToken(): Promise<string> {
  const session = await authService.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const interviewPrepAIClient = {
  /**
   * Generate — or, if a preparation already exists for this interview,
   * Regenerate Entire Preparation. The caller must have shown the "this uses
   * 3 AI Credits" confirmation first.
   */
  async generate(params: GenerateInterviewPrepParams): Promise<GenerateInterviewPrepResult> {
    return generateInterviewPrep({ data: { accessToken: await accessToken(), ...params } });
  },

  /**
   * Generate or Regenerate the answer to one question. Free whenever the
   * preparation has an active editing session — the server verifies this,
   * never the client.
   */
  async generateAnswer(params: GenerateInterviewAnswerParams): Promise<GenerateInterviewAnswerResult> {
    return generateInterviewAnswerFn({ data: { accessToken: await accessToken(), ...params } });
  },
};
