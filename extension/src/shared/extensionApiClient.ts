import { env } from "./env";

/**
 * Client for the app's `/api/extension/*` routes (Module 6C) — the two things
 * that genuinely need server-side secrets (the OpenAI key for analysis, and
 * server-side PDF parsing) and therefore cannot be done via a direct Supabase
 * call the way reads are. Both routes reuse the dashboard's own
 * ResumeMatchService/parse pipeline — see src/server/extensionApi.ts.
 */

export type AnalyzeMatchApiResult =
  | { ok: true; score: number; label: string; creditsRemaining: number }
  | { ok: false; code?: string; message: string };

export async function analyzeMatchDirect(
  accessToken: string,
  resumeId: string,
  jobId: string,
  forceRefresh: boolean,
): Promise<AnalyzeMatchApiResult> {
  try {
    const res = await fetch(`${env.appUrl}/api/extension/analyze-match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, resumeId, jobId, forceRefresh }),
    });
    return (await res.json()) as AnalyzeMatchApiResult;
  } catch {
    return { ok: false, message: "Couldn't reach NextOffer. Check your connection and try again." };
  }
}

export type ParseResumeApiResult = { ok: true; reused: boolean } | { ok: false; message: string };

export async function parseResumeDirect(
  accessToken: string,
  resumeId: string,
): Promise<ParseResumeApiResult> {
  try {
    const res = await fetch(`${env.appUrl}/api/extension/parse-resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, resumeId }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      reused?: boolean;
      message?: string;
    };
    if (data.ok) return { ok: true, reused: Boolean(data.reused) };
    return { ok: false, message: data.message ?? "Failed to parse resume." };
  } catch {
    return { ok: false, message: "Couldn't reach NextOffer. Check your connection and try again." };
  }
}
