// ── Module 10B.1.5: slug cross-check ──
//
// `probeCompanySources.ts` discovers boards by trying candidate slugs against
// ATS APIs. A slug that answers proves a board EXISTS — it does not prove the
// board belongs to the company we meant. "hasura" on SmartRecruiters could be
// a different Hasura entirely.
//
// So every discovered board is crawled for one posting and the employer name
// the board itself reports is compared with the company we were looking for.
// A mismatch is dropped, not guessed at: attributing another company's jobs to
// this one would be the single worst failure mode of the whole registry.
//
//   npx vite-node scripts/crossCheckBoards.ts < probe_results.json

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";
import { detectAtsBoard } from "../src/server/jobIntelligence/adapters/careerPages/ats/detect";
import { getAtsProvider } from "../src/server/jobIntelligence/adapters/careerPages/ats";
import type { AtsPostingPayload } from "../src/server/jobIntelligence/adapters/careerPages/ats/types";
import { identityKey } from "../src/server/jobIntelligence/crawl/registry/companyIdentity";

type ProbeOutcome = {
  input: string;
  canonicalName: string;
  parentCompany: string | null;
  aliases: string[];
  chosenUrl: string | null;
  verification: {
    health: string;
    detectedPlatform: string | null;
    httpStatus: number | null;
    postingsSeen: number | null;
    finalUrl: string | null;
    errorReason: string | null;
  } | null;
};

/** Tokens too generic to prove identity on their own. */
const WEAK_TOKENS = new Set([
  "the",
  "group",
  "india",
  "technologies",
  "technology",
  "labs",
  "systems",
  "solutions",
  "services",
  "company",
  "consumer",
  "global",
  "digital",
  "ltd",
  "limited",
  "private",
  "pvt",
  "inc",
  "corp",
  "holdings",
  "ventures",
  "financial",
]);

function significantTokens(name: string): string[] {
  return identityKey(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !WEAK_TOKENS.has(token));
}

/**
 * True when the employer the board reports plausibly IS the company we wanted.
 * Requires a significant token to survive on both sides — a shared "India" or
 * "Technologies" proves nothing.
 */
export function namesAgree(expected: string, reported: string): boolean {
  const a = significantTokens(expected);
  const b = significantTokens(reported);
  if (a.length === 0 || b.length === 0) return false;
  const bKey = ` ${b.join(" ")} `;
  const aKey = ` ${a.join(" ")} `;
  return (
    a.some((token) => bKey.includes(` ${token} `)) ||
    b.some((token) => aKey.includes(` ${token} `)) ||
    // Handles concatenated forms ("physicswallah" vs "physics wallah").
    b.join("").includes(a.join("")) ||
    a.join("").includes(b.join(""))
  );
}

async function reportedEmployer(url: string, fetcher: HttpFetcher): Promise<string | null> {
  const detection = detectAtsBoard(url, "", {});
  if (!detection.ok) return null;

  const provider = getAtsProvider(detection.board.provider);
  const result = await provider.crawl(detection.board, fetcher, {
    maxPostings: 1,
    maxDetailFetches: 1,
  });
  if (result.failure || result.raws.length === 0) return null;

  const raw = result.raws[0];
  const parsed = provider.parsePosting(raw.json as AtsPostingPayload, raw);
  return parsed.ok ? parsed.job.companyName : null;
}

async function main() {
  const input = await new Promise<string>((resolve) => {
    let buffer = "";
    process.stdin.on("data", (chunk) => (buffer += chunk));
    process.stdin.on("end", () => resolve(buffer));
  });

  const outcomes: ProbeOutcome[] = JSON.parse(input);
  const fetcher = new HttpFetcher(400);
  const checked: Array<ProbeOutcome & { reportedEmployer: string | null; agrees: boolean }> = [];

  for (const outcome of outcomes) {
    const platform = outcome.verification?.detectedPlatform;
    // Only ATS boards need the check. A custom careers page is on the
    // company's OWN domain, which is itself the identity proof.
    const needsCheck =
      outcome.chosenUrl && platform && platform !== "custom_careers" && platform !== "jsonld";

    if (!needsCheck) {
      checked.push({ ...outcome, reportedEmployer: null, agrees: Boolean(outcome.chosenUrl) });
      continue;
    }

    const url = outcome.verification?.finalUrl ?? outcome.chosenUrl!;
    let employer: string | null = null;
    try {
      employer = await reportedEmployer(url, fetcher);
    } catch {
      employer = null;
    }

    // An empty board reports no employer; that is not a mismatch, just no
    // evidence either way. Keep it — the URL itself verified.
    const agrees = employer === null ? true : namesAgree(outcome.canonicalName, employer);
    checked.push({ ...outcome, reportedEmployer: employer, agrees });

    process.stderr.write(
      `${agrees ? "OK  " : "DROP"} ${outcome.canonicalName} → board says "${employer ?? "(unknown)"}" ${url}\n`,
    );
  }

  process.stdout.write(JSON.stringify(checked, null, 2));
}

void main();
