// ── Module 11C-1: promoting a stranded posting logo to its company row ──
//
// 186 companies carry a logo; all 186 were scraped off a real posting and all
// 186 still resolve (verified live during the 11C investigation). But 115
// postings carry a logo their `companies` row never received: the Module 11A
// backfill pushes a scraped logo UP to the company only when it CREATES that
// company (see scripts/backfillCompanyIdentity.ts) — when it attaches a
// posting to an already-existing logo-less row, the logo stays stranded on the
// posting. Because every UI surface reads `global_jobs.company_logo_url`, the
// consequence is visible: the company's other postings show initials while one
// shows a mark, and `companies.logo_url` — the value 11A's propagation trigger
// fans out — stays NULL.
//
// This module decides WHICH logo a company should adopt. It is deliberately
// consensus-based rather than first-wins: a company's postings can disagree
// (most often because two employers were sharing one row before being split),
// and the majority mark is the safer choice. Ties break on the earliest-created
// posting so the decision is deterministic and a dry run predicts the apply run
// exactly.
//
// Safety: this module never returns a logo for a company that already has one —
// the caller must not call it in that case, and `pickPromotableLogo` refuses
// anyway. Nothing here can overwrite an established logo, and no logo is ever
// invented: every candidate is a URL already stored on the company's own
// posting.

/** A posting's contribution to its company's logo decision. */
export type LogoCandidatePosting = {
  companyLogoUrl: string | null | undefined;
  /** Which platform captured it — reported for provenance, never used to rank. */
  source: string;
  /** ISO timestamp; ties break on the earliest so the result is deterministic. */
  createdAt: string;
};

export type LogoPromotion = {
  logoUrl: string;
  /** How many of the company's postings carry this exact URL. */
  votes: number;
  /** How many postings carry a logo at all. */
  candidates: number;
  /** True when the company's postings disagreed and a majority decided it. */
  contested: boolean;
  sources: string[];
};

/**
 * A stored logo must be an absolute http(s) URL. `data:` URIs and relative
 * paths are rejected rather than stored: the value is rendered directly by
 * CompanyMark and copied onto every sibling posting by 11A's trigger, so a
 * malformed one would propagate widely.
 */
export function isUsableLogoUrl(url: string | null | undefined): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Chooses the logo a logo-less company should adopt from its own postings, or
 * null when there is nothing usable to adopt.
 *
 * `existingCompanyLogoUrl` is accepted so the refusal is enforced here rather
 * than trusted to every caller: a company that already has a logo keeps it.
 */
export function pickPromotableLogo(
  postings: readonly LogoCandidatePosting[],
  existingCompanyLogoUrl?: string | null,
): LogoPromotion | null {
  if ((existingCompanyLogoUrl ?? "").trim()) return null;

  const usable = postings.filter((posting) => isUsableLogoUrl(posting.companyLogoUrl));
  if (usable.length === 0) return null;

  type Tally = { votes: number; earliest: string; sources: Set<string> };
  const tallies = new Map<string, Tally>();
  for (const posting of usable) {
    const url = (posting.companyLogoUrl ?? "").trim();
    const existing = tallies.get(url);
    if (existing) {
      existing.votes += 1;
      if (posting.createdAt < existing.earliest) existing.earliest = posting.createdAt;
      existing.sources.add(posting.source);
      continue;
    }
    tallies.set(url, {
      votes: 1,
      earliest: posting.createdAt,
      sources: new Set([posting.source]),
    });
  }

  const ranked = [...tallies.entries()].sort((a, b) => {
    if (b[1].votes !== a[1].votes) return b[1].votes - a[1].votes;
    if (a[1].earliest !== b[1].earliest) return a[1].earliest < b[1].earliest ? -1 : 1;
    // Final tie-break on the URL itself, so the order is total and stable.
    return a[0] < b[0] ? -1 : 1;
  });

  const [logoUrl, winner] = ranked[0];
  return {
    logoUrl,
    votes: winner.votes,
    candidates: usable.length,
    contested: tallies.size > 1,
    sources: [...winner.sources].sort(),
  };
}
