// ── Module 10B.1.5: one-time registry discovery probe ──
//
// Generates the verified seed for `crawl_company_registry`. Run with:
//   npx vite-node scripts/probeCompanySources.ts
//
// It deliberately imports the PRODUCTION verifier and fetcher rather than
// re-implementing the checks, so what this script blesses is exactly what the
// app will later re-verify. Nothing here writes to the database — it prints
// JSON that a human reviews before it becomes migration SQL.
//
// Method, per company:
//   1. Try candidate ATS board slugs against each ATS's PUBLIC API. A slug is
//      only accepted when the API returns a real, parseable board. This is
//      discovery by evidence — a guessed slug that does not answer is discarded,
//      never written down.
//   2. Try candidate careers URLs on the company's own domain, and accept one
//      only if the page proves it is a jobs board (JobPosting markup, posting
//      links, or a link out to an ATS board).
//   3. Anything with no verified candidate is emitted as UNKNOWN with no URL.
//      That is the intended outcome for companies whose careers portal is
//      JS-rendered or login-walled.

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";
import {
  verifySource,
  type SourceVerification,
} from "../src/server/jobIntelligence/crawl/verify/SourceVerifier";
import { resolveCompanyIdentity } from "../src/server/jobIntelligence/crawl/registry/companyIdentity";
import { COMPANY_CANDIDATES, type CompanyCandidate } from "./companyCandidates";

type Outcome = {
  input: string;
  canonicalName: string;
  parentCompany: string | null;
  aliases: string[];
  chosenUrl: string | null;
  verification: SourceVerification | null;
  triedCount: number;
  attempts: Array<{ url: string; verification: SourceVerification }>;
};

const ATS_URL_BUILDERS: Array<(slug: string) => string> = [
  (slug) => `https://boards.greenhouse.io/${slug}`,
  (slug) => `https://jobs.lever.co/${slug}`,
  (slug) => `https://jobs.ashbyhq.com/${slug}`,
  (slug) => `https://apply.workable.com/${slug}/`,
  (slug) => `https://${slug}.recruitee.com/`,
  (slug) => `https://careers.smartrecruiters.com/${slug}`,
];

/**
 * ⚠️ Some ATS APIs answer 200 with an EMPTY board for any slug at all —
 * verified live: `api.smartrecruiters.com/v1/companies/<nonsense>/postings`
 * returns `{"totalFound":0,"content":[]}`. So for a slug we GUESSED, "the API
 * responded" is not evidence the board exists; only postings are.
 *
 * This rule applies to discovery only. `verifySource` itself is right to call
 * an operator-REGISTERED board with no open roles HEALTHY — there the URL was
 * asserted by a human, and "no openings right now" is a real, temporary state.
 */
function isAcceptableDiscovery(verification: SourceVerification): boolean {
  if (verification.health !== "HEALTHY" && verification.health !== "REDIRECTED") return false;
  const platform = verification.detectedPlatform;
  if (platform && platform !== "custom_careers") {
    return (verification.postingsSeen ?? 0) > 0;
  }
  // A custom careers page is on the company's OWN domain — the domain is the
  // identity evidence, and the page already had to show postings or job links
  // to be HEALTHY at all.
  return true;
}

/** Ranks verdicts so the strongest evidence wins when several candidates answer. */
function score(verification: SourceVerification): number {
  // Evidence of actual postings dominates everything else: a real ATS board
  // with zero postings must never outrank a careers page that is demonstrably
  // listing jobs right now.
  const acceptable = isAcceptableDiscovery(verification) ? 1000 : 0;
  const healthScore =
    verification.health === "HEALTHY"
      ? 400
      : verification.health === "REDIRECTED"
        ? 300
        : verification.health === "BLOCKED"
          ? 100
          : verification.health === "UNAVAILABLE"
            ? 60
            : verification.health === "UNKNOWN"
              ? 50
              : 10;
  const postingScore = Math.min((verification.postingsSeen ?? 0) > 0 ? 60 : 0, 60);
  // Only breaks ties between two otherwise-equal acceptable candidates: a
  // structured ATS feed is richer than scraping a page.
  const platformScore =
    verification.detectedPlatform && verification.detectedPlatform !== "custom_careers" ? 20 : 0;
  return acceptable + healthScore + postingScore + platformScore;
}

async function probeCompany(candidate: CompanyCandidate, fetcher: HttpFetcher): Promise<Outcome> {
  const identity = resolveCompanyIdentity(candidate.name);
  const urls: string[] = [];

  for (const slug of candidate.atsSlugs ?? []) {
    for (const build of ATS_URL_BUILDERS) urls.push(build(slug));
  }
  for (const url of candidate.careerUrls ?? []) urls.push(url);

  let best: { url: string; verification: SourceVerification } | null = null;
  /** Every candidate's verdict, so results can be re-derived without re-probing. */
  const attempts: Array<{ url: string; verification: SourceVerification }> = [];

  for (const url of urls) {
    let verification: SourceVerification;
    try {
      verification = await verifySource(url, identity.canonicalName, fetcher);
    } catch (error) {
      // A verifier crash must not lose the whole company.
      verification = {
        url,
        finalUrl: null,
        health: "UNKNOWN",
        httpStatus: null,
        detectedPlatform: null,
        errorReason: error instanceof Error ? error.message : "probe threw",
        checkedAt: new Date().toISOString(),
        postingsSeen: null,
      };
    }

    attempts.push({ url, verification });
    if (!best || score(verification) > score(best.verification)) {
      best = { url, verification };
    }
    // A healthy ATS board that is actually listing jobs is as good as it gets.
    if (
      verification.health === "HEALTHY" &&
      verification.detectedPlatform &&
      verification.detectedPlatform !== "custom_careers" &&
      (verification.postingsSeen ?? 0) > 0
    ) {
      break;
    }
  }

  const usable = best ? isAcceptableDiscovery(best.verification) : false;

  return {
    input: candidate.name,
    canonicalName: identity.canonicalName,
    parentCompany: identity.parentCompany,
    aliases: identity.aliases,
    chosenUrl: usable ? best!.url : null,
    verification: best?.verification ?? null,
    triedCount: urls.length,
    attempts,
  };
}

async function main() {
  const fetcher = new HttpFetcher(400);
  const outcomes: Outcome[] = [];

  // Sequential on purpose: this hammers a handful of shared ATS hosts, and the
  // fetcher's politeness delay is per-host. Correctness over speed for a
  // one-time script.
  let index = 0;
  for (const candidate of COMPANY_CANDIDATES) {
    index += 1;
    const outcome = await probeCompany(candidate, fetcher);
    outcomes.push(outcome);
    const verification = outcome.verification;
    process.stderr.write(
      `[${index}/${COMPANY_CANDIDATES.length}] ${outcome.canonicalName}: ` +
        `${verification?.health ?? "NO-CANDIDATES"} ` +
        `${verification?.detectedPlatform ?? "-"} ` +
        `${outcome.chosenUrl ?? "(none)"}\n`,
    );
  }

  process.stdout.write(JSON.stringify(outcomes, null, 2));
}

void main();
