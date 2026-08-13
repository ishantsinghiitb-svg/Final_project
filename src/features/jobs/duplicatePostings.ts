// ── Module 11C-2: presentation-only exact-duplicate-posting grouping ──
//
// The 11C-2 investigation found 28 groups (59 postings) that are visible exact
// duplicates: same company, same role, same location, AND the same dedup
// `fingerprint` — differing only by `source_job_id` because the SOURCE itself
// published the same requisition under two IDs (confirmed against production;
// see e.g. HighRadius "Senior Product Manager, Hyderabad" appearing twice from
// Greenhouse). This is a presentation concern, not a `global_jobs` identity or
// `DeduplicationEngine` question — both rows are legitimate, independently
// captured postings and neither is touched, merged, or deleted here.
//
// Grouping key: `company_id` (must be a real company) + case/whitespace-
// insensitive `role` + case/whitespace-insensitive `location` + a shared,
// non-empty `fingerprint`. All four must agree. This is deliberately NARROWER
// than "same title/company/location" — the fingerprint requirement is what
// separates a genuine duplicate posting from two DIFFERENT requisitions that
// happen to share a title and city (the "ambiguous" class the investigation
// found and explicitly did NOT recommend collapsing). A posting missing any of
// the four fields is never grouped — it always renders as its own singleton.

import type { GlobalJob } from "@/types";

export type DuplicatePostingGroup = {
  /** The posting to actually render — earliest-created, deterministic. */
  primary: GlobalJob;
  /** Other postings in this exact-duplicate group. Empty for an ungrouped job. */
  duplicates: GlobalJob[];
};

type GroupableJob = Pick<GlobalJob, "company_id" | "role" | "location" | "fingerprint">;

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The grouping key for a job, or `null` when it lacks one of the required
 * fields and must never be grouped with anything.
 */
export function duplicateGroupKey(job: GroupableJob): string | null {
  if (!job.company_id) return null;
  if (!job.fingerprint) return null;
  const role = norm(job.role);
  if (!role) return null;
  return `${job.company_id}|${role}|${norm(job.location)}|${job.fingerprint}`;
}

/** True when two jobs belong to the same exact-duplicate group. */
export function isSameDuplicateGroup(a: GroupableJob, b: GroupableJob): boolean {
  const keyA = duplicateGroupKey(a);
  if (keyA === null) return false;
  return keyA === duplicateGroupKey(b);
}

function isEarlier(a: GlobalJob, b: GlobalJob): boolean {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at;
  // Deterministic tie-break so grouping never depends on array/fetch order.
  return a.id < b.id;
}

/**
 * Groups exact-duplicate postings for display, preserving the ORIGINAL
 * position of each group's first-encountered member — a caller mapping this
 * output to cards gets the same list order it would have gotten mapping
 * `jobs` directly, just with duplicates folded into their group.
 *
 * Pure and synchronous — no I/O, no mutation of the input array/objects. Every
 * job appears in exactly one group's `primary` or `duplicates`; nothing is
 * dropped, and no `global_jobs` row, `source_job_id`, `url`, or `source_url`
 * is altered — this only decides how already-fetched rows are laid out.
 */
export function groupExactDuplicatePostings(jobs: readonly GlobalJob[]): DuplicatePostingGroup[] {
  const groups = new Map<string, DuplicatePostingGroup>();
  const order: string[] = [];
  let soloCounter = 0;

  for (const job of jobs) {
    const key = duplicateGroupKey(job) ?? `__solo_${soloCounter++}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { primary: job, duplicates: [] });
      order.push(key);
      continue;
    }

    if (isEarlier(job, existing.primary)) {
      existing.duplicates.unshift(existing.primary);
      existing.primary = job;
    } else {
      existing.duplicates.push(job);
    }
  }

  return order.map((key) => groups.get(key)!);
}
