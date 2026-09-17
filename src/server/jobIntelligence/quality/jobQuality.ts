// ── Job quality classification ──
//
// Deterministic, explainable, title-first scoring — never an external AI
// call. Goal per the product brief: a materially higher-signal India job
// database with enough breadth to stay useful, NOT a reduction to only
// PM/SWE roles and NOT a crude keyword blacklist.
//
// Scoring model: every taxonomy phrase (see roleTaxonomy.ts) that appears in
// the title contributes its signed weight; the total is compared against a
// PLATFORM-specific threshold (career-pages ATS boards get a broader
// threshold than Internshala, which needs the strongest filtering — see the
// product brief). A title with no signal at all scores 0 ("neutral") and is
// retained everywhere except the strictest platform threshold, which is
// deliberate: absence of a red flag is enough on a curated startup/tech
// board, but not enough on a board that is mostly low-signal listings.
//
// Seniority words ("Senior", "Manager", ...) contribute at most ONE point
// total, however many of them appear — strong enough to tip a genuinely
// ambiguous title (see PROFESSIONAL_DOMAIN in roleTaxonomy.ts), never strong
// enough to rescue a title that also matches an explicit LOW_SIGNAL phrase
// (a "Senior Relationship Manager" must still be rejected).
//
// Description-based signals are used ONLY to disambiguate a title that
// scored exactly 0 (no signal either way) — never to add extra weight on
// top of a title that already has a clear signal, and never to subtract
// (a real technical job's description mentioning "handles customer support
// tickets" as one responsibility among many must never cost it points).

import {
  matchTaxonomy,
  DESCRIPTION_SAFE_ENTRIES,
  type RoleFamily,
  type TaxonomyMatch,
} from "./roleTaxonomy";

export type QualityInput = {
  role: string;
  description?: string | null;
  skills?: string[] | null;
  technologies?: string[] | null;
  department?: string | null;
  jobFunction?: string | null;
  /** `global_jobs.source` tag — "greenhouse", "lever", "internshala", etc. */
  source: string;
};

export type QualityDecision = {
  retain: boolean;
  score: number;
  threshold: number;
  /** The highest-weight family that actually matched, for role-family reporting. `null` when nothing matched (a pure-neutral title). */
  primaryFamily: RoleFamily | null;
  /** Every matched signal, most-influential first — for explainable rejection/retention reasons. */
  signals: string[];
  /** Score sits within one point of the threshold on either side — surfaced for human review, never used by `retain` itself. */
  borderline: boolean;
  reason: string;
};

/**
 * Retain threshold per source platform — score must be STRICTLY GREATER than
 * this to retain. Lower (more negative) = more permissive.
 *
 *   - Greenhouse/Lever/Ashby: broader threshold. These boards are
 *     predominantly startup/tech company postings, so the prior is "probably
 *     substantive" — only reject a clear, multi-signal low-quality title.
 *   - SmartRecruiters/Workable: balanced threshold. These boards mix strong
 *     professional roles with generic ones in both directions.
 *   - Internshala: the strictest threshold. It is the single largest source
 *     of low-signal listings per the product brief, so a neutral (no
 *     signal either way) title is NOT enough — it needs at least one
 *     positive signal to be retained.
 */
export const PLATFORM_QUALITY_THRESHOLDS: Record<string, number> = {
  greenhouse: -2,
  lever: -2,
  ashby: -2,
  smartrecruiters: 0,
  workable: 0,
  internshala: 1,
  // A generic JSON-LD careers board (no ATS-specific signal resolved) — the
  // company mix here is unverified, so it gets the balanced threshold, not
  // the permissive one reserved for the three named ATS boards.
  careers: 0,
  recruitee: 0,
};

/** Any source not explicitly configured above — balanced, never the permissive tier, per "prioritize substantive roles" over raw volume. */
export const DEFAULT_QUALITY_THRESHOLD = 0;

/** However many seniority words match, they contribute at most this many points combined. */
const SENIORITY_BONUS_CAP = 1;
/** However many description-only signals match, they contribute at most this many points combined — and only when the title itself scored exactly 0. */
const DESCRIPTION_SIGNAL_CAP = 2;
/** A description signal is worth half its title weight, rounded down, minimum 1. */
const DESCRIPTION_WEIGHT_DIVISOR = 2;
const BORDERLINE_MARGIN = 1;
/** Bound how much free-text we scan — a multi-page JD must not slow this down or change the outcome based on incidental late-document mentions. */
const DESCRIPTION_SCAN_CHARS = 2000;

export function qualityThresholdFor(source: string): number {
  return PLATFORM_QUALITY_THRESHOLDS[(source ?? "").toLowerCase()] ?? DEFAULT_QUALITY_THRESHOLD;
}

function familyPriority(family: RoleFamily): number {
  // Used only to pick ONE "primary" family for reporting when several
  // matched — core product families outrank the generic tiers, which
  // outrank seniority (a modifier, never a category of its own).
  switch (family) {
    case "software_engineering":
    case "product":
    case "ai_data":
    case "quant_finance":
      return 4;
    case "low_signal":
      return 3;
    case "technical_suffix":
      return 2;
    case "professional_domain":
      return 1;
    case "seniority":
      return 0;
  }
}

function describeSignal(m: TaxonomyMatch, where: "title" | "description"): string {
  const sign = m.weight > 0 ? "+" : "";
  const suffix = where === "description" ? " (description)" : "";
  return `${m.label}${suffix} [${m.family} ${sign}${m.weight}]`;
}

export function classifyJobQuality(job: QualityInput): QualityDecision {
  const title = job.role ?? "";
  const threshold = qualityThresholdFor(job.source ?? "");

  const titleMatches = matchTaxonomy(title);
  const seniorityMatches = titleMatches.filter((m) => m.family === "seniority");
  const nonSeniorityMatches = titleMatches.filter((m) => m.family !== "seniority");

  let score = 0;
  const applied: Array<{ match: TaxonomyMatch; where: "title" | "description" }> = [];

  for (const m of nonSeniorityMatches) {
    score += m.weight;
    applied.push({ match: m, where: "title" });
  }

  if (seniorityMatches.length > 0) {
    // Capped once, regardless of how many seniority words matched — see the
    // module doc comment for why ("Senior Lead Principal Manager" must not
    // stack four bonuses).
    const bonus = Math.min(SENIORITY_BONUS_CAP, Math.max(...seniorityMatches.map((m) => m.weight)));
    score += bonus;
    applied.push({ match: { ...seniorityMatches[0], weight: bonus }, where: "title" });
  }

  // Description is consulted ONLY to disambiguate a title that gave no
  // signal at all — never to add on top of an already-decided title, and
  // never to subtract.
  if (nonSeniorityMatches.length === 0) {
    const descriptionText = [
      job.description ?? "",
      job.department ?? "",
      job.jobFunction ?? "",
      ...(job.skills ?? []),
      ...(job.technologies ?? []),
    ]
      .join(" ")
      .slice(0, DESCRIPTION_SCAN_CHARS);

    const descriptionMatches = matchTaxonomy(descriptionText, DESCRIPTION_SAFE_ENTRIES);

    let descriptionBonus = 0;
    for (const m of descriptionMatches) {
      if (descriptionBonus >= DESCRIPTION_SIGNAL_CAP) break;
      const weight = Math.max(1, Math.floor(m.weight / DESCRIPTION_WEIGHT_DIVISOR));
      const capped = Math.min(weight, DESCRIPTION_SIGNAL_CAP - descriptionBonus);
      descriptionBonus += capped;
      score += capped;
      applied.push({ match: { ...m, weight: capped }, where: "description" });
    }
  }

  applied.sort((a, b) => Math.abs(b.match.weight) - Math.abs(a.match.weight));
  const signals = applied.map(({ match, where }) => describeSignal(match, where));

  const primaryFamily =
    applied.length === 0
      ? null
      : applied.reduce((best, cur) =>
          familyPriority(cur.match.family) > familyPriority(best.match.family) ? cur : best,
        ).match.family;

  const retain = score > threshold;
  const borderline = Math.abs(score - threshold) <= BORDERLINE_MARGIN;

  const reason =
    applied.length === 0
      ? `No quality signal either way (score ${score} vs. threshold ${threshold} for "${job.source}").`
      : `${retain ? "Retained" : "Rejected"} on score ${score} vs. threshold ${threshold} for "${job.source}" — ${signals.join(", ")}.`;

  return { retain, score, threshold, primaryFamily, signals, borderline, reason };
}
