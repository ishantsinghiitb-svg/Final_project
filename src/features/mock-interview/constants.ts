import type {
  Competency,
  CompetencyPriority,
  CoverageStatus,
  EndedReason,
  HiringDecision,
  MockSessionStatus,
  TurnAction,
} from "./schema";

// ── Mock Interview Studio display + limit constants (Module 7C) ──

/** Same literal-duplication convention as INTERVIEW_PREP_CREDIT_COST — mirrors AI_CREDIT_COSTS.mock_interview. */
export const MOCK_INTERVIEW_CREDIT_COST = 5;

// ── Hard server-side backstops (see MockInterviewAIService.ts) ──
//
// A live conversation session is otherwise an unbounded cost commitment.
// These are backstops, not targets — the planning phase sets its own
// targetTurnRange/expectedDurationMinutes as SOFT guidance the live turn
// prompt can exceed for genuine follow-up. Typical sessions land at 12-25
// turns and 25-40 minutes, well under every limit below.
export const MOCK_INTERVIEW_MAX_TURNS = 60;
export const MOCK_INTERVIEW_MAX_LIVE_MS = 90 * 60_000;
export const MOCK_INTERVIEW_RESUME_WINDOW_DAYS = 14;
export const MOCK_INTERVIEW_MAX_ANSWER_CHARS = 6_000;
export const MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS = 3;

export const MOCK_SESSION_STATUS_LABELS: Record<MockSessionStatus, string> = {
  active: "In progress",
  paused: "Paused",
  concluded: "Completed",
  failed: "Failed",
};

export const ENDED_REASON_LABELS: Record<EndedReason, string> = {
  user_ended: "You ended the interview",
  ai_concluded: "The interviewer concluded the interview",
  limit_reached: "The interview reached its time limit",
  expired: "Auto-completed after being paused too long",
};

export const COMPETENCY_LABELS: Record<Competency, string> = {
  resume_deep_dive: "Resume Deep Dive",
  behavioral: "Behavioral",
  leadership: "Leadership",
  ownership: "Ownership",
  conflict_resolution: "Conflict Resolution",
  communication: "Communication",
  product_sense: "Product Sense",
  product_design: "Product Design",
  metrics: "Metrics",
  funnel_analysis: "Funnel Analysis",
  dropoff_analysis: "Drop-off Analysis",
  prioritization: "Prioritization",
  trade_offs: "Trade-offs",
  roadmapping: "Roadmaps",
  stakeholder_management: "Stakeholder Management",
  growth: "Growth",
  experimentation: "Experimentation",
  ab_testing: "A/B Testing",
  execution: "Execution",
  coding: "Coding",
  architecture: "Architecture",
  system_design: "System Design",
  debugging: "Debugging",
  scalability: "Scalability",
  technical_trade_offs: "Technical Trade-offs",
  technical_understanding: "Technical Understanding",
  sql: "SQL",
  data_interpretation: "Data Interpretation",
  campaigns: "Campaigns",
  cac_analysis: "CAC Analysis",
  roi_analysis: "ROI Analysis",
  marketing_funnels: "Marketing Funnels",
  accounting: "Accounting",
  valuation: "Valuation",
  financial_modeling: "Financial Modeling",
  excel_modeling: "Excel Modeling",
  case_discussion: "Case Discussion",
  discovery: "Discovery",
  negotiation: "Negotiation",
  objection_handling: "Objection Handling",
  pipeline_management: "Pipeline Management",
  revenue_ownership: "Revenue Ownership",
  analytics: "Analytics",
  estimation: "Estimation",
  project_deep_dive: "Project Deep Dive",
  company_specific: "Company-specific",
  role_specific: "Role-specific",
};

export const COMPETENCY_PRIORITY_LABELS: Record<CompetencyPriority, string> = {
  core: "Core",
  supporting: "Supporting",
  optional: "Optional",
};

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  covered: "Covered",
};

export const TURN_ACTION_LABELS: Record<TurnAction, string> = {
  open: "Opening",
  probe: "Probing deeper",
  challenge: "Challenging",
  clarify: "Clarifying",
  example: "Asking for an example",
  cross_reference: "Cross-referencing",
  follow_up: "Following up",
  new_competency: "Moving on",
  answer_candidate_question: "Answering your question",
  close: "Closing",
};

export const HIRING_DECISION_LABELS: Record<HiringDecision, string> = {
  strong_yes: "Strong Hire",
  yes: "Hire",
  leaning_yes: "Leaning Hire",
  leaning_no: "Leaning No Hire",
  no: "No Hire",
  strong_no: "Strong No Hire",
};

export const HIRING_DECISION_TONE: Record<HiringDecision, "green" | "blue" | "amber" | "rose"> = {
  strong_yes: "green",
  yes: "green",
  leaning_yes: "blue",
  leaning_no: "amber",
  no: "rose",
  strong_no: "rose",
};
