import type { DepthExpectation } from "./schema";

// ── Interviewer role catalogue (Module 7C) ──
//
// A deterministic, zero-cost, zero-latency lookup — running an AI call just
// to decide which roles to OFFER on the setup screen would add spinner time
// for no benefit. The AI only ever sees the chosen role's `brief`, rendered
// into the planning prompt; it never invents a role or a company-specific
// interview process (see prompt.ts's hardening note).
//
// `families` decides which roles the launcher offers for a given job/round;
// `suggestedForRounds` decides which one is pre-selected. Both are just UI
// convenience — the candidate can always override.

export type RoleFamily =
  | "product"
  | "engineering"
  | "data"
  | "design"
  | "marketing"
  | "sales"
  | "finance"
  | "operations"
  | "hr"
  | "consulting"
  | "general";

export type InterviewerRoleBrief = {
  /** What this person is trying to determine by the end of the interview. */
  objectives: string[];
  /** What this interviewer weighs most heavily when evaluating an answer. */
  competencyBias: string[];
  /** How they talk — tone/register, rendered directly into the live-turn prompt. */
  style: string;
  depthExpectation: DepthExpectation;
  followUpAppetite: "low" | "medium" | "high";
};

export type InterviewerRoleDef = {
  id: string;
  label: string;
  /** One line shown under the role on the setup screen. */
  blurb: string;
  families: RoleFamily[];
  brief: InterviewerRoleBrief;
  /** Matched case-insensitively, substring, against interviews.type (the round). */
  suggestedForRounds: string[];
};

const ALL_FAMILIES: RoleFamily[] = [
  "product",
  "engineering",
  "data",
  "design",
  "marketing",
  "sales",
  "finance",
  "operations",
  "hr",
  "consulting",
  "general",
];

export const INTERVIEWER_ROLES: InterviewerRoleDef[] = [
  {
    id: "hr_recruiter",
    label: "HR Recruiter",
    blurb: "Screens for fit, motivation and logistics before the team rounds.",
    families: ALL_FAMILIES,
    suggestedForRounds: ["recruiter screen", "hr", "phone screen", "screening"],
    brief: {
      objectives: [
        "confirm the candidate's story and motivation for this role and company",
        "check basic qualification and logistics (availability, compensation expectations, work authorization if relevant)",
        "get a first read on communication and culture fit",
      ],
      competencyBias: ["behavioral", "communication", "role_specific", "company_specific"],
      style: "warm, conversational, broad rather than deep — puts the candidate at ease",
      depthExpectation: "surface",
      followUpAppetite: "low",
    },
  },
  {
    id: "hiring_manager",
    label: "Hiring Manager",
    blurb: "Owns the outcome — focused on whether you can actually do the job.",
    families: [
      "product",
      "engineering",
      "data",
      "design",
      "marketing",
      "sales",
      "finance",
      "operations",
      "consulting",
      "general",
    ],
    suggestedForRounds: ["hiring manager", "manager round"],
    brief: {
      objectives: [
        "determine whether the candidate can perform the core function of the role from day one",
        "probe judgment and ownership on real past situations, not hypotheticals",
        "assess how the candidate would fit into the existing team and its way of working",
      ],
      competencyBias: [
        "execution",
        "ownership",
        "resume_deep_dive",
        "trade_offs",
        "stakeholder_management",
      ],
      style: "direct, practically-minded, presses for specifics and outcomes",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "senior_team_member",
    label: "Senior Team Member",
    blurb: "A peer-level interviewer, evaluating day-to-day working style.",
    families: ALL_FAMILIES,
    suggestedForRounds: ["peer", "team round"],
    brief: {
      objectives: [
        "assess whether the candidate would be a good day-to-day collaborator",
        "test hands-on depth in the actual work, not just strategy",
        "gauge curiosity, coachability and how the candidate handles disagreement",
      ],
      competencyBias: [
        "execution",
        "communication",
        "conflict_resolution",
        "technical_understanding",
      ],
      style: "collegial, curious, asks 'how would you actually do this' questions",
      depthExpectation: "moderate",
      followUpAppetite: "medium",
    },
  },
  {
    id: "product_manager",
    label: "Product Manager",
    blurb: "Digs into product judgment, prioritization and user impact.",
    families: ["product", "general"],
    suggestedForRounds: ["product round"],
    brief: {
      objectives: [
        "assess product sense and how the candidate reasons about users and impact",
        "test prioritization and trade-off judgment under ambiguity",
        "understand how the candidate collaborates across design, engineering and business",
      ],
      competencyBias: ["product_sense", "prioritization", "metrics", "stakeholder_management"],
      style: "curious, likes structured thinking, asks 'walk me through how you'd approach this'",
      depthExpectation: "moderate",
      followUpAppetite: "high",
    },
  },
  {
    id: "senior_product_manager",
    label: "Senior Product Manager",
    blurb: "Expects sharper trade-off reasoning and more ownership.",
    families: ["product"],
    suggestedForRounds: ["senior product round"],
    brief: {
      objectives: [
        "assess depth of product judgment under real constraints, not textbook frameworks",
        "test how the candidate handles ambiguous, high-stakes trade-offs",
        "probe ownership of outcomes, not just outputs shipped",
      ],
      competencyBias: [
        "product_strategy",
        "trade_offs",
        "metrics",
        "execution",
        "stakeholder_management",
      ],
      style: "pushes past the first answer, wants the reasoning, comfortable with silence",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "product_director",
    label: "Product Director",
    blurb: "Zooms out to strategy, scope and organizational judgment.",
    families: ["product"],
    suggestedForRounds: ["director round", "final round"],
    brief: {
      objectives: [
        "assess strategic thinking beyond a single feature or project",
        "evaluate how the candidate scopes ambiguous problems and sets direction",
        "gauge leadership and influence without direct authority",
      ],
      competencyBias: ["product_strategy", "roadmapping", "leadership", "stakeholder_management"],
      style: "big-picture, tests whether the candidate can zoom out and justify a direction",
      depthExpectation: "deep",
      followUpAppetite: "medium",
    },
  },
  {
    id: "vp_product",
    label: "VP of Product",
    blurb: "A senior bar-raiser round — vision, judgment and track record.",
    families: ["product"],
    suggestedForRounds: ["vp round", "executive round", "final round"],
    brief: {
      objectives: [
        "confirm the candidate operates at the level the role requires",
        "assess judgment on genuinely hard, ambiguous calls from their track record",
        "understand how the candidate builds conviction and brings others along",
      ],
      competencyBias: ["product_strategy", "leadership", "trade_offs", "execution"],
      style: "executive, economical with time, wants the headline first then the reasoning",
      depthExpectation: "deep",
      followUpAppetite: "medium",
    },
  },
  {
    id: "engineering_manager",
    label: "Engineering Manager",
    blurb: "Evaluates technical judgment plus how you work with a team.",
    families: ["engineering", "data"],
    suggestedForRounds: ["hiring manager", "manager round"],
    brief: {
      objectives: [
        "assess technical depth relative to the role's seniority",
        "understand how the candidate makes engineering trade-offs under real constraints",
        "gauge how the candidate collaborates, mentors or takes feedback",
      ],
      competencyBias: ["technical_trade_offs", "architecture", "ownership", "leadership"],
      style: "practical, pushes on 'why this approach and not another'",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "senior_software_engineer",
    label: "Senior Software Engineer",
    blurb: "A peer round focused on hands-on technical depth.",
    families: ["engineering"],
    suggestedForRounds: ["technical round", "peer round"],
    brief: {
      objectives: [
        "verify hands-on technical depth matches what the resume claims",
        "test debugging and problem-solving process, not just the final answer",
        "assess code/design quality instincts",
      ],
      competencyBias: ["coding", "debugging", "system_design", "technical_understanding"],
      style: "detail-oriented, asks follow-ups on specifics ('what would you do if that failed')",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "staff_engineer",
    label: "Staff Engineer",
    blurb: "Tests architectural judgment and technical leadership.",
    families: ["engineering"],
    suggestedForRounds: ["system design round", "senior technical round"],
    brief: {
      objectives: [
        "assess system design judgment at scale, including trade-offs and failure modes",
        "understand how the candidate drives technical decisions across a team",
        "probe depth beyond a single project — patterns across their career",
      ],
      competencyBias: ["system_design", "scalability", "architecture", "technical_trade_offs"],
      style: "socratic, keeps asking 'what breaks at 10x scale' style questions",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "cto",
    label: "CTO",
    blurb: "An executive technical round — judgment, scope and leadership.",
    families: ["engineering", "data"],
    suggestedForRounds: ["executive round", "final round"],
    brief: {
      objectives: [
        "confirm technical judgment at the scope this role demands",
        "assess how the candidate balances speed, quality and risk",
        "gauge leadership and communication with non-technical stakeholders",
      ],
      competencyBias: ["architecture", "technical_trade_offs", "leadership", "execution"],
      style: "executive, direct, tests for judgment over jargon",
      depthExpectation: "deep",
      followUpAppetite: "medium",
    },
  },
  {
    id: "vp_engineering",
    label: "VP of Engineering",
    blurb: "A senior bar-raiser round on technical leadership and scale.",
    families: ["engineering"],
    suggestedForRounds: ["vp round", "executive round"],
    brief: {
      objectives: [
        "confirm the candidate can operate and lead at the scope this role requires",
        "assess track record on hard technical and organizational trade-offs",
        "understand how the candidate builds and scales engineering practice",
      ],
      competencyBias: ["leadership", "scalability", "technical_trade_offs", "ownership"],
      style: "executive, economical, wants conclusions first then reasoning",
      depthExpectation: "deep",
      followUpAppetite: "medium",
    },
  },
  {
    id: "founder",
    label: "Founder / Co-founder",
    blurb: "Cares about ownership, speed and genuine excitement for the mission.",
    families: ALL_FAMILIES,
    suggestedForRounds: ["founder round", "final round"],
    brief: {
      objectives: [
        "assess genuine motivation for this specific company and problem",
        "test ownership mentality and comfort with ambiguity",
        "get a direct, unfiltered read on judgment under pressure",
      ],
      competencyBias: ["ownership", "execution", "behavioral", "company_specific"],
      style: "informal, moves fast, asks pointed 'why' questions",
      depthExpectation: "moderate",
      followUpAppetite: "high",
    },
  },
  {
    id: "marketing_manager",
    label: "Marketing Manager",
    blurb: "Tests campaign thinking and how you measure impact.",
    families: ["marketing"],
    suggestedForRounds: ["marketing round"],
    brief: {
      objectives: [
        "assess how the candidate plans and executes a campaign end to end",
        "test whether the candidate ties activity to measurable business outcomes",
        "gauge creativity balanced with rigor",
      ],
      competencyBias: ["campaigns", "roi_analysis", "marketing_funnels", "execution"],
      style: "practical, wants concrete examples with numbers",
      depthExpectation: "moderate",
      followUpAppetite: "medium",
    },
  },
  {
    id: "growth_lead",
    label: "Growth Lead",
    blurb: "Focused on experimentation, funnels and CAC/ROI thinking.",
    families: ["marketing"],
    suggestedForRounds: ["growth round"],
    brief: {
      objectives: [
        "assess experimentation rigor — how the candidate designs and reads a test",
        "test funnel and unit-economics thinking",
        "understand how the candidate prioritizes growth levers",
      ],
      competencyBias: ["experimentation", "ab_testing", "cac_analysis", "marketing_funnels"],
      style: "analytical, pushes on 'how did you know it worked'",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "marketing_director",
    label: "Marketing Director",
    blurb: "Zooms out to strategy, positioning and team leadership.",
    families: ["marketing"],
    suggestedForRounds: ["director round", "final round"],
    brief: {
      objectives: [
        "assess strategic marketing judgment beyond a single campaign",
        "understand how the candidate leads and prioritizes across channels",
        "gauge business acumen tying marketing to revenue outcomes",
      ],
      competencyBias: ["campaigns", "roi_analysis", "leadership", "stakeholder_management"],
      style: "big-picture, tests for business judgment over tactics",
      depthExpectation: "deep",
      followUpAppetite: "medium",
    },
  },
  {
    id: "sales_director",
    label: "Sales Director",
    blurb: "Evaluates pipeline discipline, negotiation and revenue ownership.",
    families: ["sales"],
    suggestedForRounds: ["sales round", "final round"],
    brief: {
      objectives: [
        "assess how the candidate manages a pipeline and forecasts accurately",
        "test negotiation and objection-handling skill with real scenarios",
        "gauge ownership of revenue outcomes, not just activity",
      ],
      competencyBias: [
        "pipeline_management",
        "negotiation",
        "objection_handling",
        "revenue_ownership",
      ],
      style: "direct, numbers-first, tests composure under pushback",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "data_science_manager",
    label: "Data Science Manager",
    blurb: "Tests analytical rigor and how you translate data into decisions.",
    families: ["data"],
    suggestedForRounds: ["data round", "manager round"],
    brief: {
      objectives: [
        "assess analytical rigor and statistical judgment",
        "understand how the candidate translates analysis into a business decision",
        "gauge communication of technical findings to non-technical stakeholders",
      ],
      competencyBias: ["analytics", "data_interpretation", "sql", "experimentation"],
      style: "precise, asks 'how would you know if you were wrong'",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "operations_manager",
    label: "Operations Manager",
    blurb: "Focused on process, execution and cross-functional coordination.",
    families: ["operations"],
    suggestedForRounds: ["operations round"],
    brief: {
      objectives: [
        "assess process thinking and attention to operational detail",
        "test how the candidate handles competing priorities under real constraints",
        "gauge cross-functional coordination skill",
      ],
      competencyBias: ["execution", "prioritization", "stakeholder_management", "ownership"],
      style: "methodical, wants concrete process detail",
      depthExpectation: "moderate",
      followUpAppetite: "medium",
    },
  },
  {
    id: "consulting_case_lead",
    label: "Case Interview Lead",
    blurb: "Runs a structured business case, testing analytical structure.",
    families: ["consulting", "finance"],
    suggestedForRounds: ["case round"],
    brief: {
      objectives: [
        "assess structured problem decomposition under ambiguity",
        "test quantitative reasoning and comfort with estimation",
        "gauge how the candidate communicates a recommendation clearly",
      ],
      competencyBias: ["case_discussion", "estimation", "analytics", "trade_offs"],
      style: "structured, Socratic, builds the case turn by turn",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
  {
    id: "finance_manager",
    label: "Finance Manager",
    blurb: "Tests modeling, valuation and accounting fundamentals.",
    families: ["finance"],
    suggestedForRounds: ["finance round", "technical round"],
    brief: {
      objectives: [
        "confirm technical fluency in accounting and financial modeling",
        "assess how the candidate builds and defends a valuation",
        "test comfort working through numbers live",
      ],
      competencyBias: ["financial_modeling", "valuation", "accounting", "excel_modeling"],
      style: "precise, technical, wants the candidate to show their work",
      depthExpectation: "deep",
      followUpAppetite: "high",
    },
  },
];

const ROLES_BY_ID: Record<string, InterviewerRoleDef> = Object.fromEntries(
  INTERVIEWER_ROLES.map((r) => [r.id, r]),
);

export function getInterviewerRole(id: string): InterviewerRoleDef | undefined {
  return ROLES_BY_ID[id];
}

/**
 * Lightweight keyword classifier — no AI call. Falls back to "general" so
 * every role list still resolves to something rather than an empty screen.
 */
export function resolveRoleFamily(role: string, jobDescription: string): RoleFamily {
  const text = `${role} ${jobDescription}`.toLowerCase();

  const rules: [RoleFamily, RegExp][] = [
    [
      "engineering",
      /\b(software|engineer|developer|backend|frontend|full[\s-]?stack|devops|sre|infrastructure|platform engineer|mobile engineer)\b/,
    ],
    [
      "data",
      /\b(data scientist|data science|machine learning|ml engineer|data analyst|analytics engineer)\b/,
    ],
    ["design", /\b(designer|ux|ui\/ux|product design)\b/],
    ["marketing", /\b(marketing|growth|brand|content marketing|seo|demand gen)\b/],
    ["sales", /\b(sales|account executive|business development|bdr|sdr)\b/],
    ["finance", /\b(finance|accountant|accounting|fp&a|financial analyst|controller)\b/],
    ["operations", /\b(operations|supply chain|logistics|program manager)\b/],
    ["consulting", /\b(consultant|consulting|case interview)\b/],
    ["product", /\b(product manager|product owner|pm\b)\b/],
  ];

  for (const [family, pattern] of rules) {
    if (pattern.test(text)) return family;
  }
  return "general";
}

/** Ordered role list for a family + round, suggestion first. */
export function interviewerRolesFor(family: RoleFamily, round: string): InterviewerRoleDef[] {
  const roundLower = round.toLowerCase();
  const inFamily = INTERVIEWER_ROLES.filter((r) => r.families.includes(family));
  const pool =
    inFamily.length > 0
      ? inFamily
      : INTERVIEWER_ROLES.filter((r) => r.families.includes("general"));

  const suggested = pool.find((r) => r.suggestedForRounds.some((s) => roundLower.includes(s)));
  if (!suggested) return pool;
  return [suggested, ...pool.filter((r) => r.id !== suggested.id)];
}

/** The pre-selected role for a family + round — always defined, never invented beyond this catalogue. */
export function suggestedRoleFor(family: RoleFamily, round: string): InterviewerRoleDef {
  const [first] = interviewerRolesFor(family, round);
  return first ?? INTERVIEWER_ROLES[0];
}
