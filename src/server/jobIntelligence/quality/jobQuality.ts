// ── Job quality classification ──
//
// Deterministic, explainable, title-first scoring — never an external AI
// call. This is a FILTER FOR BAD JOBS, not an allowlist of good ones: keep
// legitimate roles broadly, remove only those with clear evidence they are
// outside the target set.
//
// Scoring model: every taxonomy phrase (see roleTaxonomy.ts) that appears in
// the title contributes its signed weight. Positive families (engineering,
// product, data, finance, analyst/business roles, ...) raise the score;
// explicit LOW_SIGNAL phrases (Data Entry, Telecaller, Translator, Teacher,
// generic Writer, ...) lower it. A role is rejected only when the total
// reaches REJECT evidence (score <= -2), so:
//
//   - a title with NO signal either way (score 0) is KEPT — an ambiguous but
//     otherwise legitimate professional title ("Product Intern", "Management
//     Trainee") is not evidence of a bad job;
//   - one explicit low-signal phrase is enough to reject on its own (-3);
//   - a technical/analytical word alongside a low-signal phrase ("Customer
//     Support Engineer") outweighs it, so real technical roles are not lost
//     to incidental word overlap.
//
// One policy for every source (crawler platforms and the extension alike).
// Per-platform thresholds used to exist and made the same title survive on
// one board and vanish on another purely because of where it was posted.
//
// Seniority words ("Senior", "Manager", ...) contribute at most ONE point
// total — never enough to rescue a title that also matches an explicit
// LOW_SIGNAL phrase (a "Senior Relationship Manager" is still rejected).
//
// Description-based signals are used ONLY to disambiguate a title that
// scored exactly 0 — they can lift a neutral title, never lower any title
// and never add to one that already has a signal. They are never required.

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
 * Score must be STRICTLY GREATER than this to retain, i.e. a role is rejected
 * only at score <= -2: clear evidence, not merely a lack of positive signal.
 * Applies to every source (see the header) — it is the most permissive tier
 * the per-platform table used to have, now shared by all.
 */
export const DEFAULT_QUALITY_THRESHOLD = -2;

/** The retain threshold for `source`. Source-independent by design; kept so callers can still ask. */
export function qualityThresholdFor(_source?: string): number {
  return DEFAULT_QUALITY_THRESHOLD;
}

/** However many seniority words match, they contribute at most this many points combined. */
const SENIORITY_BONUS_CAP = 1;
/** However many description-only signals match, they contribute at most this many points combined — and only when the title itself scored exactly 0. */
const DESCRIPTION_SIGNAL_CAP = 2;
/** A description signal is worth half its title weight, rounded down, minimum 1. */
const DESCRIPTION_WEIGHT_DIVISOR = 2;
const BORDERLINE_MARGIN = 1;
/** Bound how much free-text we scan — a multi-page JD must not slow this down or change the outcome based on incidental late-document mentions. */
const DESCRIPTION_SCAN_CHARS = 2000;

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
  const threshold = qualityThresholdFor(job.source);

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
      ? `No quality signal either way (score ${score}); retained — nothing marks it as outside the target set.`
      : `${retain ? "Retained" : "Rejected"} on score ${score} vs. threshold ${threshold} for "${job.source}" — ${signals.join(", ")}.`;

  return { retain, score, threshold, primaryFamily, signals, borderline, reason };
}
