// ── Module 10B.1.5: probe results → migration seed ──
//
// Re-derives the accepted registry from `probeCompanySources.ts` output. Every
// candidate's verdict was recorded, so acceptance rules can be tightened
// without re-probing the live web.
//
//   npx vite-node scripts/deriveRegistrySeed.ts < probe2.json
//
// Acceptance is deliberately strict, because the governing rule for this phase
// is that an unverified URL is worse than an honest UNKNOWN:
//
//   ATS board  — must return at least one posting. Some ATS APIs answer 200
//                with an empty board for ANY slug (verified: SmartRecruiters),
//                so for a slug we GUESSED, only postings prove existence.
//   Custom page— must show at least MIN_CUSTOM_EVIDENCE postings/job links AND
//                still be on a careers-ish URL. One matched link is noise (a
//                nav item), and a page that redirected to /company/about is
//                not a jobs board no matter what it links to.

import { loadRegistryCandidates } from "../src/server/jobIntelligence/crawl/registry/registryLoader";
import { acceptsAsVerifiedSource } from "../src/server/jobIntelligence/crawl/verify/seedRules";
import type { SourceVerification } from "../src/server/jobIntelligence/crawl/verify/SourceVerifier";

type Attempt = { url: string; verification: SourceVerification };
type ProbeOutcome = {
  input: string;
  canonicalName: string;
  parentCompany: string | null;
  attempts: Attempt[];
};

// The acceptance rules live in production code (`verify/seedRules.ts`) and are
// unit-tested there — this script only applies them, so the seed it generated
// and any later health check agree by construction rather than by coincidence.
const accepts = acceptsAsVerifiedSource;

/** Prefers a structured ATS feed, then the strongest evidence. */
function rank(verification: SourceVerification): number {
  const platform = verification.detectedPlatform;
  const structured = platform && platform !== "custom_careers" ? 1000 : 0;
  return structured + Math.min(verification.postingsSeen ?? 0, 500);
}

function main() {
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    const outcomes: ProbeOutcome[] = JSON.parse(raw);

    const accepted: Array<{ outcome: ProbeOutcome; attempt: Attempt }> = [];
    const rejected: Array<{ outcome: ProbeOutcome; best: Attempt | null }> = [];

    for (const outcome of outcomes) {
      const viable = (outcome.attempts ?? []).filter((attempt) => accepts(attempt.verification));
      if (viable.length === 0) {
        const best =
          (outcome.attempts ?? [])
            .slice()
            .sort((a, b) => rank(b.verification) - rank(a.verification))[0] ?? null;
        rejected.push({ outcome, best });
        continue;
      }
      viable.sort((a, b) => rank(b.verification) - rank(a.verification));
      accepted.push({ outcome, attempt: viable[0] });
    }

    // Prefer the URL a human would recognize (the careers/board page) over the
    // raw API endpoint the verifier probed.
    const candidates = accepted.map(({ outcome, attempt }) => {
      const platform = attempt.verification.detectedPlatform!;
      const url =
        platform === "custom_careers"
          ? (attempt.verification.finalUrl ?? attempt.url)
          : attempt.url;
      return {
        name: outcome.input,
        careersUrl: url,
        platform: "career-pages",
        notes:
          platform === "custom_careers"
            ? `Custom careers page. Verified: ${attempt.verification.postingsSeen} posting(s) visible.`
            : `${platform} board. Verified: ${attempt.verification.postingsSeen} posting(s).`,
        detectedPlatform: platform,
        postingsSeen: attempt.verification.postingsSeen,
      };
    });

    const loaded = loadRegistryCandidates(candidates);

    process.stdout.write(
      JSON.stringify(
        {
          accepted: candidates.map((candidate, index) => ({
            ...candidate,
            row: loaded.rows.find((row) => row.careersUrl === candidate.careersUrl) ?? null,
            index,
          })),
          rows: loaded.rows,
          duplicates: loaded.duplicates,
          rejected: rejected.map(({ outcome, best }) => ({
            name: outcome.input,
            canonicalName: outcome.canonicalName,
            health: best?.verification.health ?? "UNKNOWN",
            detectedPlatform: best?.verification.detectedPlatform ?? null,
            reason: best?.verification.errorReason ?? "No candidate URL verified.",
            triedUrl: best?.url ?? null,
          })),
        },
        null,
        2,
      ),
    );

    process.stderr.write(
      `accepted ${loaded.rows.length} rows (${candidates.length} candidates, ` +
        `${loaded.duplicates.length} collapsed) · rejected ${rejected.length}\n`,
    );
  });
}

main();
