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

/** Maximum suggestions we surface for one optimization run. */
export const OPTIMIZER_MAX_SUGGESTIONS = 24;

// ── Career categories ──
// `id` is stable (used in the prompt + cache key); `context` is the extra
// framing handed to the model so a "Growth Product" optimization reads
// differently from a "Data Science" one, without a per-category prompt.
export type CareerCategoryId =
  | "general"
  | "product_management"
  | "growth_product"
  | "software_engineering"
  | "data_science"
  | "business_analytics"
  | "marketing"
  | "consulting";

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
    id: "consulting",
    label: "Consulting",
    description: "Structured problem-solving, client impact.",
    context:
      "Optimize for consulting roles. Emphasize structured problem-solving, analysis, stakeholder and " +
      "client impact, and clearly communicated outcomes.",
  },
] as const;

export function getCareerCategory(id: string): CareerCategory {
  return CAREER_CATEGORIES.find((c) => c.id === id) ?? CAREER_CATEGORIES[0];
}

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
