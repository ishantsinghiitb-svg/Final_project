// ── Module 10B.1.5: turning a curated company list into registry rows ──
//
// The seed migration is generated from a curated list that contains aliases,
// parent/subsidiary pairs and duplicates. This module is the single place that
// decides what becomes a row, so the same rules apply whether rows are being
// generated for a migration or added later by an operator paste.
//
// The one rule that matters: NEVER emit two rows for the same hiring entity on
// the same platform. That is exactly the unique index
// `crawl_company_registry_company_platform_unique` enforces, and hitting it at
// migration time is a failed deploy — so it is caught here first.

import { resolveCompanyIdentity, identityKey } from "./companyIdentity";

export type RegistryCandidate = {
  /** Name as it appears in the curated list (may be an "A / B" alias form). */
  name: string;
  careersUrl: string;
  platform: string;
  notes?: string | null;
  config?: Record<string, unknown>;
};

export type RegistryRow = {
  companyName: string;
  careersUrl: string;
  platform: string;
  parentCompany: string | null;
  aliases: string[];
  notes: string | null;
  config: Record<string, unknown>;
};

export type LoadResult = {
  rows: RegistryRow[];
  /** Candidates dropped because an equivalent row already existed. */
  duplicates: Array<{ name: string; mergedInto: string; platform: string }>;
};

/**
 * Normalizes a curated list into registry rows, collapsing aliases and
 * rejecting same-entity duplicates.
 *
 * Two entries collapse ONLY when they resolve to the same canonical company
 * AND target the same platform. A company legitimately appears twice across
 * different platforms (its own careers board and a job-board feed), and a
 * subsidiary is never merged into its parent.
 */
export function loadRegistryCandidates(candidates: RegistryCandidate[]): LoadResult {
  const rows: RegistryRow[] = [];
  const duplicates: LoadResult["duplicates"] = [];
  const seen = new Map<string, RegistryRow>();

  for (const candidate of candidates) {
    const identity = resolveCompanyIdentity(candidate.name);
    const key = `${identityKey(identity.canonicalName)}::${candidate.platform}`;

    const existing = seen.get(key);
    if (existing) {
      duplicates.push({
        name: candidate.name,
        mergedInto: existing.companyName,
        platform: candidate.platform,
      });
      // Fold the duplicate's other names in so the surviving row stays findable
      // under every name the list used.
      existing.aliases = [
        ...new Set([...existing.aliases, ...identity.aliases, candidate.name]),
      ].filter((alias) => identityKey(alias) !== identityKey(existing.companyName));
      continue;
    }

    const row: RegistryRow = {
      companyName: identity.canonicalName,
      careersUrl: candidate.careersUrl,
      platform: candidate.platform,
      parentCompany: identity.parentCompany,
      aliases: identity.aliases,
      notes: candidate.notes ?? null,
      config: candidate.config ?? {},
    };
    seen.set(key, row);
    rows.push(row);
  }

  return { rows, duplicates };
}
