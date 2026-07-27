// ── Resume Optimizer constants (Module 6D) ──
//
// The domain vocabulary for the Resume Optimization Studio: the career
// CATEGORIES the AI optimizes toward (never a specific job — that is a future
// premium path) and the resume SECTIONS a user can choose to optimize.
//
// These are the single source of truth shared by the setup UI, the prompt
// builder, and the input hash (so a different category/section selection is a
// distinct cache entry). Adding a category/section is a data change only.

export const OPTIMIZER_CREDIT_COST = 1;

/**
 * The TYPICAL upper end of a full resume audit — NOT a hard cap. A complete
 * review of a normal professional resume commonly surfaces 20–40 independent
 * opportunities; some legitimately produce more. This number is handed to the
 * model only as a "typical range" signal so it audits exhaustively instead of
 * stopping at a handful — it must never omit a genuine improvement to stay under
 * it, nor manufacture filler to reach it. The hard ceiling that actually bounds
 * the output lives in the schema (OptimizerResultSchema `suggestions.max`).
 */
export const OPTIMIZER_TYPICAL_SUGGESTIONS = 40;

// ── Career categories ──
// `id` is stable (used in the prompt + cache key); `context` is the extra
// framing handed to the model so a "Growth Product" optimization reads
// differently from a "Data Science" one, without a per-category prompt.
//
// "other" is the escape hatch: the user types a free-text career target (e.g.
// "Developer Relations", "Climate Tech") which becomes the category's dynamic
// label/context at build time (see resolveCareerCategory) — never a hardcoded
// allowlist, so the AI can reason about any target the user names.
export type CareerCategoryId =
  | "general"
  | "product_management"
  | "growth_product"
  | "technical_product_management"
  | "ai_product_management"
  | "software_engineering"
  | "data_science"
  | "business_analytics"
  | "marketing"
  | "sales"
  | "consulting"
  | "operations"
  | "finance"
  | "customer_success"
  | "human_resources"
  | "product_design_ux"
  | "research"
  | "founders_office"
  | "other";

export type CareerCategory = {
  id: CareerCategoryId;
  label: string;
  /** One-line description shown in the picker. */
  description: string;
  /** Extra framing injected into the prompt for this category. */
  context: string;
};

export const CAREER_CATEGORIES: readonly CareerCategory[] = [
  {
    id: "general",
    label: "General",
    description: "Broadly stronger, role-agnostic resume.",
    context:
      "Optimize for a broadly strong, professional resume that reads well across roles. " +
      "Prioritize clarity, strong action verbs, and quantified impact without tailoring to any one function.",
  },
  {
    id: "product_management",
    label: "Product Management",
    description: "Ownership, roadmap, cross-functional impact.",
    context:
      "Optimize for product management roles. Surface product ownership, roadmap and prioritization, " +
      "cross-functional collaboration, user and business impact, and outcomes over responsibilities.",
  },
  {
    id: "growth_product",
    label: "Growth Product",
    description: "Experimentation, funnels, activation, metrics.",
    context:
      "Optimize for growth product roles. Emphasize experimentation, A/B testing, funnel and retention " +
      "metrics, activation, and data-informed decisions — always grounded in the candidate's real experience.",
  },
  {
    id: "technical_product_management",
    label: "Technical Product Management",
    description: "Deep technical scope, systems tradeoffs.",
    context:
      "Optimize for technical product management roles. Emphasize technical fluency, architecture and " +
      "system tradeoffs the candidate weighed, engineering collaboration, and shipped outcomes, grounded " +
      "in their real experience.",
  },
  {
    id: "ai_product_management",
    label: "AI Product Management",
    description: "ML/AI product judgment, responsible shipping.",
    context:
      "Optimize for AI product management roles. Emphasize ML/AI product judgment, model evaluation and " +
      "tradeoffs, responsible and safe shipping, and cross-functional work with ML/data teams — only using " +
      "the candidate's real experience, never inventing model or AI work they did not do.",
  },
  {
    id: "software_engineering",
    label: "Software Engineering",
    description: "Systems, scale, technical depth, delivery.",
    context:
      "Optimize for software engineering roles. Emphasize technical depth, systems and architecture, " +
      "scope and scale, and shipped outcomes. Keep the candidate's real technologies — never add new ones.",
  },
  {
    id: "data_science",
    label: "Data Science",
    description: "Modeling, analysis, measurable outcomes.",
    context:
      "Optimize for data science roles. Emphasize analysis, modeling, experimentation, and measurable " +
      "outcomes. Keep the candidate's real tools and methods — never invent models, datasets, or metrics.",
  },
  {
    id: "business_analytics",
    label: "Business Analytics",
    description: "Insights, reporting, decision support.",
    context:
      "Optimize for business analytics roles. Emphasize turning data into insight, reporting, stakeholder " +
      "decision support, and business outcomes, grounded in the candidate's real work.",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Campaigns, audience growth, results.",
    context:
      "Optimize for marketing roles. Emphasize campaigns, audience and channel growth, positioning, and " +
      "measurable results, grounded in the candidate's real experience.",
  },
  {
    id: "sales",
    label: "Sales",
    description: "Pipeline, quota, negotiation, revenue impact.",
    context:
      "Optimize for sales roles. Emphasize pipeline generation, quota attainment, negotiation, and revenue " +
      "impact, grounded in the candidate's real numbers and deals — never invent figures they did not report.",
  },
  {
    id: "consulting",
    label: "Consulting",
    description: "Structured problem-solving, client impact.",
    context:
      "Optimize for consulting roles. Emphasize structured problem-solving, analysis, stakeholder and " +
      "client impact, and clearly communicated outcomes.",
  },
  {
    id: "operations",
    label: "Operations",
    description: "Process, efficiency, execution at scale.",
    context:
      "Optimize for operations roles. Emphasize process design, efficiency gains, cross-functional execution, " +
      "and scaling systems or teams, grounded in the candidate's real work.",
  },
  {
    id: "finance",
    label: "Finance",
    description: "Analysis, modeling, financial rigor.",
    context:
      "Optimize for finance roles. Emphasize financial analysis, modeling, forecasting, and rigor, grounded " +
      "in the candidate's real experience — never invent figures or transactions.",
  },
  {
    id: "customer_success",
    label: "Customer Success",
    description: "Retention, adoption, relationship impact.",
    context:
      "Optimize for customer success roles. Emphasize retention, onboarding and adoption, relationship " +
      "management, and measurable account outcomes already present in the candidate's experience.",
  },
  {
    id: "human_resources",
    label: "Human Resources",
    description: "People programs, hiring, culture impact.",
    context:
      "Optimize for human resources roles. Emphasize people programs, hiring and talent processes, culture " +
      "and engagement work, grounded in the candidate's real experience.",
  },
  {
    id: "product_design_ux",
    label: "Product Design / UX",
    description: "Design process, user research, craft.",
    context:
      "Optimize for product design / UX roles. Emphasize design process, user research, craft and outcomes, " +
      "and collaboration with product/engineering, grounded in the candidate's real work.",
  },
  {
    id: "research",
    label: "Research",
    description: "Rigor, methodology, findings with impact.",
    context:
      "Optimize for research roles. Emphasize methodology, rigor, and findings that had real impact, grounded " +
      "in the candidate's actual research work — never invent studies, data, or publications.",
  },
  {
    id: "founders_office",
    label: "Founder's Office",
    description: "Ambiguity, ownership, cross-functional scope.",
    context:
      "Optimize for Founder's Office / Chief of Staff roles. Emphasize ownership under ambiguity, broad " +
      "cross-functional scope, and direct business impact, grounded in the candidate's real experience.",
  },
  {
    id: "other",
    label: "Other (Custom)",
    description: "Describe your own career target.",
    context: "Optimize broadly for a strong, professional resume.",
  },
] as const;

export function getCareerCategory(id: string): CareerCategory {
  return CAREER_CATEGORIES.find((c) => c.id === id) ?? CAREER_CATEGORIES[0];
}

// ── Role-specific optimization frameworks (Module 6E AI-quality pass) ──
//
// The concrete dimensions the optimizer should evaluate and strengthen FOR EACH
// career target — the difference between "swap in PM vocabulary" and genuinely
// optimizing the resume's positioning for the role. Injected into the prompt so
// every category gets its own reviewer lens. Empty for "general"/"other" (the
// prompt handles those with broad/dynamic framing instead).
export const CATEGORY_FRAMEWORKS: Record<CareerCategoryId, readonly string[]> = {
  general: [],
  product_management: [
    "Product thinking and the problem→solution→outcome story behind each project",
    "Feature prioritization and the tradeoffs/decisions the candidate owned",
    "Roadmap ownership and driving work end-to-end",
    "User/customer research and customer obsession",
    "Product and business metrics (adoption, retention, revenue, engagement)",
    "Experimentation and data-informed decisions",
    "Cross-functional collaboration with engineering, design, data, GTM",
    "Product launches and post-launch impact",
    "Stakeholder management and communicating decisions",
    "AI/technical fluency where the candidate genuinely has it",
  ],
  growth_product: [
    "Experimentation velocity and A/B testing",
    "Funnel, activation, conversion and retention metrics",
    "Growth loops, channels and acquisition",
    "Data-informed decisions and instrumentation",
    "Cross-functional work with engineering, data and marketing",
    "Measurable business outcomes tied to growth",
  ],
  technical_product_management: [
    "Technical fluency and architecture/system tradeoffs the candidate weighed",
    "API/platform/infra product ownership",
    "Deep collaboration with engineering",
    "Prioritization under technical constraints",
    "Shipped technical outcomes and their impact",
    "Product and business metrics",
  ],
  ai_product_management: [
    "ML/AI product judgment and model evaluation tradeoffs",
    "Responsible, safe shipping of AI features",
    "Collaboration with ML/data/research teams",
    "Data strategy and evaluation/metrics for AI",
    "Prioritization of AI investments vs. impact",
    "Real, non-fabricated AI/ML experience only",
  ],
  software_engineering: [
    "Technical depth and the systems/architecture built",
    "Scope and scale (traffic, data, users, team size)",
    "Shipped features and their measurable outcomes",
    "Ownership end-to-end (design → build → ship → operate)",
    "Collaboration and code/design leadership",
    "Real technologies only — never introduce new ones",
  ],
  data_science: [
    "Analysis, modeling and experimentation rigor",
    "Measurable outcomes from the work",
    "Business framing of technical work",
    "Real tools, methods, datasets and metrics only",
    "Collaboration with product/engineering/stakeholders",
    "Communicating findings and driving decisions",
  ],
  business_analytics: [
    "Turning data into insight and decisions",
    "Reporting, dashboards and stakeholder decision support",
    "Business outcomes influenced",
    "Real tools and metrics only",
    "Clarity of communication",
  ],
  marketing: [
    "Campaigns, positioning and messaging",
    "Audience and channel growth",
    "Measurable results (reach, conversion, revenue)",
    "Cross-functional and creative collaboration",
    "Real numbers only — never invent figures",
  ],
  sales: [
    "Pipeline generation and quota attainment",
    "Negotiation and closing",
    "Revenue and deal impact",
    "Relationship and account management",
    "Real figures and deals only — never invent numbers",
  ],
  consulting: [
    "Structured problem-solving and frameworks",
    "Analysis and synthesis",
    "Client and stakeholder impact",
    "Clearly communicated outcomes and recommendations",
    "Leadership and ownership",
  ],
  operations: [
    "Process design and efficiency gains",
    "Execution and scaling systems or teams",
    "Cross-functional coordination",
    "Measurable operational outcomes",
  ],
  finance: [
    "Financial analysis, modeling and forecasting",
    "Rigor and accuracy",
    "Business impact of the analysis",
    "Real figures and transactions only — never invent numbers",
  ],
  customer_success: [
    "Retention, onboarding and adoption",
    "Relationship and account management",
    "Measurable account outcomes",
    "Cross-functional advocacy for customers",
  ],
  human_resources: [
    "People programs and talent/hiring processes",
    "Culture and engagement work",
    "Measurable people outcomes",
    "Stakeholder collaboration",
  ],
  product_design_ux: [
    "Design process and craft",
    "User research and insights",
    "Outcomes of design work",
    "Collaboration with product and engineering",
  ],
  research: [
    "Methodology and rigor",
    "Findings that had real impact",
    "Real studies, data and publications only — never invent any",
    "Communicating research to drive decisions",
  ],
  founders_office: [
    "Ownership under ambiguity",
    "Broad cross-functional scope",
    "Direct business impact",
    "Driving initiatives end-to-end",
  ],
  other: [],
};

export function getCategoryFramework(id: string): readonly string[] {
  return CATEGORY_FRAMEWORKS[id as CareerCategoryId] ?? [];
}

export function isCustomCategory(id: string): boolean {
  return id === "other";
}

/** Max length for a user-typed custom career target — keeps the prompt tight and bounded. */
export const CUSTOM_CATEGORY_MAX_LENGTH = 80;

/**
 * Normalize a free-text custom career target: strip control/newline characters,
 * collapse whitespace, and cap length. Used both client-side (input validation)
 * and server-side (defense in depth — never trust the client's cleanup alone).
 */
export function sanitizeCustomCategory(input: string): string {
  return input
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_CATEGORY_MAX_LENGTH);
}

/**
 * Resolve the effective category for prompting/display. For every built-in id
 * this is just the static registry entry. For "other" it builds a category
 * object from the user's sanitized custom text — dynamic label, dynamic
 * prompt context — so the AI can reason about ANY target without a hardcoded
 * allowlist. Falls back to General if "other" is selected with no usable text.
 */
export function resolveCareerCategory(id: string, customLabel?: string | null): CareerCategory {
  if (!isCustomCategory(id)) return getCareerCategory(id);

  const clean = sanitizeCustomCategory(customLabel ?? "");
  if (!clean) return getCareerCategory("general");

  return {
    id: "other",
    label: clean,
    description: "Custom career target.",
    context:
      `Optimize for the following custom career target: "${clean}". Infer what this specific target ` +
      "typically prioritizes (skills, impact, terminology) and optimize accordingly, using ONLY the " +
      "candidate's existing, real experience — never inventing skills or experience to better fit the target.",
  };
}

/** Example placeholders shown under the custom career-target input. */
export const CUSTOM_CATEGORY_EXAMPLES: readonly string[] = [
  "Investment Banking",
  "Climate Tech",
  "GenAI Engineer",
  "Machine Learning Engineer",
  "Developer Relations",
  "Founder Associate",
  "Startup Operations",
] as const;

// ── Optimizable sections ──
// The user picks one or more. "full" means the whole resume; when selected it
// supersedes the others (the model considers every section).
export type OptimizeSectionId =
  "full" | "summary" | "experience" | "projects" | "skills" | "education";

export type OptimizeSection = {
  id: OptimizeSectionId;
  label: string;
  description: string;
};

export const OPTIMIZE_SECTIONS: readonly OptimizeSection[] = [
  { id: "full", label: "Entire Resume", description: "Review every section together." },
  { id: "summary", label: "Summary", description: "Professional summary / objective." },
  { id: "experience", label: "Experience", description: "Work and internship bullets." },
  { id: "projects", label: "Projects", description: "Project descriptions and impact." },
  { id: "skills", label: "Skills", description: "Organization and relevance of skills." },
  { id: "education", label: "Education", description: "Education and academic detail." },
] as const;

/**
 * Expand a user selection into the concrete section ids the prompt should
 * target. "full" (or an empty selection) expands to every real section.
 */
export function resolveTargetSections(
  selected: OptimizeSectionId[],
): Exclude<OptimizeSectionId, "full">[] {
  const real = OPTIMIZE_SECTIONS.filter((s) => s.id !== "full").map(
    (s) => s.id as Exclude<OptimizeSectionId, "full">,
  );
  if (selected.length === 0 || selected.includes("full")) return real;
  return real.filter((id) => selected.includes(id));
}

export function sectionLabel(id: string): string {
  return OPTIMIZE_SECTIONS.find((s) => s.id === id)?.label ?? id;
}
