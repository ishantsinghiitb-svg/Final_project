import type {
  ChecklistCategory,
  PrepPriority,
  QuestionCategory,
  QuestionDifficulty,
  QuestionPriority,
} from "./schema";

// ── Interview Preparation display constants (Module 7B) ──

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  resume_deep_dive: "Resume Deep Dive",
  behavioral: "Behavioral",
  leadership: "Leadership",
  ownership: "Ownership",
  conflict_resolution: "Conflict Resolution",
  failure: "Failure",
  success: "Success",
  product_sense: "Product Sense",
  product_design: "Product Design",
  product_strategy: "Product Strategy",
  execution: "Execution",
  roadmapping: "Roadmapping",
  prioritization: "Prioritization",
  trade_offs: "Trade-offs",
  stakeholder_management: "Stakeholder Management",
  analytics: "Analytics",
  metrics: "Metrics",
  experimentation: "Experimentation",
  ab_testing: "A/B Testing",
  growth: "Growth",
  technical_understanding: "Technical Understanding",
  architecture_awareness: "Architecture Awareness",
  sql: "SQL",
  data_interpretation: "Data Interpretation",
  role_specific: "Role-specific",
  company_specific: "Company-specific",
  project_deep_dive: "Project Deep Dive",
  case_study: "Case Study",
  estimation: "Estimation",
  communication: "Communication",
};

/**
 * Display order for question category groups — only categories the AI
 * actually used ever render, so this just decides ordering among whatever
 * subset shows up: resume/behavioral-style first, then product & strategy,
 * then execution & analytics, then technical, then role/company-specific,
 * then everything else.
 */
export const QUESTION_CATEGORY_ORDER: QuestionCategory[] = [
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
];

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  logistics: "Logistics",
  research: "Research",
  practice: "Practice",
  materials: "Materials",
};

export const PREP_PRIORITY_LABELS: Record<PrepPriority, string> = {
  critical: "Critical",
  important: "Important",
  good_to_know: "Good to know",
};

/** Tone used by the shared `Chip` component — matches the priority's urgency. */
export const PREP_PRIORITY_TONE: Record<PrepPriority, "rose" | "amber" | "blue"> = {
  critical: "rose",
  important: "amber",
  good_to_know: "blue",
};

export const QUESTION_PRIORITY_LABELS: Record<QuestionPriority, string> = {
  must_prepare: "Must prepare",
  important: "Important",
  good_to_know: "Good to know",
};

export const QUESTION_PRIORITY_TONE: Record<QuestionPriority, "rose" | "amber" | "blue"> = {
  must_prepare: "rose",
  important: "amber",
  good_to_know: "blue",
};

export const QUESTION_DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const INTERVIEW_PREP_CREDIT_COST = 3;

/**
 * Module 13 · Phase 2 (B1): generating/regenerating an answer for any
 * question is free within an active session, otherwise uncapped — the
 * session marker only ever proved the 3-credit generation had been paid
 * once, not how many free answer calls it could be spent on. A prep
 * typically has 8-25 questions; 60 gives generous headroom for answering
 * every question plus several regenerates, while bounding a scripted loop
 * against a single paid session to a fixed number of provider calls.
 * Matches the same order of magnitude as MOCK_INTERVIEW_MAX_TURNS.
 */
export const INTERVIEW_PREP_MAX_SESSION_ACTIONS = 60;
