import { z } from "zod";

// ── Interview Preparation AI output schemas (Module 7B, intelligence upgrade) ──
//
// Lives here rather than in features/ai/schemas/capabilities.ts for the same
// reason Cover Letter and the Resume Optimizer keep their own: the registry's
// `InterviewPrepResultSchema` is the frozen 6A placeholder bound to
// `runCapability`, and this feature runs a dedicated orchestration (see
// server/ai/InterviewPrepAIService.ts). Nothing in the frozen AI engine changes.
//
// ── Why `internal` comes first ──
// OpenAI structured outputs emit properties in schema order, so declaring the
// reasoning fields BEFORE the workspace content forces the model to work
// through the required 12-step reasoning order (resume → job description →
// role → company description → interview round → additional user context →
// previous resume match → ATS analysis → resume optimizer → cover letter →
// existing interview notes → build interview strategy) before producing a
// single question. `internal` is stored for quality debugging and is never
// shown to the user.
//
// Steps 7-10 (prior AI analyses) are OPTIONAL signal: when no such analysis
// exists for this resume+job, the corresponding field is an empty string —
// never a guess at what that analysis might have said.
//
// Every field carries a `.catch()` fallback, matching the defensive pattern
// used by every other capability: a malformed value degrades instead of
// failing a run the user already paid 3 credits for.

const PrepInternalSchema = z
  .object({
    /** Step 1 — Resume: the candidate's relevant background, strengths and gaps. */
    resumeAnalysis: z.string().catch(""),
    /** Step 2 — Job Description: what the posting is really hiring for. */
    jobAnalysis: z.string().catch(""),
    /** Step 3 — Role: seniority, scope and expectations implied by this specific title. */
    roleAnalysis: z.string().catch(""),
    /** Step 4 — Company Description: what is actually known about the company. */
    companyAnalysis: z.string().catch(""),
    /** Step 5 — Interview Round: what THIS round exists to test. */
    roundAnalysis: z.string().catch(""),
    /** Step 6 — Additional User Context: what the candidate's own notes imply for prep. Empty if none given. */
    userContextAnalysis: z.string().catch(""),
    /** Step 7 — Previous Resume Match analysis for this resume+job, if one exists. Empty if none. */
    resumeMatchInsights: z.string().catch(""),
    /** Step 8 — Previous ATS analysis for this resume+job, if one exists. Empty if none. */
    atsInsights: z.string().catch(""),
    /** Step 9 — Previous Resume Optimizer output for this resume, if one exists. Empty if none. */
    optimizerInsights: z.string().catch(""),
    /** Step 10 — A cover letter written for this resume+job, if one exists. Empty if none. */
    coverLetterInsights: z.string().catch(""),
    /** Step 11 — The candidate's own existing notes on this interview, if any. Empty if none. */
    interviewNotesInsights: z.string().catch(""),
    /** Step 12a — Build Interview Strategy: resume areas most likely to draw a follow-up. */
    riskyResumeAreas: z.array(z.string()).catch([]),
    /** Step 12b — what the interviewer is likely to weigh most heavily. */
    interviewerPriorities: z.array(z.string()).catch([]),
    /** Step 12c — why THESE questions and categories, over other plausible ones. */
    questionSelectionRationale: z.string().catch(""),
    /** Step 12d — how everything above becomes one preparation strategy. */
    preparationStrategy: z.string().catch(""),
  })
  .catch({
    resumeAnalysis: "",
    jobAnalysis: "",
    roleAnalysis: "",
    companyAnalysis: "",
    roundAnalysis: "",
    userContextAnalysis: "",
    resumeMatchInsights: "",
    atsInsights: "",
    optimizerInsights: "",
    coverLetterInsights: "",
    interviewNotesInsights: "",
    riskyResumeAreas: [],
    interviewerPriorities: [],
    questionSelectionRationale: "",
    preparationStrategy: "",
  });

export type PrepInternal = z.infer<typeof PrepInternalSchema>;

/** Priority for a High Priority Preparation Topic. */
export const PREP_PRIORITY_LEVELS = ["critical", "important", "good_to_know"] as const;
export type PrepPriority = (typeof PREP_PRIORITY_LEVELS)[number];

/** Priority for an individual interview question — same 3 levels, different wording than topic priority. */
export const QUESTION_PRIORITY_LEVELS = ["must_prepare", "important", "good_to_know"] as const;
export type QuestionPriority = (typeof QUESTION_PRIORITY_LEVELS)[number];

export const QUESTION_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

/**
 * The AI selects only the categories that actually apply to this interview —
 * this is a vocabulary to choose from, not a checklist to fill in. A closed
 * enum (rather than freeform text) keeps the UI's grouping/icon logic sound;
 * `.catch("behavioral")` degrades safely if the model returns something else.
 */
export const QUESTION_CATEGORIES = [
  "resume_deep_dive",
  "behavioral",
  "leadership",
  "ownership",
  "conflict_resolution",
  "failure",
  "success",
  "product_sense",
  "product_design",
  "product_strategy",
  "execution",
  "roadmapping",
  "prioritization",
  "trade_offs",
  "stakeholder_management",
  "analytics",
  "metrics",
  "experimentation",
  "ab_testing",
  "growth",
  "technical_understanding",
  "architecture_awareness",
  "sql",
  "data_interpretation",
  "role_specific",
  "company_specific",
  "project_deep_dive",
  "case_study",
  "estimation",
  "communication",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const CHECKLIST_CATEGORIES = ["logistics", "research", "practice", "materials"] as const;
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];

const EvaluationCriterionSchema = z.object({
  criterion: z.string().catch(""),
  why: z.string().catch(""),
  howToDemonstrate: z.string().catch(""),
});

const PriorityTopicSchema = z.object({
  topic: z.string().catch(""),
  why: z.string().catch(""),
  priority: z.enum(PREP_PRIORITY_LEVELS).catch("important"),
  /**
   * The specific, nameable things to revise under this topic — e.g. for
   * "Product Metrics": ["North Star Metrics", "Activation Metrics",
   * "Retention Metrics", "Experiment Success Metrics"]. This is what turns a
   * generic topic label into a personalized study roadmap. May be empty when
   * the topic is already specific enough to stand alone.
   */
  studyPoints: z.array(z.string()).catch([]),
});

/**
 * `id` is whatever the model returns, but it is NEVER trusted as the stable
 * identifier — the server re-assigns q-0, q-1, ... after validation (see
 * InterviewPrepAIService.ts), the same way ResumeOptimizerService assigns
 * s-0, s-1, ... to suggestions. This keeps interview_prep_answers.question_id
 * stable even if the model repeats or omits an id.
 */
const InterviewQuestionSchema = z.object({
  id: z.string().catch(""),
  category: z.enum(QUESTION_CATEGORIES).catch("behavioral"),
  question: z.string().catch(""),
  /** Why THIS question was chosen — must trace to the resume, job, company info, round or user context. */
  whyAsked: z.string().catch(""),
  /**
   * A short, specific "grounded in" tag surfaced right on the question row —
   * e.g. "Your Product internship at Kuku Technologies", "The JD's emphasis
   * on experimentation", "The hiring manager round", "Your note about SQL".
   * Distinct from `whyAsked` (the fuller explanation shown on expand): this
   * is the at-a-glance trust signal.
   */
  sourceTag: z.string().catch(""),
  priority: z.enum(QUESTION_PRIORITY_LEVELS).catch("important"),
  difficulty: z.enum(QUESTION_DIFFICULTIES).catch("medium"),
  starRelevant: z.boolean().catch(false),
});

const WeakAreaSchema = z.object({
  area: z.string().catch(""),
  concern: z.string().catch(""),
  likelyFollowUp: z.string().catch(""),
  howToAddress: z.string().catch(""),
});

const StarStorySchema = z.object({
  theme: z.string().catch(""),
  /** Which resume experience this theme should be told through. Never invented. */
  suggestedExperience: z.string().catch(""),
  /** The specific resume evidence grounding this suggestion. */
  resumeEvidence: z.string().catch(""),
  guidance: z.string().catch(""),
});

const ChecklistItemSchema = z.object({
  id: z.string().catch(""),
  item: z.string().catch(""),
  category: z.enum(CHECKLIST_CATEGORIES).catch("practice"),
});

export const InterviewPrepDraftSchema = z.object({
  /** Reasoning first — see the note above. Never rendered. */
  internal: PrepInternalSchema,
  /** §1 Interview Overview — 2-4 sentences setting the scene for this specific interview. */
  overview: z.string().catch(""),
  /** §2 What the interviewer is likely evaluating. */
  evaluationCriteria: z.array(EvaluationCriterionSchema).catch([]),
  /** §3 High Priority Preparation Topics — a personalized study roadmap, not generic labels. */
  priorityTopics: z.array(PriorityTopicSchema).catch([]),
  /** §4 Personalized Interview Questions — adaptive count and category mix, full realistic coverage. */
  questions: z.array(InterviewQuestionSchema).catch([]),
  /** §5 Resume Weak Areas. */
  resumeWeakAreas: z.array(WeakAreaSchema).catch([]),
  /** §6 STAR Story Recommendations. */
  starStories: z.array(StarStorySchema).catch([]),
  /** §7 Interview Checklist. */
  checklist: z.array(ChecklistItemSchema).catch([]),
  /** One short closing sentence tying the preparation together. */
  summary: z.string().catch(""),
});

export type InterviewPrepDraft = z.infer<typeof InterviewPrepDraftSchema>;
export type InterviewQuestionDraft = z.infer<typeof InterviewQuestionSchema>;
export type ChecklistItemDraft = z.infer<typeof ChecklistItemSchema>;

// ── Per-question answer (Generate Answer / Regenerate Answer) ──
//
// Scoped to exactly one question — the model sees the full question list plus
// resume and job for narrative consistency, but returns only the answer to the
// one question it was asked for. Mirrors Cover Letter's section-action shape.
// Schema UNCHANGED from the base implementation — only the prompt guiding it
// was deepened (see prompt.ts), so answer persistence/editing stays identical.
export const InterviewAnswerSchema = z.object({
  /** Which resume evidence this answer draws on — shown as a small "grounded in" note. Never rendered as fact-checking UI copy verbatim. */
  relevantExperience: z.string().catch(""),
  /** e.g. "Structured as STAR" — internal, never rendered. */
  structureNote: z.string().catch(""),
  /** The answer itself, plain prose (markdown-subset rich text on the client). */
  answer: z.string().catch(""),
  keyPointsHit: z.array(z.string()).catch([]),
  /** One short sentence describing the answer. Never part of the answer text. */
  note: z.string().catch(""),
});

export type InterviewAnswerDraft = z.infer<typeof InterviewAnswerSchema>;
