import { supabase } from "@/lib/supabase";
import type { AICapability } from "@/features/ai/constants";

// ── AIActivityRepository (Module 6G) ──
//
// The read side of the AI Hub. `ai_runs` is already the one audit row every AI
// capability writes (Match, ATS, Optimizer, Cover Letter all call the same
// logRun), so the unified timeline needs no new table, no new column and no
// change to any capability — it just reads what the engine has been recording
// since 6A.
//
// Two deliberate narrowings:
//
//   1. WHAT COUNTS AS AN ACTIVITY. `ai_runs` logs every provider call,
//      including the free refinement actions inside an open Cover Letter
//      editing session (rewrite a section, change tone…). Those are edits
//      WITHIN a letter the timeline already lists, not separate activities, so
//      listing them would bury the four things the user actually did. The
//      filter keeps a run only when it charged a credit, was reused from an
//      earlier identical run, or failed. `limit_reached` rows are dropped
//      entirely: nothing was produced and the user already saw the paywall.
//
//   2. NO PROVIDER/COST COLUMNS. model, tokens, latency and cost stay out of
//      the select — they are developer telemetry, and the Hub must not leak
//      them into a job seeker's screen.
//
// Labels (resume name, job title/company) are hydrated in a second pass rather
// than joined: `ai_runs.job_id` is a SOFT ref to global_jobs (deliberately not
// a FK, so history survives a job being removed), which PostgREST cannot embed.

export type AIActivityRow = {
  id: string;
  capability: AICapability;
  status: "success" | "error";
  cacheHit: boolean;
  creditsCharged: number;
  resumeId: string | null;
  jobId: string | null;
  errorCode: string | null;
  createdAt: string;
};

export type AIActivityLabels = {
  /**
   * resumeId → { name, parsedAt }. Missing = resume since deleted.
   *
   * `parsedAt` — NOT `updated_at` — is what tells the Hub the analyzed content
   * has changed. A resume row's `updated_at` moves on a rename or a
   * make-default click, which would wrongly nudge the user to spend a credit
   * re-running an analysis that is still perfectly valid. `parsed_at` only
   * moves when the file itself was (re)parsed, i.e. the text the AI read is
   * genuinely different.
   */
  resumes: Record<string, { name: string; parsedAt: string | null }>;
  /**
   * jobId → { role, company }. Missing = job since removed.
   *
   * No change-detection here on purpose: `global_jobs.updated_at` is bumped by
   * every re-scrape whether or not the posting text moved, so it cannot
   * distinguish a real edit from a routine refresh. Authoritative job
   * staleness is computed server-side (ContextBuilder job hashing) and shown
   * on the job page, which is also where the user can act on it.
   */
  jobs: Record<string, { role: string; company: string }>;
  /** "resumeId|jobId" → cover letter id, for the Cover Letter row's reopen link. */
  coverLetters: Record<string, string>;
};

export type AIActivityPage = {
  runs: AIActivityRow[];
  labels: AIActivityLabels;
};

const EMPTY_LABELS: AIActivityLabels = { resumes: {}, jobs: {}, coverLetters: {} };

function uniq(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export class AIActivityRepository {
  /**
   * The user's recent AI activities, newest first, with display labels.
   *
   * `limit` caps the timeline rather than paginating it: the Hub is a "what
   * have I been doing lately" surface, and a job seeker who needs a specific
   * old analysis reaches it from the job or letter itself, not by scrolling
   * months of history.
   */
  async listRecent(limit = 40): Promise<AIActivityPage> {
    const { data, error } = await supabase
      .from("ai_runs")
      .select(
        "id, capability, status, cache_hit, credits_charged, resume_id, job_id, error_code, created_at",
      )
      .in("status", ["success", "error"])
      .or("credits_charged.gt.0,cache_hit.is.true,status.eq.error")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const runs: AIActivityRow[] = (data ?? []).map((row) => ({
      id: row.id,
      capability: row.capability as AICapability,
      status: row.status === "error" ? "error" : "success",
      cacheHit: row.cache_hit,
      creditsCharged: row.credits_charged,
      resumeId: row.resume_id,
      jobId: row.job_id,
      errorCode: row.error_code,
      createdAt: row.created_at,
    }));

    if (runs.length === 0) return { runs, labels: EMPTY_LABELS };

    const labels = await this.hydrateLabels(runs);
    return { runs, labels };
  }

  /**
   * Resolve ids to names in one round trip per table. Anything that no longer
   * exists simply stays absent from the map — the UI renders those as a
   * neutral "no longer available" rather than a broken link, which is why the
   * lookups are `Record` rather than throwing on a miss.
   */
  private async hydrateLabels(runs: AIActivityRow[]): Promise<AIActivityLabels> {
    const resumeIds = uniq(runs.map((r) => r.resumeId));
    const jobIds = uniq(runs.map((r) => r.jobId));
    const needsCoverLetters = runs.some((r) => r.capability === "cover_letter");

    const [resumeRes, jobRes, letterRes] = await Promise.all([
      resumeIds.length
        ? supabase.from("resumes").select("id, name, parsed_at").in("id", resumeIds)
        : Promise.resolve({ data: [], error: null }),
      jobIds.length
        ? supabase.from("global_jobs").select("id, role, company_name").in("id", jobIds)
        : Promise.resolve({ data: [], error: null }),
      // The Cover Letter row needs the DOCUMENT to reopen, but ai_runs records
      // only (resume, job) — the letter id isn't part of the engine's audit
      // shape. Matching on the pair is exact in practice: the Studio creates
      // one letter per resume+job, and the most recently touched one is the
      // one the user means. Ordered so the first hit written into the map wins.
      needsCoverLetters
        ? supabase
            .from("cover_letters")
            .select("id, resume_id, job_id, updated_at")
            .eq("source", "studio")
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const labels: AIActivityLabels = { resumes: {}, jobs: {}, coverLetters: {} };

    for (const row of (resumeRes.data ?? []) as {
      id: string;
      name: string;
      parsed_at: string | null;
    }[]) {
      labels.resumes[row.id] = { name: row.name, parsedAt: row.parsed_at };
    }
    for (const row of (jobRes.data ?? []) as {
      id: string;
      role: string;
      company_name: string;
    }[]) {
      labels.jobs[row.id] = { role: row.role, company: row.company_name };
    }
    for (const row of (letterRes.data ?? []) as {
      id: string;
      resume_id: string | null;
      job_id: string | null;
    }[]) {
      if (!row.resume_id || !row.job_id) continue;
      const key = `${row.resume_id}|${row.job_id}`;
      if (!labels.coverLetters[key]) labels.coverLetters[key] = row.id;
    }

    return labels;
  }
}
