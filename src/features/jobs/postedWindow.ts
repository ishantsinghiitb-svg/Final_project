// ── The posted-date freshness window ──
//
// Shared by the crawler's ingestion gate
// (server/jobIntelligence/eligibility/freshness.ts) and the Jobs-page query
// (repositories/JobRepository#applyDiscoveryVisibility). It lives under
// features/ for the same reason the India gazetteer does: both sides need the
// number and the client build cannot import from server/.
//
// ⚠️ Do not confuse this with ./activeWindow.ts. They are both 30 days and they
// mean different things:
//
//   activeWindow  → `last_seen_at`: when a crawl last OBSERVED the job live.
//                   Answers "is this listing still up?". NULL means unknown and
//                   is KEPT.
//   postedWindow  → `posted_at`:    when the source says the job was POSTED.
//                   Answers "is this job new?". NULL means unknown and is
//                   REJECTED.
//
// The `posted_at` ceiling was shipped once before and reverted (it hid still-open
// reposts carrying old original dates — see activeWindow.ts). It is back as of
// the 2026-09-12 launch decision, deliberately and with that cost accepted,
// because OfferLyst promises fresh jobs rather than every open requisition.

/** The catalog's maximum posting age. Inclusive: exactly 30 days old is still fresh. */
export const MAX_JOB_AGE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The oldest posting instant still eligible right now. */
export function freshnessCutoffIso(
  now: Date = new Date(),
  maxAgeDays: number = MAX_JOB_AGE_DAYS,
): string {
  return new Date(now.getTime() - maxAgeDays * MS_PER_DAY).toISOString();
}
