import type { JobSnapshot } from "@/features/ai/types";
import type { MockInterviewSupplementaryContext } from "@/features/mock-interview/prompt";
import type { ServerSupabase } from "@/server/supabase";
import { ContextBuilder } from "./ContextBuilder";
import { hashObject } from "./hash";

// ── Mock Interview context loading (Module 7C) ──
//
// A dedicated loader rather than a re-export from InterviewPrepAIService.ts:
// that module's equivalent helper (`loadSupplementaryContext`) is a
// non-exported function inside a FROZEN file (Module 7B, see
// [[module7b-interview-prep]]), and adding an export keyword there would be
// touching frozen code for a ~70-line saving. This loader also reads MORE
// than 7B's version (interview_preps content + prior mock interview reports),
// so it is not a pure duplicate.
//
// Every step past the résumé/job is OPTIONAL, best-effort signal: a missing
// or failed lookup leaves that field blank, which the prompt (see
// features/mock-interview/prompt.ts) treats as "not available", never
// something to estimate. None of this ever blocks or fails a generation —
// the whole function is wrapped defensively per-query.

export type ResumeLoaded = {
  structured: import("@/features/ai/schemas").StructuredResume;
  rawText: string;
  fileHash: string | null;
};

export type JobLoaded = { jobHash: string; snapshot: JobSnapshot };

export type MockInterviewContextFailure = { ok: false; code: string; message: string };

/** Steps 1 + 4 (résumé) — same guard as InterviewPrepAIService.loadResume. */
export async function loadResumeForMockInterview(
  sb: ServerSupabase,
  resumeId: string,
): Promise<{ ok: true; resume: ResumeLoaded } | MockInterviewContextFailure> {
  const { data: resumeRow, error: resumeErr } = await sb
    .from("resumes")
    .select("parse_status")
    .eq("id", resumeId)
    .maybeSingle();
  if (resumeErr) throw resumeErr;
  if (!resumeRow)
    return { ok: false, code: "resume_not_found", message: "That resume is no longer available." };
  if (resumeRow.parse_status !== "ready") {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before starting a mock interview.",
    };
  }

  const builder = new ContextBuilder(sb);
  const resume = await builder.buildResumeContext(resumeId);
  if (!resume) {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before starting a mock interview.",
    };
  }
  return {
    ok: true,
    resume: { structured: resume.structured, rawText: resume.rawText, fileHash: resume.fileHash },
  };
}

/** Steps 2-3 (job + company) — live job context for a linked interview, or a synthetic one for standalone. Mirrors InterviewPrepAIService.loadJob exactly. */
export async function loadJobForMockInterview(
  sb: ServerSupabase,
  interview: { job_id: string | null; company_name: string; role: string },
  manualJobDescription: string,
  manualCompanyDescription: string | null,
): Promise<{ ok: true; job: JobLoaded } | MockInterviewContextFailure> {
  if (interview.job_id) {
    const builder = new ContextBuilder(sb);
    const jobCtx = await builder.buildJobContext(interview.job_id);
    if (!jobCtx)
      return { ok: false, code: "job_not_found", message: "That job is no longer available." };
    return { ok: true, job: { jobHash: jobCtx.jobHash, snapshot: jobCtx.snapshot } };
  }

  if (!manualJobDescription.trim()) {
    return {
      ok: false,
      code: "job_description_required",
      message: "Add the job description to continue.",
    };
  }

  const snapshot: JobSnapshot = {
    role: interview.role,
    companyName: interview.company_name,
    location: null,
    employmentType: null,
    workMode: null,
    experienceLevel: null,
    description: manualJobDescription.trim(),
    requirements: [],
    responsibilities: [],
    skills: [],
  };
  const jobHash = await hashObject({
    snapshot,
    companyDescription: manualCompanyDescription ?? null,
  });
  return { ok: true, job: { jobHash, snapshot } };
}

/** Best-effort extraction of a short summary from another capability's stored `ai_analyses.result` — mirrors InterviewPrepAIService's summarizeAnalysisResult. */
function summarizeAnalysisResult(
  result: unknown,
  kind: "resume_match" | "ats_score" | "resume_optimizer",
): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.summary === "string" && r.summary.trim()) parts.push(r.summary.trim());
  if (typeof r.overallScore === "number") parts.push(`Overall score: ${r.overallScore}/100`);
  if (typeof r.score === "number" && typeof r.overallScore !== "number")
    parts.push(`Score: ${r.score}/100`);

  const listField = (key: string, label: string) => {
    const v = r[key];
    if (Array.isArray(v) && v.length) {
      const items = v.filter((x): x is string => typeof x === "string").slice(0, 6);
      if (items.length) parts.push(`${label}: ${items.join("; ")}`);
    }
  };
  if (kind === "resume_match") {
    listField("whatMatches", "What matches");
    listField("whatToImprove", "What to improve");
  } else if (kind === "ats_score") {
    listField("atsRisks", "ATS risks");
    listField("recommendations", "Recommendations");
  } else if (kind === "resume_optimizer") {
    listField("categoryGaps", "Category gaps");
    listField("categoryStrengths", "Category strengths");
  }
  return parts.join(". ");
}

/** Best-effort extraction of a short summary from this interview's 7B Interview Preparation workspace. */
function summarizeInterviewPrep(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof c.overview === "string" && c.overview.trim()) parts.push(c.overview.trim());
  if (Array.isArray(c.priorityTopics)) {
    const topics = c.priorityTopics
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => (typeof t.topic === "string" ? t.topic : null))
      .filter((t): t is string => Boolean(t))
      .slice(0, 8);
    if (topics.length) parts.push(`Priority topics identified: ${topics.join(", ")}`);
  }
  if (Array.isArray(c.resumeWeakAreas)) {
    const areas = c.resumeWeakAreas
      .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
      .map((a) => (typeof a.area === "string" ? a.area : null))
      .filter((a): a is string => Boolean(a))
      .slice(0, 6);
    if (areas.length) parts.push(`Resume weak areas already identified: ${areas.join(", ")}`);
  }
  return parts.join(". ");
}

/** Best-effort extraction of a short summary from a prior CONCLUDED mock interview session's report. */
function summarizeMockInterviewReport(report: unknown): string {
  if (!report || typeof report !== "object") return "";
  const r = report as Record<string, unknown>;
  const parts: string[] = [];
  const overall = r.overallPerformance as Record<string, unknown> | undefined;
  if (overall && typeof overall.score === "number")
    parts.push(`Overall score: ${overall.score}/100`);
  if (typeof r.interviewSummary === "string" && r.interviewSummary.trim()) {
    parts.push(r.interviewSummary.trim().slice(0, 400));
  }
  if (Array.isArray(r.weaknesses)) {
    const weaknesses = r.weaknesses.filter((w): w is string => typeof w === "string").slice(0, 5);
    if (weaknesses.length) parts.push(`Weaknesses noted: ${weaknesses.join("; ")}`);
  }
  if (Array.isArray(r.recommendedTopics)) {
    const topics = r.recommendedTopics
      .filter((t): t is string => typeof t === "string")
      .slice(0, 5);
    if (topics.length) parts.push(`Recommended follow-up topics: ${topics.join(", ")}`);
  }
  return parts.join(". ");
}

/** Steps 7-13 — every prior signal about this resume+job+interview. Never throws; a failed lookup just leaves its field blank. */
export async function loadMockInterviewSupplementaryContext(
  sb: ServerSupabase,
  userId: string,
  resumeId: string,
  jobId: string | null,
  interviewId: string,
  interviewNotes: string | null,
): Promise<MockInterviewSupplementaryContext> {
  const supplementary: MockInterviewSupplementaryContext = {
    interviewNotes: interviewNotes?.trim() || undefined,
  };

  try {
    const [prepRes, mockRes] = await Promise.all([
      sb.from("interview_preps").select("content").eq("interview_id", interviewId).maybeSingle(),
      sb
        .from("mock_interview_sessions")
        .select("report")
        .eq("interview_id", interviewId)
        .eq("status", "concluded")
        .not("report", "is", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    if (prepRes.data?.content) {
      supplementary.interviewPrepSummary = summarizeInterviewPrep(prepRes.data.content);
    }
    if (mockRes.data && mockRes.data.length > 0) {
      const summaries = mockRes.data
        .map((row, i) => {
          const summary = summarizeMockInterviewReport(row.report);
          return summary ? `Session ${i + 1}: ${summary}` : null;
        })
        .filter((s): s is string => Boolean(s));
      if (summaries.length > 0) supplementary.previousMockInterviewsSummary = summaries.join("\n");
    }
  } catch {
    /* best-effort — never blocks planning */
  }

  if (!jobId) return supplementary;

  try {
    const [matchRes, atsRes, optimizerRes, letterRes] = await Promise.all([
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "resume_match")
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "ats_score")
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "resume_optimizer")
        .eq("resume_id", resumeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("cover_letters")
        .select("content")
        .eq("user_id", userId)
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .eq("source", "studio")
        .not("content", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (matchRes.data?.result)
      supplementary.resumeMatchSummary = summarizeAnalysisResult(
        matchRes.data.result,
        "resume_match",
      );
    if (atsRes.data?.result)
      supplementary.atsSummary = summarizeAnalysisResult(atsRes.data.result, "ats_score");
    if (optimizerRes.data?.result) {
      supplementary.optimizerSummary = summarizeAnalysisResult(
        optimizerRes.data.result,
        "resume_optimizer",
      );
    }
    if (letterRes.data?.content)
      supplementary.coverLetterSummary = String(letterRes.data.content).slice(0, 1200);
  } catch {
    /* best-effort */
  }

  return supplementary;
}
