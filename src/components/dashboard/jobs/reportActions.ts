import type { ActionItem } from "@/components/dashboard/reports/ActionPlanList";
import type { ImprovementAction } from "@/features/ai/schemas";
import type { AtsScoreSummary, ResumeMatchSummary } from "@/features/ai/types";

// ── Report action-plan mappers (Module 6E, presentation-only) ──
//
// Turns already-computed analysis output into the generic ActionItem shape the
// ActionPlanList renders. Invents nothing — the primary path just relabels the
// model's `improvementPlan`; the fallback paths reorganize the pre-6E fields so
// older cached analyses still render an action plan instead of a blank section.

const TYPE_TAGS: Record<ImprovementAction["type"], string> = {
  match: "Strength",
  missing: "Missing",
  improve: "Improve",
  add: "Add",
  remove: "Remove",
  rewrite: "Rewrite",
  move: "Move",
  keyword: "Keyword",
  formatting: "Formatting",
  positioning: "Positioning",
  other: "Action",
};

export function improvementPlanToItems(plan: ImprovementAction[]): ActionItem[] {
  return plan.map((a, i) => ({
    id: `plan-${i}`,
    title: a.action,
    tag: TYPE_TAGS[a.type],
    priority: a.priority,
    why: a.why || undefined,
    how: a.how || undefined,
    example: a.example ?? undefined,
    benefit: a.benefit || undefined,
  }));
}

/** Pre-priority Resume Match analyses: derive a tiered plan from missing skills + weak dimensions + whatToImprove. */
export function matchFallbackItems(analysis: ResumeMatchSummary): ActionItem[] {
  const items: ActionItem[] = [];

  analysis.missingSkills.forEach((s, i) => {
    items.push({
      id: `skill-${i}`,
      title: `Address a ${s.importance} skill: ${s.skill}`,
      tag: "Missing",
      priority: s.importance === "required" ? "critical" : "high",
      why: s.evidence ?? "Not clearly present in your resume.",
      how: "Add this only if it reflects real experience you have — never fabricate a skill.",
    });
  });

  const dims = [
    { label: "Experience", ...analysis.dimensions.experience },
    { label: "Education", ...analysis.dimensions.education },
    { label: "Domain fit", ...analysis.dimensions.domain },
  ];
  dims
    .filter((d) => d.score < 60)
    .forEach((d, i) => {
      items.push({
        id: `dim-${i}`,
        title: `Strengthen your ${d.label.toLowerCase()} story`,
        tag: "Improve",
        priority: "high",
        why: d.detail || undefined,
      });
    });

  analysis.whatToImprove.forEach((t, i) => {
    items.push({ id: `improve-${i}`, title: t, tag: "Improve", priority: "quick_win" });
  });

  return items;
}

/** Pre-priority ATS analyses: derive a tiered plan from critical/missing keywords + risks + weak components. */
export function atsFallbackItems(analysis: AtsScoreSummary): ActionItem[] {
  const items: ActionItem[] = [];

  analysis.criticalMissingKeywords.forEach((kw, i) => {
    items.push({
      id: `crit-${i}`,
      title: `Add the required keyword "${kw}"`,
      tag: "Keyword",
      priority: "critical",
      why: "A required qualification for this job that an ATS scans for.",
      how: "Add it only where your real experience supports it — never keyword-stuff.",
    });
  });

  analysis.breakdown
    .filter((c) => c.score < 60)
    .forEach((c) => {
      items.push({
        id: `comp-${c.key}`,
        title: `Improve ${c.label.toLowerCase()} (${c.score}/100)`,
        tag: "Improve",
        priority: "high",
        why: c.detail || undefined,
      });
    });

  analysis.atsRisks.forEach((risk, i) => {
    items.push({ id: `risk-${i}`, title: risk, tag: "Improve", priority: "high" });
  });

  analysis.recommendations.forEach((r, i) => {
    items.push({ id: `rec-${i}`, title: r, tag: "Action", priority: "quick_win" });
  });

  return items;
}
