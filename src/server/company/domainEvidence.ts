// ── Module 11C-1: establishing an employer's own domain from trusted evidence ──
//
// Module 11A shipped a domain→favicon logo fallback and it has never resolved a
// single company, because `companies.domain` is NULL on every row: 11A derived
// the domain only from `global_jobs.company_url`, which is NULL on 1,484 of
// 1,699 postings and a job board's own host on most of the rest. The mechanism
// was never wrong — it was never fed. This module is the missing input.
//
// The hard requirement is that a WRONG domain is far worse than no domain: it
// puts another company's mark on an employer's postings, everywhere, silently.
// So a domain is established only two ways, both requiring an independent
// (non-name) signal, exactly as Module 11B's board-identity guard demands:
//
//   TIER A — SELF-EVIDENCED. The employer serves its own postings from the
//     host. HighRadius postings live at highradius.com/about/careers-list,
//     Netradyne's at netradyne.com/company/careers, and thousands of small
//     Internshala employers carry their own site in `company_url`. The host
//     being present in the company's OWN posting URLs is the independent
//     signal; a strong name↔label match then confirms it is not a vendor or
//     tracking host that happened to be captured.
//
//   TIER B — CURATED, GUARD-CONFIRMED. `scripts/companyCandidates.ts` asserts
//     each company's domain as "public, stable, and independently checkable".
//     That is a good source but it is NAME-KEYED, and name evidence cannot
//     separate homonyms — trusting it alone is precisely how `porter.in` would
//     be stamped onto a US healthcare company's 28 postings. So a curated
//     domain is accepted only when the EXISTING Module 11B guard
//     (`evaluateBoardIdentity`) returns `accepted` against the company's own
//     stored posting text, i.e. the postings both name the company and carry
//     the curated domain. No fetching: the guard is run over text already in
//     the database.
//
// Everything else is refused, with a reason. Refusal is the safe outcome —
// the company simply keeps CompanyMark's initials fallback.
//
// A company whose key is a known homonym is never resolved by name at all: it
// must arrive already disambiguated (see homonyms.ts), and then carries its own
// evidence-established domain or none.

import { evaluateBoardIdentity } from "@/server/jobIntelligence/crawl/verify/boardIdentity";
import { isJobBoardHost } from "./identity";
import { findHomonymEntity, isDisambiguatedKey, isHomonymKey } from "./homonyms";

/** Where an accepted domain came from. Stored alongside it so a decision is auditable. */
export type DomainEvidenceTier = "homonym_curated" | "self_evidenced" | "curated_guard_confirmed";

export type DomainCandidate = {
  /** A URL already stored on one of the company's own postings. */
  url: string | null | undefined;
  /** Which column it came from — reported, never used to lower the bar. */
  field: "company_url" | "company_career_url" | "url" | "source_url";
};

export type DomainDecision =
  | { ok: true; domain: string; tier: DomainEvidenceTier; reason: string }
  | { ok: false; reason: string };

/**
 * Hosts that are not an employer's own site but are NOT job boards either, so
 * they fall outside `isJobBoardHost`'s remit (every board/ATS host lives there,
 * in Module 11A's shared list, which 11C-1 extended). These are the social,
 * document-hosting, shortener and reserved hosts the 11C audit found captured
 * as if they were company sites.
 */
const NON_EMPLOYER_HOSTS = [
  // Social / generic hosts an employer page is sometimes captured from. A
  // company's Instagram page is not its domain, and its favicon is Instagram's.
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "medium.com",
  "notion.site",
  "google.com",
  "docs.google.com",
  "sites.google.com",
  "forms.gle",
  "bit.ly",
  "t.me",
  "wa.me",
  // Placeholder/test hosts — the 11C investigation found 7 fabricated seed
  // postings served from careers.example.com.
  "example.com",
  "example.org",
  "example.net",
  "localhost",
];

/** True when a host cannot be an employer's own domain. */
export function isNonEmployerHost(hostname: string): boolean {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host) return true;
  if (isJobBoardHost(host)) return true;
  return NON_EMPLOYER_HOSTS.some((banned) => host === banned || host.endsWith(`.${banned}`));
}

/** Lowercased, `www.`-stripped hostname, or null when the input is not a usable URL. */
export function hostnameOf(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * Multi-label public suffixes that appear in this dataset. Used only to find
 * the label a company name should be compared against ("acme" in
 * "careers.acme.co.in"), never for registrability decisions.
 */
const MULTI_LABEL_SUFFIXES = [
  "co.in",
  "co.uk",
  "com.au",
  "co.jp",
  "com.br",
  "co.za",
  "org.in",
  "net.in",
  "ac.in",
  "gov.in",
];

/** The name-bearing label of a host: "careers.acme.co.in" → "acme". */
export function significantLabel(hostname: string): string {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host) return "";
  const parts = host.split(".");
  const suffixLength = MULTI_LABEL_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`)) ? 3 : 2;
  const base = parts.slice(-suffixLength);
  return (base[0] ?? "").replace(/[^a-z0-9]/g, "");
}

/**
 * Whether a host's own label corroborates the company name.
 *
 * Deliberately NOT fuzzy: equality, or one being a prefix of the other with the
 * shorter side at least four characters. Prefix (not substring) matching is
 * what keeps "Pixalsoft" off `truegether.com` and "Finfluence" off
 * `acmegroup.co.in` — both real captured `company_url` values for unrelated
 * businesses. Four characters is the floor at which a prefix stops being a
 * coincidence: it rejects "Fi"→"fitbit.com" while accepting
 * "Zell Education"→"zelleducation.com".
 */
export function labelCorroboratesName(companyName: string, hostname: string): boolean {
  const label = significantLabel(hostname);
  const name = (companyName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!label || !name) return false;
  if (label === name) return true;
  if (name.startsWith(label) && label.length >= 4) return true;
  if (label.startsWith(name) && name.length >= 4) return true;
  return false;
}

export type DomainEvidenceInput = {
  /** Display name as stored on the `companies` row. */
  companyName: string;
  /** The row's `normalized_key` — a "#" key means it is already disambiguated. */
  normalizedKey: string;
  /** Curated domain for this identity key, if `companyCandidates.ts` asserts one. */
  curatedDomain?: string | null;
  /** URLs from the company's OWN postings. */
  candidates: readonly DomainCandidate[];
  /**
   * Text from the company's own postings (descriptions), concatenated. Used
   * ONLY to run the Module 11B guard over a curated domain. Absent or empty
   * text means the guard cannot corroborate, so the curated domain is refused.
   */
  postingText?: string | null;
};

/**
 * Decides whether an employer domain can be established. Pure and synchronous —
 * every branch is directly testable and no branch performs I/O.
 */
export function decideEmployerDomain(input: DomainEvidenceInput): DomainDecision {
  const { companyName, normalizedKey, curatedDomain, candidates, postingText } = input;

  // 1. An already-disambiguated homonym carries its own evidence-established
  //    domain (or explicitly none). Nothing else may override it.
  if (isDisambiguatedKey(normalizedKey)) {
    const entity = findHomonymEntity(normalizedKey);
    if (!entity) {
      return { ok: false, reason: `Unknown disambiguated key "${normalizedKey}" — refusing.` };
    }
    if (!entity.domain) {
      return {
        ok: false,
        reason: `${entity.canonicalName}: no employer domain is established for this entity (${entity.note}). Refusing rather than guessing.`,
      };
    }
    return {
      ok: true,
      domain: entity.domain,
      tier: "homonym_curated",
      reason: `${entity.canonicalName}: domain established by the curated homonym table from board evidence (${entity.evidence.join(", ")}).`,
    };
  }

  // 2. A plain key that is a KNOWN homonym must be split before it can hold a
  //    domain. Assigning one now would brand both real companies at once.
  if (isHomonymKey(normalizedKey)) {
    return {
      ok: false,
      reason: `"${normalizedKey}" is a known homonym shared by more than one real employer and has not been disambiguated yet — refusing to assign a domain.`,
    };
  }

  // 3. TIER A — the employer serves its own postings from the host.
  for (const candidate of candidates) {
    const host = hostnameOf(candidate.url);
    if (!host || isNonEmployerHost(host)) continue;
    if (!labelCorroboratesName(companyName, host)) continue;
    return {
      ok: true,
      domain: host,
      tier: "self_evidenced",
      reason: `${companyName}: serves its own postings from ${host} (${candidate.field}), and the host's label corroborates the company name.`,
    };
  }

  // 4. TIER B — curated domain, confirmed by the Module 11B guard against the
  //    company's own stored posting text.
  const curated = (curatedDomain ?? "").trim().toLowerCase();
  if (!curated) {
    return {
      ok: false,
      reason: `${companyName}: no employer host in its own posting URLs and no curated domain — no evidence to establish a domain from.`,
    };
  }
  if (isNonEmployerHost(curated)) {
    return {
      ok: false,
      reason: `${companyName}: curated domain "${curated}" is a job-board/ATS host and can never be an employer domain.`,
    };
  }

  const text = (postingText ?? "").trim();
  if (!text) {
    return {
      ok: false,
      reason: `${companyName}: curated domain "${curated}" could not be corroborated — the company's postings carry no text for the board-identity guard to read.`,
    };
  }

  const verdict = evaluateBoardIdentity({
    expectedCompany: companyName,
    boardText: text,
    expectedDomain: curated,
  });
  if (verdict.outcome !== "accepted") {
    return {
      ok: false,
      reason: `${companyName}: curated domain "${curated}" refused by the board-identity guard — ${verdict.reason}`,
    };
  }
  return {
    ok: true,
    domain: curated,
    tier: "curated_guard_confirmed",
    reason: `${companyName}: curated domain "${curated}" corroborated by the board-identity guard — ${verdict.reason}`,
  };
}
