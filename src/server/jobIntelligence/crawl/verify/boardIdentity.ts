// ── Module 11B: the board-identity guard ──
//
// WHY THIS EXISTS. Source discovery guesses an ATS slug from a company name
// and asks `verifySource` whether a board is there. `verifySource` answers
// "is this a reachable board serving postings?" — an availability question.
// It has never answered "does this board belong to the company we asked
// about?", because it only uses the company name to DETECT a slug, never to
// validate the result.
//
// The Module 11B investigation measured what that gap costs: probing 155
// candidate companies produced 22 board hits, of which ~9 were a DIFFERENT
// company entirely — a ~40% false-positive rate. Real examples, all of which
// `verifySource` called HEALTHY with live postings:
//
//   boards.greenhouse.io/pine   → a Canadian real-estate agency, not Pine Labs
//   jobs.lever.co/blue          → LATAM data roles, not Blue Tokai
//   jobs.ashbyhq.com/stable     → a Denver mail-processing firm, not Stable Money
//   google.recruitee.com        → a Recruitee DEMO tenant ("Senior Marketer (Sample)")
//   samsung.recruitee.com       → the same demo template in German ("(Muster)")
//
// Registering any of those would attach a foreign company's jobs to an Indian
// company row — a data-integrity failure strictly worse than missing coverage,
// and one nothing downstream could detect or undo.
//
// ── Why the verdict has THREE states, not two ──
//
// The obvious design (does the board name the company? then accept) was built
// first and measured against the real boards. It rejected the slug-coincidence
// cases correctly, but it WRONGLY ACCEPTED three others:
//
//   minimalist.recruitee.com    named "Minimalist"  40× → a UAE retailer
//   jobs.ashbyhq.com/navi       named "Navi"        91× → a US startup
//   boards.greenhouse.io/bluestone named "Bluestone" 250× → a US healthcare org
//
// Those boards are not lying and the matching is not buggy: there genuinely
// are other companies with those names. Name evidence cannot separate
// homonyms, however much of it there is — so treating "names the company a
// lot" as proof is unsound in exactly the cases that matter most.
//
// Hence: name evidence alone yields NEEDS_REVIEW, never ACCEPTED. Automatic
// registration additionally requires an INDEPENDENT signal — the employer's
// own domain appearing in the board. Absence of evidence is never a pass.
//
// Consequence, stated plainly: until reliable employer domains exist (Module
// 11A found none in the current data — every captured `company_url` was a job
// board's domain), this guard will route essentially all discovered boards to
// human review. That is the correct outcome, not a limitation to work around:
// it is the measured false-positive rate refusing to be automated away.
//
// Scope note: this is a discovery/registration-time gate. It does NOT run
// during crawling and changes no Module 10 behaviour — `SourceVerifier`,
// the adapters, dedup and the orchestrator are all untouched.

import { curatedNameVariants, identityKey } from "../registry/companyIdentity";
import { normalizeCompanyName } from "../../normalize/company";
import type { CrawlFetcher } from "../HttpFetcher";

export type IdentityOutcome =
  /** Independently corroborated. The only state safe to register automatically. */
  | "accepted"
  /** Plausible but unproven (homonym risk). An operator must confirm before registering. */
  | "needs_review"
  /** Positively disqualified: a demo tenant, or content belonging to someone else. */
  | "rejected";

export type IdentityEvidence = {
  /** Occurrences of the company's name in human-readable board content. */
  nameMentions: number;
  /** True when the company's own domain appears in the board (e.g. apply links). */
  domainMatch: boolean;
  /** Demo/sample-tenant markers found, if any. */
  demoMarkers: string[];
};

export type IdentityVerdict = {
  outcome: IdentityOutcome;
  /** True only for `accepted`. Registration paths should gate on THIS, not on the absence of a rejection. */
  autoRegisterable: boolean;
  confidence: "strong" | "moderate" | "none";
  /** Operator-facing explanation — always populated, whatever the outcome. */
  reason: string;
  evidence: IdentityEvidence;
};

/**
 * Self-serve ATS platforms ship demo/sample tenants that answer on generic
 * slugs. These are the literal strings the investigation found live on
 * `google.recruitee.com` and `samsung.recruitee.com`; the localized variants
 * are included because the same template is served per locale.
 */
const DEMO_MARKERS = [
  "(sample)",
  "(muster)", // de
  "(ejemplo)", // es
  "(exemple)", // fr
  "(voorbeeld)", // nl
  "sample job",
  "demo tenant",
  "this is a demo",
  "example job posting",
  "lorem ipsum",
];

/**
 * Strips anything URL-shaped out of the board text.
 *
 * Critical, not cosmetic: a board hosted at `google.recruitee.com` contains
 * the string "google" in every self-referential link on the page, so counting
 * name mentions against the raw text would let ANY slug-guessed board vouch
 * for itself. Name evidence must come from human-readable content only.
 */
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>)\]]+/gi, " ")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, " ");
}

/**
 * Turns one name into a token sequence matching spacing/punctuation drift
 * ("SigNoz" ≡ "signoz" ≡ "Sig-Noz"), or null when the name is too short or
 * generic to be evidence of anything.
 */
function tokenPatternFor(name: string): { source: string; tokens: number } | null {
  const tokens = identityKey(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  // A single very short token ("HP", "Fi") matches far too much prose to be
  // evidence of anything — treated as unusable rather than trusted.
  if (tokens.length === 1 && tokens[0].length < 4) return null;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { source: escaped.join("[\\s\\-_]*"), tokens: tokens.length };
}

/**
 * Matches the company's name OR any name the curated identity table already
 * records as the SAME entity (Module 11C-1).
 *
 * WHY ALIASES BELONG HERE. A company that legally renames itself posts under
 * the new name: Zomato's board is `lever.co/eternal`, Fi Money's is
 * `lever.co/epifi`. Searching only for the canonical name reads such a board as
 * "the slug matched but the content belongs to someone else" — a false
 * rejection of a legitimate board. The alias set comes exclusively from
 * `curatedNameVariants`, an exact reverse lookup over the hand-curated
 * CANONICAL_ALIASES table; no similarity scoring is involved.
 *
 * WHY THIS CANNOT WEAKEN THE GUARD. Aliases only ever raise `nameMentions`,
 * and name evidence alone has never been sufficient — `accepted` still requires
 * the employer's own domain in the board. So the widest possible effect of this
 * function is moving a verdict from `rejected` to `needs_review`, which is a
 * human decision, not an automatic registration. The homonym protections are a
 * separate mechanism keyed on URL evidence (server/company/homonyms.ts) and are
 * not consulted, or affected, here.
 *
 * Variants are matched longest-first inside one alternation so overlapping
 * forms ("Zomato" and "zomato eternal") cannot double-count the same text.
 */
function buildNamePattern(expectedCompany: string): RegExp | null {
  // Reuse the SAME canonicalization the rest of the system uses, so the guard
  // agrees with how the company will actually be stored (Module 11A identity).
  const canonical = normalizeCompanyName(expectedCompany).canonicalName || expectedCompany;

  const seen = new Set<string>();
  const patterns: { source: string; tokens: number }[] = [];
  for (const variant of [canonical, ...curatedNameVariants(canonical)]) {
    const pattern = tokenPatternFor(variant);
    if (!pattern || seen.has(pattern.source)) continue;
    seen.add(pattern.source);
    patterns.push(pattern);
  }
  if (patterns.length === 0) return null;

  patterns.sort((a, b) => b.tokens - a.tokens || b.source.length - a.source.length);
  return new RegExp(`(?:${patterns.map((p) => p.source).join("|")})`, "gi");
}

function verdict(
  outcome: IdentityOutcome,
  confidence: IdentityVerdict["confidence"],
  reason: string,
  evidence: IdentityEvidence,
): IdentityVerdict {
  return { outcome, autoRegisterable: outcome === "accepted", confidence, reason, evidence };
}

/**
 * Decides whether a discovered board may be registered for `expectedCompany`.
 *
 * Pure and synchronous — all I/O belongs to the caller — so every branch is
 * directly testable. `expectedDomain` is the employer's OWN domain and is what
 * separates `accepted` from `needs_review`; it must never be a job-board or
 * ATS domain (see Module 11A's `extractDomain`, which enforces exactly that).
 */
export function evaluateBoardIdentity(input: {
  expectedCompany: string;
  boardText: string;
  /** The employer's own domain, when known. Never a job-board/ATS domain. */
  expectedDomain?: string | null;
}): IdentityVerdict {
  const { expectedCompany, boardText, expectedDomain } = input;
  const text = boardText ?? "";
  const lower = text.toLowerCase();

  const demoMarkers = DEMO_MARKERS.filter((marker) => lower.includes(marker));
  const readable = stripUrls(text);

  const pattern = buildNamePattern(expectedCompany);
  const nameMentions = pattern ? (readable.match(pattern) ?? []).length : 0;

  const domain = (expectedDomain ?? "").trim().toLowerCase();
  const domainMatch = domain.length > 0 && lower.includes(domain);

  const evidence: IdentityEvidence = { nameMentions, domainMatch, demoMarkers };

  // 1. Demo/sample tenants — disqualified ahead of every other signal, because
  //    a demo tenant on a guessed slug will happily echo the name back at us.
  if (demoMarkers.length > 0) {
    return verdict(
      "rejected",
      "none",
      `Rejected: board looks like an ATS demo/sample tenant (found ${demoMarkers
        .map((m) => `"${m}"`)
        .join(", ")}), not ${expectedCompany}'s real board.`,
      evidence,
    );
  }

  if (!pattern) {
    return verdict(
      "needs_review",
      "none",
      `Needs review: "${expectedCompany}" is too short or generic to identify a board by name. Confirm manually.`,
      evidence,
    );
  }

  // 2. No mention at all — the slug matched, the content is someone else's.
  if (nameMentions === 0) {
    return verdict(
      "rejected",
      "none",
      `Rejected: nothing in the board ties it to ${expectedCompany} — the slug matched but the content belongs to someone else.`,
      evidence,
    );
  }

  // 3. Named AND independently corroborated by the employer's own domain.
  //    The only path to automatic registration.
  if (domainMatch) {
    return verdict(
      "accepted",
      "strong",
      `Accepted: board names ${expectedCompany} ${nameMentions} time(s) and links the company's own domain (${domain}).`,
      evidence,
    );
  }

  // 4. Named, but nothing independent backs it up. This is precisely where
  //    Minimalist / Navi / Bluestone sat — heavily named, and still the wrong
  //    company. Never auto-registered on name evidence alone.
  return verdict(
    "needs_review",
    "moderate",
    `Needs review: board names ${expectedCompany} ${nameMentions} time(s), but no independent signal (employer domain) confirms it is the right company — a different company sharing the name produces exactly this. Confirm manually, or supply the employer's domain.`,
    evidence,
  );
}

/**
 * Fetches a discovered board and runs {@link evaluateBoardIdentity} over it.
 * A board that cannot be read is REJECTED, not given the benefit of the
 * doubt — unverifiable and verified are not the same thing.
 *
 * ⚠️ Pass the board's DATA endpoint (the URL the ATS provider itself fetches),
 * not its human-facing HTML page: several ATS front-ends sit behind anti-bot
 * interstitials that return a challenge page instead of the board.
 */
export async function confirmBoardIdentity(
  boardUrl: string,
  expectedCompany: string,
  fetcher: CrawlFetcher,
  expectedDomain?: string | null,
): Promise<IdentityVerdict> {
  const result = await fetcher.fetchText(boardUrl, {});
  if (!result.ok) {
    return verdict(
      "rejected",
      "none",
      `Rejected: could not read the board to confirm it belongs to ${expectedCompany} (${result.reason}).`,
      { nameMentions: 0, domainMatch: false, demoMarkers: [] },
    );
  }
  return evaluateBoardIdentity({ expectedCompany, boardText: result.body, expectedDomain });
}
