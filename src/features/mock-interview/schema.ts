import { z } from "zod";

// ── AI Mock Interview Studio output schemas (Module 7C) ──
//
// Three schemas, one per phase, mirroring how Cover Letter Studio and 7B
// Interview Preparation each keep their own dedicated schema rather than the
// frozen 6A registry placeholder (see MockInterviewResultSchema in
// features/ai/schemas/capabilities.ts). None of these are validated through
// AIService.runCapability — the orchestration (server/ai/MockInterviewAIService.ts)
// calls the provider directly with whichever of these three is active for the
// current phase.
//
// Every `internal` block is declared FIRST in its schema so structured-output
// field ordering forces the model to reason before it produces anything
// user-facing — the same technique 7B and Cover Letter Studio use. `internal`
// content is stored for quality debugging only and is NEVER sent to the
// client (see types.ts — the wire types omit it entirely).
//
// Every field carries a `.catch()` fallback: a malformed value degrades
// instead of failing a turn the user is mid-conversation in, or a session
// they already paid 5 credits for.

// ── Interviewer action vocabulary ──
//
// What the interviewer chose to do on THIS turn, after evaluating the
// candidate's previous answer. Drives the transcript UI's small per-turn
// icon/label — never shown as literal text to the candidate.
export const TURN_ACTIONS = [
  "open",
  "probe",
  "challenge",
  "clarify",
  "example",
  "cross_reference",
  "follow_up",
  "new_competency",
  "answer_candidate_question",
  "close",
] as const;
export type TurnAction = (typeof TURN_ACTIONS)[number];

export const ANSWER_INPUT_MODES = ["voice", "text", "mixed", "skipped"] as const;
export type AnswerInputMode = (typeof ANSWER_INPUT_MODES)[number];

export const MOCK_SESSION_STATUSES = ["active", "paused", "concluded", "failed"] as const;
export type MockSessionStatus = (typeof MOCK_SESSION_STATUSES)[number];

export const ENDED_REASONS = ["user_ended", "ai_concluded", "limit_reached", "expired"] as const;
export type EndedReason = (typeof ENDED_REASONS)[number];

/**
 * What is being EVALUATED, not what TYPE of question was asked (that
 * distinction is why this is its own vocabulary rather than a re-import of
 * 7B's QUESTION_CATEGORIES — a "Prioritization" competency can be probed
 * through several different question styles). A closed enum, same rationale
 * as 7B: keeps coverage tracking, the report's competency scores, and the
 * UI's icon/label lookup all keyed consistently. The AI selects only the
 * subset that applies to this interview — never a checklist to fill in.
 */
export const COMPETENCIES = [
  // Universal
  "resume_deep_dive",
  "behavioral",
  "leadership",
  "ownership",
  "conflict_resolution",
  "communication",
  // Product
  "product_sense",
  "product_design",
  "metrics",
  "funnel_analysis",
  "dropoff_analysis",
  "prioritization",
  "trade_offs",
  "roadmapping",
  "stakeholder_management",
  "growth",
  "experimentation",
  "ab_testing",
  "execution",
  // Engineering
  "coding",
  "architecture",
  "system_design",
  "debugging",
  "scalability",
  "technical_trade_offs",
  "technical_understanding",
  "sql",
  "data_interpretation",
  // Marketing
  "campaigns",
  "cac_analysis",
  "roi_analysis",
  "marketing_funnels",
  // Finance
  "accounting",
  "valuation",
  "financial_modeling",
  "excel_modeling",
  "case_discussion",
  // Sales
  "discovery",
  "negotiation",
  "objection_handling",
  "pipeline_management",
  "revenue_ownership",
  // General
  "analytics",
  "estimation",
  "project_deep_dive",
  "company_specific",
  "role_specific",
] as const;
export type Competency = (typeof COMPETENCIES)[number];

export const COMPETENCY_PRIORITIES = ["core", "supporting", "optional"] as const;
export type CompetencyPriority = (typeof COMPETENCY_PRIORITIES)[number];

export const DEPTH_EXPECTATIONS = ["surface", "moderate", "deep"] as const;
export type DepthExpectation = (typeof DEPTH_EXPECTATIONS)[number];

export const COVERAGE_STATUSES = ["not_started", "in_progress", "covered"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

/**
 * The arc a real interview moves through, in the order it normally happens.
 *
 * This is a VOCABULARY for the model to navigate with, not a script and not a
 * fixed allocation: the planner decides how much of the interview each stage
 * deserves (a fresher's `resume_deep_dive` leans on projects and coursework, a
 * senior candidate's leans on scope and ownership), and some stages are
 * legitimately skipped — an HR screen may never reach `deep_dive`, and
 * `company_discussion` is pointless when the posting says almost nothing about
 * the company. What it prevents is the failure this replaced: opening cold on
 * a hard role-specific question with no greeting, no framing, and no attempt
 * to understand the candidate first.
 *
 * Declared in narrative order — `stageOrder()` relies on the array index.
 */
export const INTERVIEW_STAGES = [
  /** Greeting, who the interviewer is, brief framing of how the session will run. */
  "opening",
  /** "Tell me about yourself" — exactly one of its several forms. */
  "candidate_intro",
  /** Their actual background: projects, experience, impact, ownership, failures. */
  "resume_deep_dive",
  /** Why this role, what they think it involves, what they want from it. */
  "role_discussion",
  /** Company / product awareness, where the posting supports it. */
  "company_discussion",
  /** The competencies this specific role is hired on. */
  "role_specific",
  /** Behavioral: leadership, conflict, ownership, failure, collaboration. */
  "behavioral",
  /** Case, scenario, or deep technical/product discussion. */
  "deep_dive",
  /** Closing: any questions for the interviewer, natural sign-off. */
  "wrap_up",
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

/** Position of a stage in the natural arc — lets callers reason about forward/backward movement. */
export function stageOrder(stage: InterviewStage): number {
  return INTERVIEW_STAGES.indexOf(stage);
}

export const HIRING_DECISIONS = [
  "strong_yes",
  "yes",
  "leaning_yes",
  "leaning_no",
  "no",
  "strong_no",
] as const;
export type HiringDecision = (typeof HIRING_DECISIONS)[number];

// ════════════════════════════════════════════════════════════════════════
// Phase 1 — Planning (charged, once per session)
// ════════════════════════════════════════════════════════════════════════

const PlanInternalSchema = z
  .object({
    /** Step 1 — Resume. */
    resumeAnalysis: z.string().catch(""),
    /** Step 2 — Job Description. */
    jobAnalysis: z.string().catch(""),
    /** Step 3 — Company Description. */
    companyAnalysis: z.string().catch(""),
    /** Step 4 — Role. */
    roleAnalysis: z.string().catch(""),
    /** Step 5 — Interview Round. */
    roundAnalysis: z.string().catch(""),
    /** Step 6 — Additional (candidate-supplied "focus") context. Empty if none given. */
    focusAnalysis: z.string().catch(""),
    /** Step 7 — Prior Resume Match analysis, if one exists. Empty if none. */
    resumeMatchInsights: z.string().catch(""),
    /** Step 8 — Prior ATS analysis, if one exists. Empty if none. */
    atsInsights: z.string().catch(""),
    /** Step 9 — Prior Resume Optimizer output, if one exists. Empty if none. */
    optimizerInsights: z.string().catch(""),
    /** Step 10 — A cover letter written for this resume+job, if one exists. Empty if none. */
    coverLetterInsights: z.string().catch(""),
    /** Step 11 — This interview's 7B Interview Preparation workspace, if generated. Empty if none. */
    interviewPrepInsights: z.string().catch(""),
    /** Step 12 — The candidate's own notes on this interview, if any. Empty if none. */
    interviewNotesInsights: z.string().catch(""),
    /** Step 13 — Prior mock interview sessions on THIS interview, if any. Empty if none. */
    previousMockInterviewInsights: z.string().catch(""),
    /** Step 14a — How everything above becomes one interview strategy. */
    strategyRationale: z.string().catch(""),
    /** Step 14b — why these competencies and this arc, over other plausible ones. */
    competencySelectionRationale: z.string().catch(""),
  })
  .catch({
    resumeAnalysis: "",
    jobAnalysis: "",
    companyAnalysis: "",
    roleAnalysis: "",
    roundAnalysis: "",
    focusAnalysis: "",
    resumeMatchInsights: "",
    atsInsights: "",
    optimizerInsights: "",
    coverLetterInsights: "",
    interviewPrepInsights: "",
    interviewNotesInsights: "",
    previousMockInterviewInsights: "",
    strategyRationale: "",
    competencySelectionRationale: "",
  });

/**
 * The distilled candidate profile every LIVE TURN prompt reuses instead of
 * the raw résumé — this is what keeps a 15-30 turn conversation fast: the
 * résumé is read once, at planning time, not re-read on every answer.
 */
const CandidateProfileSchema = z.object({
  headline: z.string().catch(""),
  keyExperiences: z.array(z.string()).catch([]),
  provenStrengths: z.array(z.string()).catch([]),
  /** Resume/experience areas worth probing further — never invented, always traceable. */
  gapsToProbe: z.array(z.string()).catch([]),
  /** Specific claims (numbers, outcomes, scope) worth verifying with a follow-up. */
  claimsToVerify: z.array(z.string()).catch([]),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

const InterviewerBriefSchema = z.object({
  roleLabel: z.string().catch(""),
  style: z.string().catch(""),
  priorities: z.array(z.string()).catch([]),
  depthExpectation: z.enum(DEPTH_EXPECTATIONS).catch("moderate"),
});
export type InterviewerBrief = z.infer<typeof InterviewerBriefSchema>;

const CompetencyMapEntrySchema = z.object({
  id: z.enum(COMPETENCIES).catch("behavioral"),
  label: z.string().catch(""),
  whyItMatters: z.string().catch(""),
  priority: z.enum(COMPETENCY_PRIORITIES).catch("supporting"),
  sampleAngles: z.array(z.string()).catch([]),
});
export type CompetencyMapEntry = z.infer<typeof CompetencyMapEntrySchema>;

const PlannedArcStageSchema = z.object({
  stage: z.enum(INTERVIEW_STAGES).catch("resume_deep_dive"),
  purpose: z.string().catch(""),
  approxQuestions: z.number().int().min(0).max(15).catch(2),
});
export type PlannedArcStage = z.infer<typeof PlannedArcStageSchema>;

export const MockInterviewPlanSchema = z.object({
  /** Reasoning first — see the note above. Never rendered. */
  internal: PlanInternalSchema,
  candidateProfile: CandidateProfileSchema,
  interviewerBrief: InterviewerBriefSchema,
  competencyMap: z.array(CompetencyMapEntrySchema).catch([]),
  plannedArc: z.array(PlannedArcStageSchema).catch([]),
  /**
   * Soft guidance, not a hard cap — the live turn prompt is told this is a
   * target, not a stopping rule. MAX_TURNS (constants.ts) is the actual
   * server-enforced backstop. Defaults target a realistic 20-30 minute
   * interview: 8-10 main questions, each allowing up to 2 follow-ups (see
   * followUps.ts), which lands at roughly 10-18 exchanges.
   */
  targetTurnRange: z
    .object({
      min: z.number().int().min(4).max(60).catch(10),
      max: z.number().int().min(4).max(60).catch(18),
    })
    .catch({ min: 10, max: 18 }),
  expectedDurationMinutes: z.number().int().min(5).max(90).catch(25),
  /**
   * The opening line the candidate sees first. Unlike every later turn this is
   * a small composite — greeting, who the interviewer is, one line of framing,
   * then a single candidate-introduction question — because that is how real
   * interviews actually start. See OPENING_STYLES in prompt.ts for how its
   * phrasing is varied per session.
   */
  openingMessage: z.string().catch(""),
});
export type MockInterviewPlan = z.infer<typeof MockInterviewPlanSchema>;

// ════════════════════════════════════════════════════════════════════════
// Phase 2 — Live turn (free, once per candidate answer)
// ════════════════════════════════════════════════════════════════════════

const StarCoverageSchema = z
  .object({
    situation: z.boolean().catch(false),
    task: z.boolean().catch(false),
    action: z.boolean().catch(false),
    result: z.boolean().catch(false),
  })
  .catch({ situation: false, task: false, action: false, result: false });

const AnswerEvaluationSchema = z
  .object({
    competencyId: z.enum(COMPETENCIES).catch("behavioral"),
    score1to5: z.number().int().min(1).max(5).catch(3),
    signals: z.array(z.string()).catch([]),
    concerns: z.array(z.string()).catch([]),
    specificity: z.enum(["low", "medium", "high"]).catch("medium"),
    evidenceQuality: z.enum(["weak", "adequate", "strong"]).catch("adequate"),
    structure: z.enum(["poor", "adequate", "clear"]).catch("adequate"),
    starCoverage: StarCoverageSchema,
    claimsMade: z.array(z.string()).catch([]),
    /** Only populated when this answer conflicts with something said earlier. */
    contradictionsWithEarlier: z.array(z.string()).catch([]),
  })
  .catch({
    competencyId: "behavioral",
    score1to5: 3,
    signals: [],
    concerns: [],
    specificity: "medium",
    evidenceQuality: "adequate",
    structure: "adequate",
    starCoverage: { situation: false, task: false, action: false, result: false },
    claimsMade: [],
    contradictionsWithEarlier: [],
  });

const TurnInternalSchema = z
  .object({
    /** Evaluates the answer the candidate just gave to the previous question. Nullable only as a defensive fallback if the model degrades — every real call to this schema has a real answer to evaluate. */
    answerEvaluation: AnswerEvaluationSchema.nullable().catch(null),
    whatIsEstablished: z.string().catch(""),
    whatIsStillUnknown: z.string().catch(""),
    /**
     * Which stage of the arc the interview is in RIGHT NOW, decided before
     * choosing an action. Declared here (before `action`) on purpose: an
     * interviewer picks the move that fits where the conversation actually
     * is, and reasoning about stage after picking the move produces the
     * abrupt topic jumps this ordering exists to prevent.
     */
    currentStage: z.enum(INTERVIEW_STAGES).catch("resume_deep_dive"),
    /** Why that stage, and whether it's time to move to the next one. */
    stageRationale: z.string().catch(""),
    optionsConsidered: z
      .array(
        z.object({
          option: z.string().catch(""),
          appeal: z.string().catch(""),
          drawback: z.string().catch(""),
        }),
      )
      .catch([]),
    decisionRationale: z.string().catch(""),
  })
  .catch({
    answerEvaluation: null,
    whatIsEstablished: "",
    whatIsStillUnknown: "",
    currentStage: "resume_deep_dive",
    stageRationale: "",
    optionsConsidered: [],
    decisionRationale: "",
  });

const CoverageUpdateEntrySchema = z.object({
  competencyId: z.enum(COMPETENCIES).catch("behavioral"),
  status: z.enum(COVERAGE_STATUSES).catch("in_progress"),
});

export const MockInterviewTurnSchema = z.object({
  /** Reasoning first — evaluate BEFORE deciding what to say next. Never rendered. */
  internal: TurnInternalSchema,
  /** Compact carry-forward summary replacing the previous one — the ONLY conversational memory the next turn's prompt gets besides the transcript tail. */
  rollingSummary: z.string().catch(""),
  coverageUpdate: z.array(CoverageUpdateEntrySchema).catch([]),
  action: z.enum(TURN_ACTIONS).catch("follow_up"),
  targetCompetencyId: z.enum(COMPETENCIES).catch("behavioral"),
  /** Set only for action="cross_reference" — the earlier turn_index being referenced. */
  referencesTurnIndex: z.number().int().min(0).nullable().catch(null),
  /**
   * Soft signal only — the server enforces targetTurnRange.min and the hard
   * MAX_TURNS/MAX_LIVE_MS backstops regardless of this flag. See
   * MockInterviewAIService.submitAnswer.
   */
  shouldConclude: z.boolean().catch(false),
  concludeReason: z.string().catch(""),
  /** LAST. The only field ever shown to the candidate (spoken + displayed). */
  message: z.string().catch(""),
});
export type MockInterviewTurnDraft = z.infer<typeof MockInterviewTurnSchema>;
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

// ════════════════════════════════════════════════════════════════════════
// Phase 3 — Final report (free, generatable up to MAX_REPORT_ATTEMPTS times)
// ════════════════════════════════════════════════════════════════════════

/** Anything citing a specific exchange carries the turn it's grounded in — the server drops any citation whose turnIndex doesn't exist in this session's transcript. */
const TurnCitationSchema = z.object({ turnIndex: z.number().int().min(0).catch(0) });

const ReportInternalSchema = z
  .object({
    scoringRationale: z.string().catch(""),
    /** An explicit pre-return sanity pass: does every score/citation trace to something that actually happened in the transcript? */
    calibrationCheck: z.string().catch(""),
  })
  .catch({ scoringRationale: "", calibrationCheck: "" });

const CompetencyScoreSchema = z.object({
  competencyId: z.enum(COMPETENCIES).catch("behavioral"),
  label: z.string().catch(""),
  score: z.number().int().min(0).max(100).catch(50),
  evidence: z.string().catch(""),
  turnIndexes: z.array(z.number().int().min(0)).catch([]),
});

const AnswerHighlightSchema = TurnCitationSchema.extend({
  question: z.string().catch(""),
  why: z.string().catch(""),
});

const MissedOpportunitySchema = TurnCitationSchema.extend({
  whatWasMissed: z.string().catch(""),
  whatToSayInstead: z.string().catch(""),
});

const SuggestedBetterAnswerSchema = TurnCitationSchema.extend({
  question: z.string().catch(""),
  suggestedAnswer: z.string().catch(""),
  /** What résumé/transcript evidence this suggestion draws on — never invented. */
  groundedIn: z.string().catch(""),
});

const StarExampleSchema = TurnCitationSchema.extend({ note: z.string().catch("") });

const StudyPlanItemSchema = z.object({
  topic: z.string().catch(""),
  why: z.string().catch(""),
  actions: z.array(z.string()).catch([]),
});

export const MockInterviewReportSchema = z.object({
  internal: ReportInternalSchema,
  overallPerformance: z
    .object({
      score: z.number().int().min(0).max(100).catch(50),
      headline: z.string().catch(""),
    })
    .catch({ score: 50, headline: "" }),
  interviewSummary: z.string().catch(""),
  hiringRecommendation: z
    .object({
      decision: z.enum(HIRING_DECISIONS).catch("leaning_yes"),
      rationale: z.string().catch(""),
      whatWouldChangeIt: z.string().catch(""),
    })
    .catch({ decision: "leaning_yes", rationale: "", whatWouldChangeIt: "" }),
  strengths: z.array(z.string()).catch([]),
  weaknesses: z.array(z.string()).catch([]),
  competencyScores: z.array(CompetencyScoreSchema).catch([]),
  communicationAnalysis: z
    .object({
      summary: z.string().catch(""),
      strengths: z.array(z.string()).catch([]),
      improvements: z.array(z.string()).catch([]),
    })
    .catch({ summary: "", strengths: [], improvements: [] }),
  confidenceAnalysis: z
    .object({ summary: z.string().catch(""), signals: z.array(z.string()).catch([]) })
    .catch({ summary: "", signals: [] }),
  starEvaluation: z
    .object({
      usedStarMethod: z.boolean().catch(false),
      summary: z.string().catch(""),
      strongExamples: z.array(StarExampleSchema).catch([]),
      weakExamples: z.array(StarExampleSchema).catch([]),
    })
    .catch({ usedStarMethod: false, summary: "", strongExamples: [], weakExamples: [] }),
  bestAnswers: z.array(AnswerHighlightSchema).catch([]),
  weakAnswers: z.array(AnswerHighlightSchema).catch([]),
  missedOpportunities: z.array(MissedOpportunitySchema).catch([]),
  suggestedBetterAnswers: z.array(SuggestedBetterAnswerSchema).catch([]),
  recommendedImprovements: z
    .array(
      z.object({
        area: z.string().catch(""),
        why: z.string().catch(""),
        how: z.string().catch(""),
      }),
    )
    .catch([]),
  studyPlan: z.array(StudyPlanItemSchema).catch([]),
  recommendedTopics: z.array(z.string()).catch([]),
  /**
   * Questions this role commonly gets that this interview did NOT cover — the
   * "what else should I be ready for?" the candidate would otherwise have to
   * guess at. Distinct from `recommendedTopics` (areas to study): these are
   * literal questions they can rehearse.
   *
   * Grounded in general interview patterns for the role, never in an invented
   * company-specific process — see the report prompt's rule.
   */
  additionalQuestionsToPrepare: z
    .array(
      z.object({
        question: z.string().catch(""),
        why: z.string().catch(""),
        competencyId: z.enum(COMPETENCIES).catch("role_specific"),
      }),
    )
    .catch([]),
  nextMockInterview: z
    .object({
      recommendedFocus: z.string().catch(""),
      recommendedInterviewerRole: z.string().catch(""),
      rationale: z.string().catch(""),
    })
    .catch({ recommendedFocus: "", recommendedInterviewerRole: "", rationale: "" }),
  closingNote: z.string().catch(""),
});
export type MockInterviewReportDraft = z.infer<typeof MockInterviewReportSchema>;
