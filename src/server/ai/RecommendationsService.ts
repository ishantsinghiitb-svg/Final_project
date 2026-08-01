import type { Profile } from "@/types";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { GOAL_LABELS } from "@/features/analytics/constants";
import {
  buildGoalProgress,
  buildLastActivityMap,
  buildStatusHistory,
  computeOverview,
  computeResumePerformance,
  countStaleApplications,
  rangeToDates,
  resolveGoalTargets,
  type ActivityEvent,
  type OverviewApplication,
  type OverviewInterview,
  type ResumeApplication,
  type ResumeNameRow,
} from "@/features/analytics/utils";
import {
  buildRecommendationCandidates,
  type RecommendationContext,
} from "@/features/recommendations/candidates";
import {
  buildEntityOwnership,
  buildRecommendationsPrompt,
  validateRecommendationItem,
} from "@/features/recommendations/prompt";
import { RecommendationsDraftSchema } from "@/features/recommendations/schema";
import type {
  GetRecommendationsResult,
  RecommendationCandidate,
  RecommendationItem,
} from "@/features/recommendations/types";
import { getProvider } from "./providers";
import { withRetry } from "./retry";
import { AIValidationError, toResultCode } from "./errors";

// ── AI Recommendations Service (Module 8B) ──
//
// A dedicated orchestration, same rationale as InterviewPrepAIService and
// CoverLetterAIService: the input here is cross-feature aggregate data
// (applications + interviews + resumes + mock interviews + goals), not a
// resume/job pair, so it doesn't fit the frozen `runCapability` engine.
//
// Two things make this the safest AI surface in the product:
//   1. Every "should we show this?" decision is deterministic, made in
//      features/recommendations/candidates.ts BEFORE the AI is ever called.
//      The AI only phrases 2-3 sentences for candidates already chosen and
//      already backed by real data.
//   2. Every AI response is validated against a numbers+entities whitelist
//      (features/recommendations/prompt.ts) built from that same real data.
//      Anything that fails — or any provider error/timeout — degrades to a
//      pre-written deterministic template for that one item, never to an
//      error and never to unverified content.
//
// Deliberately free (AI_CREDIT_COSTS.recommendations = 0) and deliberately
// UNCACHED: no ai_cache read or write, ever. It's cheap, and per the "always
// reflect current data" requirement, a cached AI response could describe
// data that has since changed. ai_runs is still written for cost/audit
// observability; ai_analyses is not, since this isn't a browsable history.

const STALE_ACTIVITY_KINDS = [
  "application_created",
  "manual_application_created",
  "status_changed",
];

type CompetencyScoreRow = { competencyId: string; label: string; score: number };

/** Defensive read of report.competencyScores — jsonb written by a different (already-validated) AI call, so this only trusts well-shaped entries and drops the rest. */
function extractCompetencyScores(report: unknown): CompetencyScoreRow[] {
  if (!report || typeof report !== "object") return [];
  const scores = (report as Record<string, unknown>).competencyScores;
  if (!Array.isArray(scores)) return [];
  const out: CompetencyScoreRow[] = [];
  for (const entry of scores) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const competencyId = typeof o.competencyId === "string" ? o.competencyId : null;
    const score = typeof o.score === "number" ? o.score : null;
    if (!competencyId || score === null) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label : competencyId;
    out.push({ competencyId, label, score });
  }
  return out;
}

async function fetchContext(
  sb: ServerSupabase,
  userId: string,
): Promise<{ ctx: RecommendationContext; allKnownEntities: string[] }> {
  const nowIso = new Date().toISOString();

  const [applicationsRes, resumesRes, interviewsRes, profileRes, prepsRes, mockRes, atsRes] =
    await Promise.all([
      sb.from("applications").select("id, resume_id, status, applied_at").eq("user_id", userId),
      sb.from("resumes").select("id, name").eq("user_id", userId),
      sb
        .from("interviews")
        .select("id, application_id, status, scheduled_at, company_name")
        .eq("user_id", userId),
      sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
      sb.from("interview_preps").select("interview_id, generated_at").eq("user_id", userId),
      sb
        .from("mock_interview_sessions")
        .select("report")
        .eq("user_id", userId)
        .eq("status", "concluded")
        .not("report", "is", null),
      sb
        .from("ai_analyses")
        .select("resume_id, score, created_at")
        .eq("user_id", userId)
        .eq("capability", "ats_score"),
    ]);

  if (applicationsRes.error) throw applicationsRes.error;
  if (resumesRes.error) throw resumesRes.error;
  if (interviewsRes.error) throw interviewsRes.error;
  if (profileRes.error) throw profileRes.error;
  if (prepsRes.error) throw prepsRes.error;
  if (mockRes.error) throw mockRes.error;
  if (atsRes.error) throw atsRes.error;

  const applications = (applicationsRes.data ?? []) as {
    id: string;
    resume_id: string | null;
    status: string;
    applied_at: string;
  }[];
  const resumes = (resumesRes.data ?? []) as ResumeNameRow[];
  const interviews = (interviewsRes.data ?? []) as {
    id: string;
    application_id: string | null;
    status: string;
    scheduled_at: string;
    company_name: string;
  }[];
  const profile = (profileRes.data ?? null) as Profile | null;

  // Supabase's `.in()` with an empty array is unsafe (mirrors the same guard
  // in AnalyticsRepository.findStatusEvents) — skip the query entirely.
  const applicationIds = applications.map((a) => a.id);
  let activityEvents: ActivityEvent[] = [];
  if (applicationIds.length > 0) {
    const activityRes = await sb
      .from("application_activity")
      .select("application_id, kind, new_value, created_at")
      .eq("user_id", userId)
      .in("application_id", applicationIds)
      .in("kind", STALE_ACTIVITY_KINDS);
    if (activityRes.error) throw activityRes.error;
    activityEvents = (activityRes.data ?? []) as ActivityEvent[];
  }

  const history = buildStatusHistory(activityEvents);
  const lastActivityAt = buildLastActivityMap(activityEvents);

  const overviewApplications: OverviewApplication[] = applications.map((a) => ({
    id: a.id,
    status: a.status,
  }));
  const overviewInterviews: OverviewInterview[] = interviews.map((i) => ({
    application_id: i.application_id ?? "",
    status: i.status,
    scheduled_at: i.scheduled_at,
  }));
  const applicationsWithInterviewIds = new Set(
    interviews.filter((i) => i.application_id).map((i) => i.application_id as string),
  );

  const resumeApplications: ResumeApplication[] = applications.map((a) => ({
    id: a.id,
    resume_id: a.resume_id,
  }));
  const { performance: resumePerformance, unlinkedCount: unlinkedApplicationCount } =
    computeResumePerformance(resumeApplications, history, applicationsWithInterviewIds, resumes);

  const staleApplicationCount = countStaleApplications(overviewApplications, lastActivityAt);

  const preps = (prepsRes.data ?? []) as { interview_id: string; generated_at: string | null }[];
  const preppedInterviewIds = new Set(
    preps.filter((p) => Boolean(p.generated_at)).map((p) => p.interview_id),
  );
  const upcomingInterviews = interviews
    .filter((i) => i.status === "scheduled" && i.scheduled_at > nowIso)
    .map((i) => ({ hasPrep: preppedInterviewIds.has(i.id) }));

  const concludedMockSessions = (mockRes.data ?? []).map((row) => ({
    competencyScores: extractCompetencyScores(row.report),
  }));

  // Goals are framed as monthly — the app's goal columns are period-less, so
  // last-30-days is the deterministic proxy, computed independently of
  // whatever range the Analytics page's own toggle happens to be set to.
  const { after } = rangeToDates("last_30_days");
  const goalApplications = after ? applications.filter((a) => a.applied_at >= after) : applications;
  const goalApplicationIds = new Set(goalApplications.map((a) => a.id));
  const goalOverviewApplications: OverviewApplication[] = goalApplications.map((a) => ({
    id: a.id,
    status: a.status,
  }));
  const goalOverviewInterviews = overviewInterviews.filter((i) =>
    goalApplicationIds.has(i.application_id),
  );
  const goalOverview = computeOverview(goalOverviewApplications, history, goalOverviewInterviews);
  const goalTargets = resolveGoalTargets(profile);
  const goals = buildGoalProgress(goalOverview, goalTargets);

  const resumeNameById = new Map(resumes.map((r) => [r.id, r.name]));
  const atsRows = (atsRes.data ?? []) as {
    resume_id: string | null;
    score: number | null;
    created_at: string;
  }[];
  const atsHistory = atsRows
    .filter((r) => r.resume_id && r.score != null && resumeNameById.has(r.resume_id))
    .map((r) => ({
      resumeId: r.resume_id as string,
      resumeName: resumeNameById.get(r.resume_id as string) as string,
      score: r.score as number,
      createdAt: r.created_at,
    }));

  const allCompetencyLabels = new Set<string>();
  for (const session of concludedMockSessions) {
    for (const c of session.competencyScores) allCompetencyLabels.add(c.label);
  }
  const allCompanyNames = new Set(interviews.map((i) => i.company_name).filter(Boolean));
  const allKnownEntities = [
    ...new Set([
      ...resumes.map((r) => r.name),
      ...allCompetencyLabels,
      ...Object.values(GOAL_LABELS),
      ...allCompanyNames,
    ]),
  ];

  return {
    ctx: {
      resumePerformance,
      staleApplicationCount,
      unlinkedApplicationCount,
      totalApplicationCount: applications.length,
      upcomingInterviews,
      concludedMockSessions,
      goals,
      atsHistory,
    },
    allKnownEntities,
  };
}

async function logRun(
  sb: ServerSupabase,
  userId: string,
  status: "success" | "error",
  latencyMs: number,
  extra: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    errorCode?: string;
    errorMessage?: string;
  } = {},
): Promise<void> {
  const cap = getCapability(AI_CAPABILITIES.RECOMMENDATIONS);
  try {
    await sb.from("ai_runs").insert({
      user_id: userId,
      capability: cap.id,
      provider: cap.provider,
      model: cap.model,
      prompt_id: cap.promptId,
      prompt_version: cap.promptVersion,
      analysis_version: cap.analysisVersion,
      status,
      cache_hit: false,
      credits_charged: 0,
      input_tokens: extra.inputTokens ?? null,
      output_tokens: extra.outputTokens ?? null,
      latency_ms: latencyMs,
      error_code: extra.errorCode ?? null,
      error_message: extra.errorMessage ?? null,
    });
  } catch {
    /* audit logging is best-effort — must never block a successful response */
  }
}

function templateItem(candidate: RecommendationCandidate): RecommendationItem {
  return {
    type: candidate.type,
    title: candidate.fallback.title,
    explanation: candidate.fallback.explanation,
    action: candidate.fallback.action,
    source: "template",
  };
}

export async function getAIRecommendations(
  authed: AuthedContext,
): Promise<GetRecommendationsResult> {
  const { supabase: sb, user } = authed;
  const generatedAt = new Date().toISOString();

  let candidates: RecommendationCandidate[];
  let allKnownEntities: string[];
  try {
    const built = await fetchContext(sb, user.id);
    candidates = buildRecommendationCandidates(built.ctx);
    allKnownEntities = built.allKnownEntities;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Couldn't load recommendations right now.",
    };
  }

  if (candidates.length === 0) {
    return { ok: true, items: [], generatedAt };
  }

  const startedAt = Date.now();
  const cap = getCapability(AI_CAPABILITIES.RECOMMENDATIONS);
  const prompt = buildRecommendationsPrompt(candidates);

  try {
    const produced = await withRetry(
      async () => {
        const provider = getProvider(cap.provider);
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: RecommendationsDraftSchema,
          schemaName: cap.id,
        });
        const parsed = RecommendationsDraftSchema.safeParse(res.raw);
        if (!parsed.success) {
          throw new AIValidationError("Recommendations response was malformed.");
        }
        return { data: parsed.data, usage: res.usage };
      },
      { attempts: 2 },
    );

    const ownership = buildEntityOwnership(candidates, allKnownEntities);
    const items: RecommendationItem[] = candidates.map((candidate) => {
      const aiItem = produced.data.items.find((it) => it.type === candidate.type);
      if (aiItem && validateRecommendationItem(aiItem, candidate, ownership)) {
        return {
          type: candidate.type,
          title: aiItem.title,
          explanation: aiItem.explanation,
          action: aiItem.action,
          source: "ai",
        };
      }
      return templateItem(candidate);
    });

    await logRun(sb, user.id, "success", Date.now() - startedAt, {
      inputTokens: produced.usage.inputTokens,
      outputTokens: produced.usage.outputTokens,
    });

    return { ok: true, items, generatedAt };
  } catch (err) {
    await logRun(sb, user.id, "error", Date.now() - startedAt, {
      errorCode: toResultCode(err),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    // Provider failure never surfaces as an error to the user — every
    // qualifying candidate already has real evidence behind it, so we fall
    // back to its pre-written template instead of showing nothing or an
    // error banner on an otherwise-working Analytics page.
    return { ok: true, items: candidates.map(templateItem), generatedAt };
  }
}
