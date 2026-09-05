import { describe, expect, it } from "vitest";
import {
  SUBREQUEST_BUDGET,
  WORST_CASE_SUBREQUESTS_PER_MESSAGE,
  GMAIL_API_CALL_CHARGE,
  AI_CLASSIFY_CALL_CHARGE,
  SUPABASE_CALL_CHARGE,
  canAffordOneMoreMessage,
  resolveBackfillCheckpoint,
  resolveHistoryCheckpoint,
  accumulateHistoryCandidates,
  HISTORY_LISTING_SAFETY_CEILING,
  type HistoryPage,
} from "./GmailSyncBudget";
import { GMAIL_FETCH_MAX_ATTEMPTS } from "./GmailApiClient";
import { CLASSIFY_MAX_ATTEMPTS } from "./EmailClassifierAI";

// ── Gmail sync batching/checkpoint tests (subrequest exhaustion fix) ──
//
// These are pure functions specifically because the correctness that
// matters here — never losing a message, never advancing a checkpoint past
// unprocessed work, never blowing the subrequest budget — has to be
// verifiable without a live Gmail/Supabase client. GmailSyncService.syncUser
// itself can't run in plain vitest (needs a real AuthedContext); these
// functions are the actual decision logic it calls, extracted so that logic
// gets real coverage.

describe("canAffordOneMoreMessage — the subrequest budget stopping work safely", () => {
  it("affords a message when comfortably under budget", () => {
    expect(canAffordOneMoreMessage(0)).toBe(true);
    expect(canAffordOneMoreMessage(10)).toBe(true);
  });

  it("still affords a message right at the edge of the budget", () => {
    const edge = SUBREQUEST_BUDGET - WORST_CASE_SUBREQUESTS_PER_MESSAGE;
    expect(canAffordOneMoreMessage(edge)).toBe(true);
  });

  it("refuses a message that would cross the budget", () => {
    const overTheLine = SUBREQUEST_BUDGET - WORST_CASE_SUBREQUESTS_PER_MESSAGE + 1;
    expect(canAffordOneMoreMessage(overTheLine)).toBe(false);
  });

  it("refuses once already at or past the budget", () => {
    expect(canAffordOneMoreMessage(SUBREQUEST_BUDGET)).toBe(false);
    expect(canAffordOneMoreMessage(SUBREQUEST_BUDGET + 5)).toBe(false);
  });

  it("stays safely under Cloudflare's Workers Free 50-subrequest hard limit", () => {
    // The budget itself, PLUS one worst-case message reservation, PLUS the
    // final releaseGmailSyncLock call, must never reach 50.
    expect(SUBREQUEST_BUDGET + 1).toBeLessThan(50);
  });
});

describe("resolveBackfillCheckpoint — page token persisted only after a successful batch", () => {
  it("advances to Gmail's next page token when the whole batch was processed", () => {
    const result = resolveBackfillCheckpoint({
      allProcessed: true,
      startingPageToken: "page-1-token",
      gmailNextPageToken: "page-2-token",
    });
    expect(result).toEqual({ backfillComplete: false, pageTokenToPersist: "page-2-token" });
  });

  it("marks backfill complete when the fully-processed page was the last one", () => {
    const result = resolveBackfillCheckpoint({
      allProcessed: true,
      startingPageToken: "page-9-token",
      gmailNextPageToken: null,
    });
    expect(result).toEqual({ backfillComplete: true, pageTokenToPersist: null });
  });

  it("leaves the checkpoint at the STARTING token when the budget cut the batch short", () => {
    // The regression this guards: the old code advanced the cursor based
    // purely on Gmail's own pagination, with no awareness that this
    // invocation never actually finished working through the page.
    const result = resolveBackfillCheckpoint({
      allProcessed: false,
      startingPageToken: "page-1-token",
      gmailNextPageToken: "page-2-token", // Gmail says there's more — irrelevant, we didn't finish page 1
    });
    expect(result).toEqual({ backfillComplete: false, pageTokenToPersist: "page-1-token" });
  });

  it("never reports backfill complete on a partial run, even if Gmail's own page was the last one", () => {
    const result = resolveBackfillCheckpoint({
      allProcessed: false,
      startingPageToken: null,
      gmailNextPageToken: null, // Gmail's page WAS the last — but we didn't finish it
    });
    expect(result.backfillComplete).toBe(false);
  });

  it("a retried batch (same starting token) is idempotent — running it again resolves identically", () => {
    const first = resolveBackfillCheckpoint({
      allProcessed: false,
      startingPageToken: "page-1-token",
      gmailNextPageToken: "page-2-token",
    });
    const retry = resolveBackfillCheckpoint({
      allProcessed: false,
      startingPageToken: first.pageTokenToPersist,
      gmailNextPageToken: "page-2-token",
    });
    expect(retry.pageTokenToPersist).toBe("page-1-token");
  });
});

describe("resolveHistoryCheckpoint — historyId never advances past unprocessed messages", () => {
  it("advances when everything was processed and history was genuinely exhausted", () => {
    const result = resolveHistoryCheckpoint({
      allProcessed: true,
      historyExhausted: true,
      latestHistoryId: "hist-42",
    });
    expect(result).toBe("hist-42");
  });

  it("does NOT advance when the budget stopped processing partway through", () => {
    const result = resolveHistoryCheckpoint({
      allProcessed: false,
      historyExhausted: true,
      latestHistoryId: "hist-42",
    });
    expect(result).toBeUndefined();
  });

  it("does NOT advance when more history pages remain, even if everything collected so far was processed", () => {
    const result = resolveHistoryCheckpoint({
      allProcessed: true,
      historyExhausted: false,
      latestHistoryId: "hist-42",
    });
    expect(result).toBeUndefined();
  });

  it("does NOT advance when neither condition holds", () => {
    const result = resolveHistoryCheckpoint({
      allProcessed: false,
      historyExhausted: false,
      latestHistoryId: "hist-42",
    });
    expect(result).toBeUndefined();
  });

  it("does NOT advance to an undefined historyId even if both flags say safe", () => {
    const result = resolveHistoryCheckpoint({
      allProcessed: true,
      historyExhausted: true,
      latestHistoryId: undefined,
    });
    expect(result).toBeUndefined();
  });
});

describe("accumulateHistoryCandidates — multi-page traversal without losing messages", () => {
  function fetcherFromPages(pages: HistoryPage[]) {
    let calls = 0;
    const fetch = async (pageToken: string | undefined) => {
      const page = pages[calls];
      calls += 1;
      // Sanity-check the traversal actually threads the token through.
      if (calls > 1) {
        const expectedToken = pages[calls - 2].nextPageToken;
        if (pageToken !== (expectedToken ?? undefined)) {
          throw new Error(`expected pageToken ${expectedToken}, got ${pageToken} on call ${calls}`);
        }
      }
      if (!page) throw new Error("fetched past the end of the scripted pages");
      return page;
    };
    return { fetch, callCount: () => calls };
  }

  it("collects everything from a single page", async () => {
    const { fetch, callCount } = fetcherFromPages([
      { messageIds: ["a", "b", "c"], nextPageToken: null, historyId: "hist-1" },
    ]);
    const result = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);

    expect(result.candidateIds).toEqual(["a", "b", "c"]);
    expect(result.historyExhausted).toBe(true);
    expect(result.latestHistoryId).toBe("hist-1");
    expect(callCount()).toBe(1);
  });

  it("traverses multiple pages to collect candidates — the actual bug fix (old code called listHistory once, never looked at nextPageToken)", async () => {
    const { fetch, callCount } = fetcherFromPages([
      { messageIds: ["a", "b"], nextPageToken: "p2", historyId: "hist-partial-1" },
      { messageIds: ["c", "d"], nextPageToken: "p3", historyId: "hist-partial-2" },
      { messageIds: ["e"], nextPageToken: null, historyId: "hist-final" },
    ]);
    const result = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);

    expect(result.candidateIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.historyExhausted).toBe(true);
    expect(result.latestHistoryId).toBe("hist-final");
    expect(callCount()).toBe(3);
  });

  it("collects EVERY id across pages even past what one invocation could ever process — capping is the caller's job now, applied after dedup", async () => {
    // The exact shape of the original bug: 10 ids across 3 pages. This
    // function used to cap collection at maxCandidates=8 itself, silently
    // and permanently truncating "i" and "j" on every single retry (proven
    // live — see the git history / PR description). It must not truncate
    // anything anymore; GmailSyncService.ts slices AFTER deduplication so
    // which ids get deferred shifts across retries instead of being stuck.
    const { fetch } = fetcherFromPages([
      { messageIds: ["a", "b", "c"], nextPageToken: "p2", historyId: "hist-1" },
      { messageIds: ["d", "e", "f"], nextPageToken: "p3", historyId: "hist-2" },
      { messageIds: ["g", "h", "i", "j"], nextPageToken: null, historyId: "hist-final" },
    ]);
    const result = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);

    expect(result.candidateIds).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(result.historyExhausted).toBe(true); // Gmail's own pagination genuinely ended — nothing of ours was truncated
    expect(result.latestHistoryId).toBe("hist-final");
  });

  it("bounds the number of listing calls even across many small pages", async () => {
    // 10 tiny pages — without a listing-call ceiling this would keep
    // fetching forever chasing nextPageToken.
    const pages: HistoryPage[] = Array.from({ length: 10 }, (_, i) => ({
      messageIds: [`m${i}`],
      nextPageToken: i < 9 ? `p${i + 1}` : null,
      historyId: `hist-${i}`,
    }));
    const { fetch, callCount } = fetcherFromPages(pages);
    const result = await accumulateHistoryCandidates(fetch, 3);

    expect(callCount()).toBe(3);
    expect(result.candidateIds).toEqual(["m0", "m1", "m2"]);
    // Stopped by the listing-call ceiling, not genuine exhaustion — must
    // not be treated as safe to advance the checkpoint.
    expect(result.historyExhausted).toBe(false);
    expect(result.listingCallsUsed).toBe(3);
  });

  it("collects nothing and reports exhausted for an already-empty history window", async () => {
    const { fetch } = fetcherFromPages([
      { messageIds: [], nextPageToken: null, historyId: "hist-1" },
    ]);
    const result = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);

    expect(result.candidateIds).toEqual([]);
    expect(result.historyExhausted).toBe(true);
  });
});

// ── The permanent-stall regression this file exists to prevent ──
//
// Reproduces the exact scenario proved live before the fix: 10 ids across 3
// history.list pages, more than one invocation processes at once. Simulates
// GmailSyncService.ts's own dedup -> slice(BATCH_SIZE) -> allProcessed
// sequence across repeated invocations against the SAME startHistoryId
// (accumulateHistoryCandidates has no memory between calls, exactly like
// production — dedup is what has to carry state across invocations here).
describe("the tail-truncation stall — proven fixed, not just asserted", () => {
  const BATCH_SIZE = 8;

  function threePageFixture(): HistoryPage[] {
    return [
      { messageIds: ["a", "b", "c"], nextPageToken: "p2", historyId: "hist-1" },
      { messageIds: ["d", "e", "f"], nextPageToken: "p3", historyId: "hist-2" },
      { messageIds: ["g", "h", "i", "j"], nextPageToken: null, historyId: "hist-final" },
    ];
  }

  /** One simulated invocation: accumulate, dedup against `stored`, slice, decide the checkpoint — mirrors GmailSyncService.ts's own sequence exactly. */
  async function simulateOneInvocation(stored: Set<string>) {
    const pages = threePageFixture();
    let calls = 0;
    const fetch = async () => pages[calls++];

    const acc = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);
    const newAfterDedup = acc.candidateIds.filter((id) => !stored.has(id));
    const toProcess = newAfterDedup.slice(0, BATCH_SIZE);
    const allProcessed = newAfterDedup.length <= BATCH_SIZE; // matches GmailSyncService.ts's initialization

    for (const id of toProcess) stored.add(id); // simulates createMessage persisting each one

    const checkpoint = resolveHistoryCheckpoint({
      allProcessed,
      historyExhausted: acc.historyExhausted,
      latestHistoryId: acc.latestHistoryId,
    });
    return { toProcess, checkpoint };
  }

  it("reaches every id and advances the checkpoint within 2 invocations — never stalls", async () => {
    const stored = new Set<string>();

    const run1 = await simulateOneInvocation(stored);
    expect(run1.toProcess).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]); // first 8 new ids
    expect(run1.checkpoint).toBeUndefined(); // i, j still unprocessed — must not advance yet

    const run2 = await simulateOneInvocation(stored);
    expect(run2.toProcess).toEqual(["i", "j"]); // the two that were deferred — NOT the same 8 again
    expect(run2.checkpoint).toBe("hist-final"); // now safe — genuinely done

    expect(stored).toEqual(new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]));
  });

  it("never processes the same id twice across the two invocations", async () => {
    const stored = new Set<string>();
    const run1 = await simulateOneInvocation(stored);
    const run2 = await simulateOneInvocation(stored);
    const allProcessedIds = [...run1.toProcess, ...run2.toProcess];
    expect(new Set(allProcessedIds).size).toBe(allProcessedIds.length); // no duplicates
    expect(allProcessedIds.sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  });

  it("a third invocation after completion is a genuine no-op (nothing left to do, nothing re-processed)", async () => {
    const stored = new Set<string>();
    await simulateOneInvocation(stored);
    await simulateOneInvocation(stored);
    const run3 = await simulateOneInvocation(stored);
    expect(run3.toProcess).toEqual([]);
  });
});

// ── End-to-end property: retrying an interrupted history sync converges
// without ever losing or duplicating a message ──
describe("history accumulation + checkpoint together — retry safety", () => {
  it("a run interrupted by the budget, retried, eventually reaches full exhaustion with every id seen exactly once across the two runs", async () => {
    // Run 1: two pages exist, but the message-processing budget only
    // allowed 1 of the 2 collected candidates to actually be processed.
    const pages: HistoryPage[] = [
      { messageIds: ["a", "b"], nextPageToken: null, historyId: "hist-final" },
    ];
    let calls = 0;
    const fetch = async () => {
      const page = pages[calls];
      calls += 1;
      return page;
    };

    const run1 = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);
    expect(run1.candidateIds).toEqual(["a", "b"]);
    expect(run1.historyExhausted).toBe(true);

    // But suppose the message-processing loop only got through "a" before
    // the subrequest budget stopped it (allProcessed=false).
    const checkpointAfterRun1 = resolveHistoryCheckpoint({
      allProcessed: false,
      historyExhausted: run1.historyExhausted,
      latestHistoryId: run1.latestHistoryId,
    });
    expect(checkpointAfterRun1).toBeUndefined(); // historyId did NOT advance

    // Run 2 (retry): startHistoryId is unchanged, so Gmail returns the same
    // page again. Both ids are re-collected — "a" would be filtered out by
    // the batched dedup (already persisted from run 1), "b" gets processed.
    calls = 0;
    const run2 = await accumulateHistoryCandidates(fetch, HISTORY_LISTING_SAFETY_CEILING);
    expect(run2.candidateIds).toEqual(["a", "b"]); // both re-surface — dedup (not this function) is what skips "a"

    const checkpointAfterRun2 = resolveHistoryCheckpoint({
      allProcessed: true, // this time both fit in budget (only "b" is actually new work)
      historyExhausted: run2.historyExhausted,
      latestHistoryId: run2.latestHistoryId,
    });
    expect(checkpointAfterRun2).toBe("hist-final"); // now it's safe to advance
  });
});

// ── Grand-total subrequest proof (Cloudflare Workers Free = 50/invocation) ──
//
// The earlier version of this file charged every Gmail API call and the AI
// classify call as a flat 1, and the counter in GmailSyncService.ts didn't
// even start tracking until AFTER findConnectionForSync/claimSyncLock/
// refreshAccessToken had already run — both silently undercounted real
// Cloudflare-visible subrequests. This section re-derives the true worst
// case end to end, entirely from the same constants the production code
// uses (imported, never hand-copied), so a future change to a retry ceiling
// or the safety ceiling fails this test loudly instead of silently
// reopening the undercount.
describe("grand-total subrequest proof — the actual number that matters", () => {
  // Mirrors GMAIL_API_CALL_CHARGE/AI_CLASSIFY_CALL_CHARGE's own derivation —
  // proves the budget constants are still wired to the real retry ceilings,
  // not just plausible-looking numbers that happen to match today.
  it("GMAIL_API_CALL_CHARGE is really gmailFetch's own retry ceiling, not a copy of it", () => {
    expect(GMAIL_API_CALL_CHARGE).toBe(GMAIL_FETCH_MAX_ATTEMPTS);
  });

  it("AI_CLASSIFY_CALL_CHARGE is really classifyWithAI's own retry ceiling, not a copy of it", () => {
    expect(AI_CLASSIFY_CALL_CHARGE).toBe(CLASSIFY_MAX_ATTEMPTS);
  });

  it("WORST_CASE_SUBREQUESTS_PER_MESSAGE is exactly the sum of every enumerated per-message call, not an estimate", () => {
    // metadata + full + AI + attachment (each at its retry ceiling) +
    // matchApplication(2) + createMessage(1) + activity(1) + up to 3 suggestions
    const enumerated =
      GMAIL_API_CALL_CHARGE + // getMessageMetadata
      GMAIL_API_CALL_CHARGE + // getFullMessage
      AI_CLASSIFY_CALL_CHARGE + // classifyWithAI
      GMAIL_API_CALL_CHARGE + // getAttachment
      SUPABASE_CALL_CHARGE * 2 + // matchApplication: thread lookup + linked-app lookup
      SUPABASE_CALL_CHARGE + // createMessage
      SUPABASE_CALL_CHARGE + // application_activity insert
      SUPABASE_CALL_CHARGE * 3; // up to 3 createSuggestion (verified max against SuggestionBuilder.ts)
    expect(WORST_CASE_SUBREQUESTS_PER_MESSAGE).toBe(enumerated);
  });

  /**
   * Simulates the ENTIRE invocation's tracked subrequest count exactly the
   * way GmailSyncService.ts accrues it: fixed overhead first (in the order
   * it actually happens), then as many worst-case messages as
   * canAffordOneMoreMessage keeps allowing, then the final release. Returns
   * the total BEFORE adding the one call this function can never see
   * (requireUser, in src/server-functions/gmail.ts, before syncUser is ever
   * called).
   */
  function simulateWorstCaseUsed(listingWorstCase: number): {
    used: number;
    messagesStarted: number;
  } {
    const findConnectionForSync = SUPABASE_CALL_CHARGE;
    const claimSyncLock = SUPABASE_CALL_CHARGE;
    const refreshAccessToken = 1; // no retry loop in GoogleOAuthClient.ts — confirmed by reading it, not assumed
    const findExistingGmailIds = SUPABASE_CALL_CHARGE;
    const findPendingSuggestionKeys = SUPABASE_CALL_CHARGE;
    const applicationsHoisted = SUPABASE_CALL_CHARGE;
    const contactsHoisted = SUPABASE_CALL_CHARGE;

    let used =
      findConnectionForSync +
      claimSyncLock +
      refreshAccessToken +
      listingWorstCase +
      findExistingGmailIds +
      findPendingSuggestionKeys +
      applicationsHoisted +
      contactsHoisted;

    let messagesStarted = 0;
    while (canAffordOneMoreMessage(used)) {
      used += WORST_CASE_SUBREQUESTS_PER_MESSAGE;
      messagesStarted += 1;
    }

    used += SUPABASE_CALL_CHARGE; // final releaseGmailSyncLock
    return { used, messagesStarted };
  }

  /** The one real subrequest syncUser's own counter structurally cannot see — requireUser() runs in the caller, before syncUser is invoked at all. */
  const REQUIRE_USER_EXTERNAL_CHARGE = 1;

  it("HISTORY phase: at least one message is still guaranteed to start even if all 5 listing calls hit their full retry ceiling", () => {
    const listingWorstCase = HISTORY_LISTING_SAFETY_CEILING * GMAIL_API_CALL_CHARGE;
    const { messagesStarted } = simulateWorstCaseUsed(listingWorstCase);
    expect(messagesStarted).toBeGreaterThanOrEqual(1);
  });

  it("HISTORY phase grand total (fixed overhead + listing retries + worst-case messages + release + requireUser) stays below Cloudflare's 50-subrequest Free limit", () => {
    const listingWorstCase = HISTORY_LISTING_SAFETY_CEILING * GMAIL_API_CALL_CHARGE;
    const { used } = simulateWorstCaseUsed(listingWorstCase);
    const grandTotal = REQUIRE_USER_EXTERNAL_CHARGE + used;

    expect(grandTotal).toBeLessThan(50);
    // Pinned to the exact number, not just "< 50" — so a future change to
    // any retry ceiling or safety constant shows up as a visible diff here,
    // not a silent margin shrink discovered only in production.
    expect(grandTotal).toBe(42);
  });

  it("BACKFILL phase grand total (single listMessages call, no multi-page listing) stays below the limit with room to spare", () => {
    const listingWorstCase = GMAIL_API_CALL_CHARGE; // one listMessages call
    const { used } = simulateWorstCaseUsed(listingWorstCase);
    const grandTotal = REQUIRE_USER_EXTERNAL_CHARGE + used;

    expect(grandTotal).toBeLessThan(50);
    expect(grandTotal).toBe(30);
  });

  it("`used` itself can never exceed SUBREQUEST_BUDGET at the point the message loop stops, for any fixed overhead up to the modeled worst case", () => {
    // Property check across a range of starting points, not just the two
    // specific phases above — canAffordOneMoreMessage's own guarantee.
    for (let fixedOverhead = 0; fixedOverhead <= 30; fixedOverhead += 1) {
      let used = fixedOverhead;
      while (canAffordOneMoreMessage(used)) {
        used += WORST_CASE_SUBREQUESTS_PER_MESSAGE;
      }
      // used now reflects "after the last message that was allowed to
      // start" — bounded by fixedOverhead's own value when no message could
      // start at all, otherwise by the algebraic bound proven in
      // GmailSyncBudget.ts's own header (used_before<=22, +18<=40).
      if (fixedOverhead > SUBREQUEST_BUDGET - WORST_CASE_SUBREQUESTS_PER_MESSAGE) {
        expect(used).toBe(fixedOverhead); // no message could even start
      } else {
        expect(used).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
      }
    }
  });
});
