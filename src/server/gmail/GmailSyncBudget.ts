// ── Gmail sync batching/budget (Module 13 · subrequest exhaustion fix) ──
//
// Extracted as pure functions (no Supabase/Gmail client, no network) so the
// checkpoint-safety logic — the part that must never be wrong, since getting
// it wrong means either losing messages or looping forever — is directly
// unit-testable, independent of GmailSyncService's orchestration (which
// needs a live AuthedContext and can't run in plain vitest).
//
// ── Why a budget exists at all ──
// Cloudflare Workers Free caps a single invocation at 50 subrequests total
// (every Supabase call and every Google API call counts). The old design's
// dedup check alone cost 1 subrequest PER CANDIDATE — with BATCH_SIZE=50,
// that consumed the entire budget before a single new message was ever
// fetched, permanently stalling the sync lock (observed live: 0 rows written
// anywhere, invocation after invocation, all on the identical first page).
//
// ── The fix, in three parts ──
// 1. Batch the dedup check itself (GmailRepository.findExistingGmailIds) —
//    one query for the whole page instead of one per candidate.
// 2. Keep an explicit subrequest reservation before starting each NEW
//    message's processing, so a pathological batch (every message needs the
//    AI fallback, has an .ics attachment, matches an application, and
//    produces all 3 possible suggestion types) still can't blow the budget —
//    it just stops cleanly and leaves the rest for next time.
// 3. Charge the retry CEILING for every retryable call, not a flat 1 per
//    logical call — a first cut of this file charged gmailFetch's calls and
//    classifyWithAI as 1 each, which undercounts real Cloudflare-visible
//    subrequests whenever a 429/5xx retry actually fires (gmailFetch retries
//    up to GMAIL_FETCH_MAX_ATTEMPTS times; classifyWithAI retries up to
//    CLASSIFY_MAX_ATTEMPTS times — both real, unconditional retry loops with
//    no per-call-site override anywhere in this codebase, confirmed by
//    reading every call site). An undercounting budget is not a safety
//    margin, it's a hole: `used` staying under SUBREQUEST_BUDGET on paper
//    while the real invocation has already spent more is exactly the
//    failure mode this whole mechanism exists to prevent. Charging the full
//    ceiling up front for every retryable call means `used` is a genuine
//    upper bound on real subrequests spent, never an optimistic guess —
//    it's pessimistic in the common case (most calls succeed on the first
//    attempt), which is the safe direction to be wrong in.

import { GMAIL_FETCH_MAX_ATTEMPTS } from "./GmailApiClient";
import { CLASSIFY_MAX_ATTEMPTS } from "./EmailClassifierAI";

/** Every Gmail API call (metadata/full/attachment/list/history) goes through gmailFetch's retry loop — this is its real ceiling, not an estimate. */
export const GMAIL_API_CALL_CHARGE = GMAIL_FETCH_MAX_ATTEMPTS;
/** classifyWithAI's own retry ceiling — see EmailClassifierAI.ts. */
export const AI_CLASSIFY_CALL_CHARGE = CLASSIFY_MAX_ATTEMPTS;
/** Every Supabase table query in this codebase (postgrest-js) — verified no built-in retry exists; a genuine single round-trip. */
export const SUPABASE_CALL_CHARGE = 1;

/**
 * Deliberately well under Cloudflare's Free-plan 50/invocation hard limit.
 * The 10-subrequest gap below 50 is the true safety margin for the fully
 * compounded worst case (every retryable call across the WHOLE invocation
 * — listing, every message, release — simultaneously hitting its retry
 * ceiling) — see the arithmetic proof in GmailSyncService.ts's own header
 * and GmailSyncBudget.test.ts's "grand total" tests.
 */
export const SUBREQUEST_BUDGET = 40;

/**
 * Reserved before starting EACH new message, not charged after — a message
 * already in flight always finishes; nothing is ever interrupted mid-write.
 * True worst case, every conditional signal present AND every retryable
 * call at its full retry ceiling:
 *   getMessageMetadata:  GMAIL_API_CALL_CHARGE  (3, always happens)
 *   getFullMessage:      GMAIL_API_CALL_CHARGE  (3, if relevant)
 *   AI classify fallback: AI_CLASSIFY_CALL_CHARGE (2, if Stage 1 unconfident)
 *   .ics attachment fetch: GMAIL_API_CALL_CHARGE (3, if interview + .ics)
 *   matchApplication:     2 × SUPABASE_CALL_CHARGE (2 — thread lookup +
 *                          linked-app lookup; contacts/applications are
 *                          prefetched, never queried per-message; Supabase
 *                          itself never retries)
 *   createMessage:        1 × SUPABASE_CALL_CHARGE (1, always)
 *   application_activity: 1 × SUPABASE_CALL_CHARGE (1, if matched)
 *   createSuggestion:     3 × SUPABASE_CALL_CHARGE (3 — verified against
 *                          SuggestionBuilder.ts: update_application +
 *                          one-of{create_interview, add_reminder} +
 *                          import_attachment is the true max, since the
 *                          first two branch on the same single category)
 * = 3 + 3 + 2 + 3 + 2 + 1 + 1 + 3 = 18.
 */
export const WORST_CASE_SUBREQUESTS_PER_MESSAGE =
  GMAIL_API_CALL_CHARGE * 3 + // metadata + full + attachment
  AI_CLASSIFY_CALL_CHARGE +
  SUPABASE_CALL_CHARGE * 7; // matchApplication(2) + createMessage(1) + activity(1) + suggestions(3)

/** True when starting one more message would stay within SUBREQUEST_BUDGET, reserving its full worst case up front. */
export function canAffordOneMoreMessage(used: number): boolean {
  return used + WORST_CASE_SUBREQUESTS_PER_MESSAGE <= SUBREQUEST_BUDGET;
}

// ── Backfill checkpoint ──

export type BackfillCheckpoint = { backfillComplete: boolean; pageTokenToPersist: string | null };

/**
 * Decides what to persist for the backfill cursor. The rule that matters:
 * the checkpoint only ever moves forward when EVERY candidate this
 * invocation fetched was actually processed (or determined irrelevant/
 * already-stored) — never when the subrequest budget cut the loop short.
 * A budget-interrupted run persists the SAME page token it started with, so
 * the next invocation re-requests the identical Gmail page — safe and cheap
 * now that dedup is batched (already-processed ids cost one shared query,
 * not one each), and guarantees nothing from a partially-worked page is
 * ever skipped.
 */
export function resolveBackfillCheckpoint(params: {
  allProcessed: boolean;
  startingPageToken: string | null;
  gmailNextPageToken: string | null;
}): BackfillCheckpoint {
  if (!params.allProcessed) {
    return { backfillComplete: false, pageTokenToPersist: params.startingPageToken };
  }
  return {
    backfillComplete: params.gmailNextPageToken === null,
    pageTokenToPersist: params.gmailNextPageToken,
  };
}

// ── History (incremental) checkpoint ──

/**
 * `historyId` only ever advances when BOTH hold: `allProcessed` — every
 * candidate the caller decided to work on this run was actually processed,
 * where "decided to work on" already accounts for anything the caller itself
 * sliced off past its own per-invocation processing cap (see
 * GmailSyncService.ts — `allProcessed` starts false if dedup left more new
 * ids than fit in one run, before the loop even begins, not only when the
 * subrequest budget cuts it short) — AND `historyExhausted` — history.list
 * was consumed all the way to its true end (Gmail returned no further page
 * within the listing-call ceiling; see accumulateHistoryCandidates, which no
 * longer truncates candidates itself, only pages). Otherwise the old
 * checkpoint is left untouched (the caller's existing
 * `...(newHistoryId ? {...} : {})` spread means "leave it alone" is simply
 * "return undefined" here) — the next invocation re-fetches from the SAME
 * startHistoryId, which Gmail's history.list resolves deterministically, so
 * nothing already-seen is lost and nothing unseen is skipped.
 */
export function resolveHistoryCheckpoint(params: {
  allProcessed: boolean;
  historyExhausted: boolean;
  latestHistoryId: string | undefined;
}): string | undefined {
  if (params.allProcessed && params.historyExhausted && params.latestHistoryId) {
    return params.latestHistoryId;
  }
  return undefined;
}

// ── History page accumulation ──

export type HistoryPage = { messageIds: string[]; nextPageToken: string | null; historyId: string };
/** Matches gmailApi.listHistory's shape minus the fixed accessToken/startHistoryId — injectable so this loop is testable without a live Gmail client. */
export type HistoryPageFetcher = (pageToken: string | undefined) => Promise<HistoryPage>;

export type HistoryAccumulation = {
  candidateIds: string[];
  /** True only when history.list was consumed to its genuine end with nothing locally truncated — see resolveHistoryCheckpoint. */
  historyExhausted: boolean;
  latestHistoryId: string | undefined;
  listingCallsUsed: number;
};

/**
 * Traverses history.list pages WITHIN one invocation (no persisted
 * cross-invocation page cursor needed — no migration) until Gmail confirms
 * there is nothing more, or `maxListingCalls` is reached first. Each listing
 * call is cheap (GMAIL_API_CALL_CHARGE subrequests, reserved via
 * `maxListingCalls` as its own small safety ceiling, independent of the
 * per-message processing budget).
 *
 * Deliberately collects EVERY id it encounters, uncapped — an earlier
 * version capped collection at a fixed `maxCandidates`, which silently
 * truncated whichever page happened to cross that boundary. That is safe in
 * isolation (historyExhausted correctly stayed false, so the checkpoint
 * never falsely advanced) but has no way to make forward progress: on
 * retry, this function starts from the SAME startHistoryId and always
 * re-derives the identical page boundary, so it re-truncates at the exact
 * same id every single time — the tail past that boundary (few as one
 * message) is never reached, EVER, even though nothing is technically lost
 * (proven live: re-running the old version 4 times against a 10-id/3-page
 * fixture collected the same first 8 ids on every run and never advanced).
 * Capping is now the CALLER's job, applied AFTER deduplication (see
 * GmailSyncService.ts) — dedup is what makes the ids already persisted from
 * a previous partial run free to re-collect, so the id that gets sliced off
 * this time is never the same one that got sliced off last time.
 */
export async function accumulateHistoryCandidates(
  fetchPage: HistoryPageFetcher,
  maxListingCalls: number,
): Promise<HistoryAccumulation> {
  const collected: string[] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | undefined;
  let historyExhausted = false;
  let listingCallsUsed = 0;

  while (listingCallsUsed < maxListingCalls) {
    const page = await fetchPage(pageToken);
    listingCallsUsed += 1;

    collected.push(...page.messageIds);
    latestHistoryId = page.historyId;

    if (page.nextPageToken === null) {
      historyExhausted = true;
      break;
    }
    pageToken = page.nextPageToken;
  }

  return { candidateIds: collected, historyExhausted, latestHistoryId, listingCallsUsed };
}

/** Small, independent of the per-message budget — bounds how many listing (not processing) calls one invocation can spend hunting for candidates, even across many small/empty history pages. */
export const HISTORY_LISTING_SAFETY_CEILING = 5;
