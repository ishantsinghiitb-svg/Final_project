// ── Module 10B.1.5: seed SQL emitter ──
//
//   npx vite-node scripts/emitRegistrySql.ts <probe.json> <seed.json>
//
// Emits the INSERT for `crawl_company_registry` covering the WHOLE curated
// list, with each row carrying the verdict the probe actually reached:
//
//   enabled = true   — a jobs board was verified at this URL. Safe to crawl.
//   enabled = false  — the URL is real and was reached, but nothing proved it
//                      is a jobs board (or it is blocked/broken). Recorded so
//                      an operator can see and fix it; NOT crawled, because
//                      crawling an unverified source is how bad data gets in.
//
// No URL is invented: every one was fetched during the probe, and the health
// columns say exactly what happened when it was.

import { loadRegistryCandidates } from "../src/server/jobIntelligence/crawl/registry/registryLoader";
import { readFileSync } from "node:fs";
import { effectiveHealth } from "../src/server/jobIntelligence/crawl/verify/seedRules";
import type { SourceVerification } from "../src/server/jobIntelligence/crawl/verify/SourceVerifier";

type Attempt = { url: string; verification: SourceVerification };
type ProbeOutcome = { input: string; attempts: Attempt[] };
type SeedFile = {
  accepted: Array<{
    name: string;
    careersUrl: string;
    notes: string;
    detectedPlatform: string;
    postingsSeen: number | null;
  }>;
};

function sqlText(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlTextArray(values: string[]): string {
  if (values.length === 0) return "NULL";
  return `ARRAY[${values.map((value) => sqlText(value)).join(", ")}]::text[]`;
}

function sqlNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "NULL" : String(value);
}

/** Trims an operator-facing reason to something a table cell can show. */
function shortReason(reason: string | null): string | null {
  if (!reason) return null;
  const clean = reason.replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}…` : clean;
}

/** The most informative attempt for a company we could not verify. */
function bestRejected(attempts: Attempt[]): Attempt | null {
  const order = ["BLOCKED", "UNKNOWN", "UNAVAILABLE", "BROKEN"];
  const scored = attempts
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(a.verification.health) - order.indexOf(b.verification.health) ||
        (b.verification.postingsSeen ?? 0) - (a.verification.postingsSeen ?? 0),
    );
  // Prefer an attempt against the company's own site over a guessed ATS slug —
  // a 404 on a slug we made up is not a fact worth recording about the company.
  const ownSite = scored.find(
    (attempt) => !/greenhouse|lever|ashby|workable|recruitee|smartrecruiters/.test(attempt.url),
  );
  return ownSite ?? scored[0] ?? null;
}

function main() {
  const [probePath, seedPath] = process.argv.slice(2);
  const outcomes: ProbeOutcome[] = JSON.parse(readFileSync(probePath, "utf8"));
  const seed: SeedFile = JSON.parse(readFileSync(seedPath, "utf8"));

  const acceptedByName = new Map(seed.accepted.map((entry) => [entry.name, entry]));

  const candidates = outcomes.map((outcome) => {
    const accepted = acceptedByName.get(outcome.input);
    if (accepted) {
      return {
        name: outcome.input,
        careersUrl: accepted.careersUrl,
        platform: "career-pages",
        notes: accepted.notes,
        config: {},
        verified: true,
        health: "HEALTHY",
        detectedPlatform: accepted.detectedPlatform,
        postingsSeen: accepted.postingsSeen,
        httpStatus: 200,
        errorReason: null as string | null,
      };
    }

    const best = bestRejected(outcome.attempts ?? []);
    if (!best) {
      // No URL was ever tried for this name. It only belongs in the output if
      // it collapses into another company's row (an alias line in the curated
      // list). Marked with a null URL so the step below can drop it rather
      // than invent one.
      return {
        name: outcome.input,
        careersUrl: null as string | null,
        platform: "career-pages",
        notes: null,
        config: {},
        verified: false,
        health: "UNKNOWN",
        detectedPlatform: null,
        postingsSeen: null,
        httpStatus: null,
        errorReason: null as string | null,
      };
    }
    // A positive fetch that failed acceptance is stored as UNKNOWN, so
    // health_status never says "HEALTHY" on a row we refuse to crawl.
    const stored = effectiveHealth(best.verification);
    return {
      name: outcome.input,
      careersUrl: best.url as string | null,
      platform: "career-pages",
      notes: "Careers page reached but no jobs board confirmed. Disabled until verified.",
      config: {},
      verified: false,
      health: stored.health,
      detectedPlatform: stored.detectedPlatform,
      postingsSeen: best.verification.postingsSeen,
      httpStatus: best.verification.httpStatus,
      errorReason: shortReason(stored.errorReason),
    };
  });

  const loaded = loadRegistryCandidates(
    candidates.map((candidate) => ({ ...candidate, careersUrl: candidate.careersUrl ?? "" })),
  );
  const byUrl = new Map(candidates.map((candidate) => [candidate.careersUrl ?? "", candidate]));

  // A surviving row with no URL means an alias line did NOT collapse into a
  // real company — emitting it would invent a source. Fail loudly instead.
  const orphans = loaded.rows.filter((row) => !row.careersUrl);
  if (orphans.length > 0) {
    process.stderr.write(
      `ERROR: ${orphans.length} row(s) have no verified URL and did not collapse: ` +
        `${orphans.map((row) => row.companyName).join(", ")}\n`,
    );
    process.exit(1);
  }

  const values = loaded.rows.map((row) => {
    const source = byUrl.get(row.careersUrl)!;
    return (
      `  (${sqlText(row.companyName)}, ${sqlText(row.careersUrl)}, ${sqlText(row.platform)}, ` +
      `${source.verified ? "true" : "false"}, 24, ` +
      `${sqlText(row.parentCompany)}, ${sqlTextArray(row.aliases)}, ` +
      `${sqlText(source.health)}, ${sqlText(source.detectedPlatform)}, ` +
      `${sqlNumber(source.httpStatus)}, ${sqlNumber(source.postingsSeen)}, ` +
      `${sqlText(source.errorReason)}, ${sqlText(row.notes)})`
    );
  });

  process.stdout.write(
    `INSERT INTO crawl_company_registry (\n` +
      `  company_name, careers_url, platform, enabled, crawl_frequency_hours,\n` +
      `  parent_company, aliases,\n` +
      `  health_status, detected_platform, http_status, postings_seen, error_reason, notes\n` +
      `) VALUES\n${values.join(",\n")}\nON CONFLICT DO NOTHING;\n`,
  );

  const enabled = candidates.filter((candidate) => candidate.verified).length;
  process.stderr.write(
    `rows=${loaded.rows.length} enabled=${enabled} disabled=${loaded.rows.length - enabled} ` +
      `collapsed=${loaded.duplicates.length}\n`,
  );
  for (const duplicate of loaded.duplicates) {
    process.stderr.write(`  collapsed: ${duplicate.name} → ${duplicate.mergedInto}\n`);
  }
}

main();
