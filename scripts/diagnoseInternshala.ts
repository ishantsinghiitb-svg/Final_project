// ── Module 10B.2.5: read-only Internshala network diagnostic ──
//
// Answers one question: has the transient "fetch failed" condition from the
// 2026-08-10 dry run cleared? Uses the REAL production HttpFetcher (same
// retry/timeout/backoff config the crawler uses) against the same two
// listing URLs. Makes network GET requests only — no database, no registry,
// no report writes. Run with:
//   npx vite-node scripts/diagnoseInternshala.ts

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";

const TARGETS = ["https://internshala.com/internships/", "https://internshala.com/jobs/"];

async function main() {
  const fetcher = new HttpFetcher();
  for (const url of TARGETS) {
    const start = Date.now();
    const result = await fetcher.fetchText(url);
    const ms = Date.now() - start;
    if (result.ok) {
      console.log(`OK   ${url} — HTTP ${result.status}, ${result.body.length} bytes, ${ms}ms`);
    } else {
      console.log(
        `FAIL ${url} — kind=${result.kind} status=${result.status} reason="${result.reason}" (${ms}ms)`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
