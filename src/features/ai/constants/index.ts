// ── AI Feature Constants (Module 6A) ──
//
// Single place that names every AI capability, its credit cost, and its
// prompt/analysis versions. The capability registry (../capabilities) binds
// these to a provider/model/prompt/schema. Adding a capability = add an id
// here + a registry entry — no model names hardcoded anywhere else.

export const AI_CAPABILITIES = {
  RESUME_MATCH: "resume_match",
  ATS_SCORE: "ats_score",
  RESUME_OPTIMIZER: "resume_optimizer",
  COVER_LETTER: "cover_letter",
  INTERVIEW_PREP: "interview_prep",
  MOCK_INTERVIEW: "mock_interview",
  RECOMMENDATIONS: "recommendations",
} as const;

export type AICapability = (typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES];

// ── Shipped vs experimental (Module 6 freeze) ──
//
// A capability can be registered (id + version constants) without being
// reachable by a user — no server function, no client method, no UI. Because
// it would otherwise sit in the same registry as real capabilities, every
// `Record<AICapability, …>` in the codebase would have to invent a value for
// it, and it could leak user-facing copy for a screen that doesn't exist
// (this happened to `interview_prep` during 6G, before it shipped in 7B).
//
// The split below makes the distinction explicit and enforceable rather than a
// comment: anything user-facing is typed against `ShippedAICapability`, so
// surfacing an experimental capability is a compile error, not a review catch.
//
// Promoting a capability = move the id into SHIPPED_AI_CAPABILITIES (which
// then requires a loading-phase script — see loadingPhases.ts) and build its
// server function, client method and UI. `interview_prep` made this move in
// Module 7B, as a dedicated orchestration (server/ai/InterviewPrepAIService.ts)
// rather than the frozen generic engine — see CoverLetterAIService.ts for why.

export const SHIPPED_AI_CAPABILITIES = [
  AI_CAPABILITIES.RESUME_MATCH,
  AI_CAPABILITIES.ATS_SCORE,
  AI_CAPABILITIES.RESUME_OPTIMIZER,
  AI_CAPABILITIES.COVER_LETTER,
  AI_CAPABILITIES.INTERVIEW_PREP,
  AI_CAPABILITIES.MOCK_INTERVIEW,
  AI_CAPABILITIES.RECOMMENDATIONS,
] as const;

/** A capability a user can actually reach. Use this in any user-facing type. */
export type ShippedAICapability = (typeof SHIPPED_AI_CAPABILITIES)[number];

/** Registered but unreachable — no server function, no client, no UI. */
export const EXPERIMENTAL_AI_CAPABILITIES = [] as const;

export type ExperimentalAICapability = (typeof EXPERIMENTAL_AI_CAPABILITIES)[number];

export function isShippedCapability(id: AICapability): id is ShippedAICapability {
  return (SHIPPED_AI_CAPABILITIES as readonly AICapability[]).includes(id);
}

export const AI_CAPABILITY_LABELS: Record<AICapability, string> = {
  resume_match: "Resume Match",
  ats_score: "ATS Score",
  resume_optimizer: "Resume Optimizer",
  cover_letter: "Cover Letter",
  interview_prep: "Interview Preparation",
  mock_interview: "Mock Interview",
  recommendations: "AI Recommendations",
};

/**
 * Credits consumed per generation. Configurable per capability.
 *
 * `interview_prep` costs 3, not 1 — a deliberate deviation (same category of
 * decision as ATS's shared-pool deviation in 6C). One generation produces a
 * complete workspace (overview, evaluation criteria, priority topics,
 * personalized questions across five categories, resume weak areas, STAR
 * story recommendations, checklist) with unlimited free reading, navigation
 * and per-question answer generation/regeneration inside that session — see
 * server/ai/InterviewPrepAIService.ts. Only Regenerate Entire Preparation
 * charges again.
 */
export const AI_CREDIT_COSTS: Record<AICapability, number> = {
  resume_match: 1,
  ats_score: 1,
  resume_optimizer: 1,
  cover_letter: 1,
  interview_prep: 3,
  // ── Module 7C ──
  // 5 credits starts ONE mock interview SESSION, not one question. Everything
  // inside that session — every question, follow-up, probe, clarification,
  // voice, typing, the final report and every reopen — is free. This is
  // enforced by construction: AICreditService.consume is called at exactly
  // one site in the whole module (MockInterviewAIService.startMockInterview);
  // see the vitest guard "never calls consume outside startMockInterview".
  // Only starting a brand-new mock interview charges again.
  mock_interview: 5,
  // ── Module 8B ──
  // Deliberately free. Recommendations are computed from data the user
  // already generated (applications, interviews, resumes, other AI
  // features' own history) and are auto-refreshed on every Analytics page
  // load, never behind a "Generate" button — charging for that would be the
  // one paid element on an otherwise free analytics page. See
  // server/ai/RecommendationsService.ts.
  recommendations: 0,
};

/**
 * Analysis version — bump when the *scoring / analysis logic* changes so old
 * cached analyses are not reused. Independent of prompt_version (which tracks
 * the prompt text) so either can move without the other.
 */
export const AI_ANALYSIS_VERSIONS: Record<AICapability, string> = {
  // v3 (6B refinement): recruiter-grade scoring calibration — realistic bands,
  // transferable-skill credit, required-vs-preferred weighting.
  // v4 (6E AI-quality pass): adds the structured `improvementPlan` (organized as
  // matches / missing / improve / add / remove / rewrite / move, with concrete
  // examples). Bumped so the earlier plan-less cached analyses are not reused.
  resume_match: "4",
  // v2 (6C): first real ATS Compatibility analysis (hybrid deterministic + AI).
  // v3 (6E AI-quality pass): adds the "path to 95%" `improvementPlan` (each item
  // why/how/example/expected-benefit). Bumped so plan-less cached rows are not reused.
  ats_score: "3",
  // v2 (6E AI-quality pass): audit-first, multi-pass, role-framework-driven
  // optimization with the full suggestion-kind set. Bumped off the "1" placeholder run.
  // v3 (6E quality follow-up): mandatory exhaustive ~34-dimension audit with an
  // explicit no-implicit-limit stopping condition (find every meaningful,
  // safe improvement, not a handful). Bumped so pre-exhaustive cached runs aren't reused.
  // v4 (6E final quality pass): TWO-PASS reasoning — an exhaustive audit followed
  // by a gap-fill verification pass that finds what the first pass missed, then
  // merged/de-duplicated. Bumped so single-pass cached runs aren't reused.
  // v5 (6E Transformation Engine): Role-Intelligence-driven, category-adaptive
  // transformation pipeline — benchmark + scorecard + readiness/potential, not a
  // generic audit. New output shape; bumped so pre-transformation runs aren't reused.
  // v6 (6E Transformation Coach): adds `careerSignals` (recruiter-expectation
  // signals, truthful resume-improvement vs build-this-experience split). New
  // output shape; bumped so pre-signals cached runs aren't reused.
  // v7 (6E coach polish): career signals gain waysToBuild + exampleIsTemplate;
  // recruiter-outcome reasoning + no-fabricated-example rules. New output shape.
  resume_optimizer: "7",
  // v2 (6E Phase 2 quality pass): the draft output shape changed — a
  // free-length `paragraphs` list replaces the fixed opening/body/closing
  // template, and an `internal` block carries the model's company/candidate/
  // intersection/narrative analysis plus its pre-return checks. Bumped so
  // pre-Phase-2 cached letters (old shape, generic quality) aren't reused.
  cover_letter: "2",
  // v1 was the unshipped 6A placeholder scaffold ({questions:[{question,
  // category, suggestedAnswer}]}) — it never had a real service behind it.
  // v2 (Module 7B) is the first real Interview Preparation implementation: a
  // dedicated orchestration with its own schema (features/interview-prep/schema.ts),
  // not the frozen registry placeholder. Bumped so the placeholder is never reused.
  // v3 (Module 7B intelligence upgrade): output shape expanded — 12-step
  // internal reasoning (was 7), questions gain `sourceTag`/`priority`/
  // `difficulty`, priority topics gain `studyPoints`, category vocabulary
  // grows from 5 to 29 AI-selected values. Bumped so pre-upgrade cached preps
  // (old shape, missing fields) aren't reused.
  interview_prep: "3",
  // v1 (Module 7C): first Mock Interview Studio implementation — a
  // dedicated multi-call session (plan → N live turns → report), not the
  // frozen registry placeholder.
  // v2 (7C realism pass): output shape changed — the plan's `plannedArc`
  // stages became a closed vocabulary (INTERVIEW_STAGES) and are now
  // persisted into the stored plan, and each live turn's internal reasoning
  // gained `currentStage`/`stageRationale`. Bumped so pre-arc sessions are
  // never mistaken for arc-aware ones in the audit trail.
  // v3 (7C final polish): the report gained `additionalQuestionsToPrepare`
  // (8-10 role-typical questions the interview did not cover, de-duplicated
  // server-side against what was actually asked).
  mock_interview: "3",
  // v1 (Module 8B): first AI Recommendations implementation.
  recommendations: "1",
};

/** Prompt version — bump when the prompt template text changes. */
export const AI_PROMPT_VERSIONS: Record<AICapability, string> = {
  // v3 (6B refinement): recruiter rubric + structured-section context + richer
  // plain-language output contract.
  // v4 (6E): "what prevents an excellent match" reframe + improvement-plan contract.
  // v5 (6E follow-up): per-dimension `detail` is now a 2-3 sentence expandable
  // diagnosis (what fits / what's missing / the opportunity) for the report's
  // Fit-Breakdown drill-down. Scoring bands unchanged, so analysis_version stays.
  // v6 (6E final quality pass): each improvement-plan item carries a `priority`
  // tier for the prioritized-checklist UX.
  resume_match: "6",
  // v2 (6C): real ATS Compatibility prompt (component-evaluation contract).
  // v3 (6E): "how to reach 95%" reframe + actionable improvement-plan contract.
  // v4 (6E follow-up): per-component `detail` is now a 2-3 sentence expandable
  // diagnosis (what's good / what's missing / the opportunity) for the report's
  // Layer-3 category drill-down. Scoring logic unchanged, so analysis_version stays.
  // v5 (6E final quality pass): each improvement-plan item carries a `priority` tier.
  ats_score: "5",
  // v2 (6E): audit-first multi-pass recruiter/ATS/PM reasoning + role frameworks.
  // v3 (6E follow-up): exhaustive ~34-dimension audit checklist + no-implicit-limit framing.
  // v4 (6E final quality pass): pass-1 prompt text unchanged; the gap-fill second
  // pass is a new template (analysis_version already bumped to invalidate cache).
  // v5 (6E Transformation Engine): pass-1 system prompt rewritten into the 6-phase
  // Role-Intelligence transformation pipeline with the expanded output contract.
  // v6 (6E Transformation Coach): adds the Career Signals phase (recruiter
  // expectations beyond the resume) with the truthful resume-vs-build rule.
  // v7 (6E coach polish): waysToBuild + exampleIsTemplate; recruiter-outcome
  // `reason`; safe (never-fabricated) examples; stronger overlap-merge rule.
  resume_optimizer: "7",
  // v2 (6E Phase 2 quality pass): the foundation-phase prompt is replaced by a
  // 5-phase reasoning pipeline (understand company → understand candidate →
  // find the intersection → choose ONE narrative → write), an explicit
  // truthfulness > custom instructions > posting > résumé priority ladder,
  // banned generic openings, anti-résumé-repetition rules, and a six-point
  // self-check the model must pass before returning. Applies to generation and
  // to every refinement action.
  cover_letter: "2",
  // v1 was the unshipped 6A placeholder prompt ("Produce likely interview
  // questions..."), never actually called by a service. v2 (Module 7B) is a
  // 7-phase reasoning pipeline (understand the job → understand the candidate →
  // interview objectives → predicted interviewer priorities → risky resume
  // areas → highest-value question selection → preparation strategy), an
  // explicit quality-over-quantity rule (no generic filler questions, no
  // padding to hit a count) and a confidence gate on company-specific content
  // (fewer questions, never invented culture/values/news, when the posting and
  // optional company description don't support more).
  // v3 (Module 7B intelligence upgrade): 12-phase reasoning pipeline (adds
  // role, additional user context, and optional prior Resume Match / ATS /
  // Optimizer / Cover Letter / interview-notes signal ahead of strategy);
  // adaptive coverage guidance replaces the flat "prefer fewer questions"
  // rule (count now scales with how much real material exists, no cap);
  // expanded ~29-category vocabulary the model selects from; per-question
  // `sourceTag`/`priority`/`difficulty` grounding; priority topics become a
  // study roadmap via `studyPoints`; answer prompt deepened for teaching-
  // quality, non-repetitive answers.
  interview_prep: "3",
  // v1 (Module 7C): three prompts, one per phase — Planning (14-step
  // reasoning: resume → job → company → role → round → user context →
  // Resume Match → ATS → Optimizer → Cover Letter → Interview Prep →
  // interview notes → previous mock-interview answers → strategy), the Live
  // Turn decision framework (evaluate the answer, then choose one of
  // probe/challenge/clarify/example/cross_reference/follow_up/new_competency/
  // answer_candidate_question/conclude), and the Final Report (evidence-first,
  // every claim traceable to a turn_index).
  // v2 (Module 7C live-test fix): the report prompt gained an explicit 0-100
  // scoring scale with calibration bands. Caught live: without an anchor the
  // model defaulted to a small familiar scale (e.g. scores clustered 2-4)
  // while `hiringRecommendation.decision` stayed reasonable — a 3/100 score
  // shown next to "Leaning Hire". Planning and live-turn prompts unchanged.
  // v3 (7C realism pass): planning and live-turn prompts rewritten around the
  // 9-stage INTERVIEW_ARC (greeting → candidate intro → résumé deep dive →
  // role → company → role-specific → behavioral → deep dive → wrap-up), an
  // opening that must greet/frame/ask exactly one "tell me about yourself"
  // variant instead of opening cold on a hard question, per-session opening
  // style variation (OPENING_STYLES), a hard 2-follow-up budget per main
  // question stated as server-counted fact, explicit transition phrasing
  // between topics, and 20-30 minute pacing (10-16 exchanges).
  // v4 (7C final polish): coverage-first question selection (untouched CORE
  // competencies are surfaced explicitly and become the default next move, so
  // one area can no longer dominate), a much wider transition palette with an
  // explicit ban on repeating "Let's shift", pacing restated as 8-10 main
  // questions / 10-18 exchanges, and the report's new
  // "Additional Questions You Should Prepare" section.
  mock_interview: "4",
  // v1 (Module 8B): first AI Recommendations prompt — phrases pre-selected,
  // pre-verified candidates using only the exact numbers/names given to it;
  // see features/recommendations/prompt.ts.
  recommendations: "1",
};

// ── Deterministic resume parser (independent of the AI engine) ──
// Bump on any change to parsing/section-detection logic — reuse-by-hash only
// reuses a cached parse when its parser_version matches, so a version bump
// makes already-uploaded resumes self-heal on the next (re)parse instead of
// serving a stale/incorrect analysis forever.
export const RESUME_PARSER_VERSION = "1.2.0";

// ── Structured, machine-readable codes returned in AI response envelopes ──
export const AI_RESULT_CODES = {
  OK: "ok",
  LIMIT_REACHED: "ai_limit_reached",
  VALIDATION_ERROR: "validation_error",
  PROVIDER_ERROR: "provider_error",
  CONFIG_ERROR: "config_error",
  /**
   * The provider call exceeded `aiConfig.requestTimeoutMs` and was aborted.
   *
   * Distinct from `provider_error` on purpose: a provider error means the
   * upstream said no, a timeout means it never said anything. They need
   * different copy ("try again in a moment" vs "that took too long"), and
   * separating them keeps the ai_runs audit log honest about which failure
   * mode a run actually hit.
   */
  TIMEOUT: "timeout",
  UNKNOWN_ERROR: "unknown_error",
} as const;

export type AIResultCode = (typeof AI_RESULT_CODES)[keyof typeof AI_RESULT_CODES];
