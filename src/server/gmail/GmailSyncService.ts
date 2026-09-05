import type { AuthedContext } from "@/server/supabase";
import { serverEnv, requireEnv } from "@/server/env";
import { GmailRepository } from "@/repositories/GmailRepository";
import {
  GoogleConnectionRepository,
  isSyncLockStale,
} from "@/repositories/GoogleConnectionRepository";
import { SuggestionRepository } from "@/repositories/SuggestionRepository";
import { refreshAccessToken, GoogleOAuthError } from "./GoogleOAuthClient";
import { decryptToken } from "./TokenCrypto";
import * as gmailApi from "./GmailApiClient";
import { parseFromHeader } from "./emailParsing";
import { buildSyncQuery, isRelevant, isKnownAtsDomain } from "./RelevanceFilter";
import { classify, type ClassificationResult } from "./EmailClassifier";
import { classifyWithAI } from "./EmailClassifierAI";
import { extractCompanyName } from "./CompanyExtractor";
import { extractRole, extractRecruiterName } from "./EntityExtractor";
import {
  matchApplication,
  type MatchResult,
  type ApplicationCandidate,
  type ContactRow,
} from "./ApplicationMatcher";
import { buildSuggestions, INTERVIEW_CATEGORIES } from "./SuggestionBuilder";
import { parseIcs } from "./IcsParser";
import {
  canAffordOneMoreMessage,
  resolveBackfillCheckpoint,
  resolveHistoryCheckpoint,
  accumulateHistoryCandidates,
  HISTORY_LISTING_SAFETY_CEILING,
  GMAIL_API_CALL_CHARGE,
  AI_CLASSIFY_CALL_CHARGE,
  SUPABASE_CALL_CHARGE,
} from "./GmailSyncBudget";

// ── Sync orchestrator (Module 9A) ──
//
// Always runs inside an authenticated request — triggered on connect,
// dashboard/app open, or manual "Sync Now" (see src/server-functions/gmail.ts)
// — never a detached background job. That's a deliberate V1 simplification
// (see the plan's Sync Triggers section): no platform-specific background
// execution mechanism, just three simple triggers sharing this one code path.
//
// Per-message pipeline: dedup precheck -> cheap metadata fetch -> Stage 0
// relevance gate (nothing irrelevant is ever fetched in full or persisted)
// -> full fetch -> Stage 1 deterministic classification -> Stage 2 AI
// fallback ONLY when Stage 1 is unconfident -> application matching ->
// persist message (always, for audit/dedup) -> persist suggestions (only for
// a confidently classified message) -> timeline entry (only when matched).
//
// Correctness-over-automation guards, all deliberately minimal (single SQL
// statements, not orchestration infrastructure):
//   - claimSyncLock: atomic conditional UPDATE prevents two triggers (e.g.
//     two open tabs) from racing into a double-sync.
//   - Bounded batch (BATCH_SIZE messages/run): keeps each run fast, spreads
//     Gmail API calls to avoid rate-limit bursts, and keeps the unit of work
//     small enough that a crash mid-run loses at most one page's progress.
//   - The backfill/history_id checkpoint only ever advances in
//     releaseSyncLock, AFTER every message and suggestion in this page has
//     been durably persisted — never optimistically ahead of committed data.
//     See GmailSyncBudget.ts's resolveBackfillCheckpoint/
//     resolveHistoryCheckpoint — the checkpoint stays at its OLD value
//     whenever the subrequest budget cut this run short, so a partial page
//     is safely re-attempted next time rather than silently dropped.
//   - Explicit subrequest budget (see GmailSyncBudget.ts): Cloudflare
//     Workers Free caps one invocation at 50 subrequests total, counting
//     every Supabase AND Gmail/OAuth call. BATCH_SIZE=50 combined with a
//     per-candidate dedup query used to exhaust that budget before a single
//     new message was ever fetched — observed live as a sync permanently
//     stuck "syncing" with zero rows written anywhere, invocation after
//     invocation, on the identical first page. BATCH_SIZE=8 plus batching
//     the dedup check into one query keeps a typical run comfortably under
//     budget while a live counter still guards the pathological case.

const BATCH_SIZE = 8;
// Fixed internal cadence, not a user-facing control (per the plan's trimmed
// Settings surface) — just the throttle the app-open trigger checks before
// firing a sync at all; "Sync Now" always bypasses it.
export const MIN_SYNC_INTERVAL_MINUTES = 30;

export type SyncOutcome =
  | { status: "synced"; processed: number; suggestionsCreated: number }
  | { status: "skipped"; reason: "not_connected" | "already_syncing" | "needs_reauth" }
  | { status: "error"; message: string };

/**
 * Identity of the ACTION a suggestion proposes, independent of which email
 * happened to trigger it.
 *
 * For anything targeting an existing application, the action is fully
 * identified by (type, application) — a second "move this to Offer" adds
 * nothing. For create_application there is no application yet, so identity
 * falls back to the company+role the suggestion would create, which is
 * exactly the pair that would produce a duplicate record.
 */
export function suggestionDedupeKey(
  type: string,
  targetApplicationId: string | null,
  payload: unknown,
): string {
  if (targetApplicationId) return `${type}:app:${targetApplicationId}`;

  const source =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const norm = (value: unknown) =>
    typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";
  return `${type}:new:${norm(source.companyName)}|${norm(source.role)}`;
}

function categoryLabel(category: ClassificationResult["category"]): string {
  return category
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function syncUser(authed: AuthedContext): Promise<SyncOutcome> {
  const userId = authed.user.id;
  const gmailRepo = new GmailRepository(authed.supabase);
  const connectionRepo = new GoogleConnectionRepository(authed.supabase);
  const suggestionRepo = new SuggestionRepository(authed.supabase);

  // ── Subrequest budget (see GmailSyncBudget.ts) — every Supabase and
  // Gmail/OAuth call this invocation makes is tracked here, starting from
  // the very first one. An earlier version of this counter started only
  // after the token refresh succeeded, silently leaving
  // findConnectionForSync/claimSyncLock/refreshAccessToken's 3 real
  // subrequests OUT of the tracked total — harmless for THIS function's own
  // ceiling (those 3 always happen, so they were still accounted for
  // separately in GmailSyncBudget.ts's grand-total arithmetic), but a trap
  // for anyone reading `used`'s final value expecting it to be the complete
  // picture. Tracking from the start makes `used`'s value self-sufficient —
  // no separate list of "don't forget these" calls to keep in sync by hand.
  let used = 0;

  const connection = await connectionRepo.findConnectionForSync(userId);
  used += SUPABASE_CALL_CHARGE;
  if (!connection || connection.gmail_status === "disconnected") {
    return { status: "skipped", reason: "not_connected" };
  }
  if (connection.gmail_status === "needs_reauth") {
    return { status: "skipped", reason: "needs_reauth" };
  }

  const claimed = await connectionRepo.claimSyncLock(userId, "gmail");
  used += SUPABASE_CALL_CHARGE;
  if (!claimed) return { status: "skipped", reason: "already_syncing" };

  try {
    const encryptionKey = requireEnv(
      "GOOGLE_TOKEN_ENCRYPTION_KEY",
      serverEnv.googleTokenEncryptionKey,
    );

    let accessToken: string;
    try {
      const refreshToken = await decryptToken(
        { ciphertext: connection.refresh_token_ciphertext, nonce: connection.refresh_token_nonce },
        encryptionKey,
      );
      // Charged before the call, like every other retryable call in this
      // file — refreshAccessToken has no internal retry loop (confirmed:
      // GoogleOAuthClient.ts wraps it in fetchWithTimeout only, no loop), so
      // this is a real single-attempt charge, not a worst-case reservation.
      used += 1;
      accessToken = (await refreshAccessToken(refreshToken)).accessToken;
    } catch (err) {
      if (err instanceof GoogleOAuthError && err.code === "invalid_grant") {
        await connectionRepo.releaseGmailSyncLock(userId, {
          status: "needs_reauth",
          last_sync_error: "Gmail access was revoked. Please reconnect.",
        });
        return { status: "skipped", reason: "needs_reauth" };
      }
      const message = err instanceof Error ? err.message : "Failed to refresh Gmail access.";
      await connectionRepo.releaseGmailSyncLock(userId, {
        status: "error",
        last_sync_error: message,
      });
      return { status: "error", message };
    }

    // ── This run's candidate message ids, bounded to BATCH_SIZE ──
    let candidateIds: string[];
    let syncPhase: "backfill" | "history" | "restart_backfill";
    const startingBackfillPageToken = connection.gmail_backfill_page_token;
    let gmailNextPageToken: string | null = null;
    let historyExhausted = false;
    let latestHistoryId: string | undefined;

    if (!connection.gmail_backfill_complete) {
      syncPhase = "backfill";
      // maxResults IS the batch size now — Gmail's own nextPageToken is the
      // resume cursor, persisted as-is (see resolveBackfillCheckpoint below)
      // rather than a client-side slice of a larger fetch.
      const page = await gmailApi.listMessages(accessToken, buildSyncQuery(), {
        pageToken: startingBackfillPageToken ?? undefined,
        maxResults: BATCH_SIZE,
      });
      used += GMAIL_API_CALL_CHARGE; // goes through gmailFetch's own retry loop
      candidateIds = page.messages.map((m) => m.id);
      gmailNextPageToken = page.nextPageToken;
    } else if (connection.gmail_history_id) {
      syncPhase = "history";
      const startHistoryId = connection.gmail_history_id;
      // Traverses as many history.list pages as needed (bounded by
      // HISTORY_LISTING_SAFETY_CEILING) to collect EVERY candidate id up to
      // Gmail's true end of history — uncapped here on purpose (see
      // accumulateHistoryCandidates's header: an earlier version capped
      // collection at BATCH_SIZE directly, which could permanently stall on
      // a page boundary that always truncates the same tail ids on every
      // retry, since collection always restarts from the same
      // startHistoryId). The BATCH_SIZE cap is applied below, AFTER
      // deduplication, so which ids get deferred to next time shifts as
      // earlier ones get persisted, instead of being stuck on the same ones
      // forever.
      const accumulation = await accumulateHistoryCandidates((pageToken) => {
        used += GMAIL_API_CALL_CHARGE; // each listHistory call also goes through gmailFetch's retry loop
        return gmailApi.listHistory(accessToken, startHistoryId, pageToken);
      }, HISTORY_LISTING_SAFETY_CEILING);
      candidateIds = accumulation.candidateIds;
      historyExhausted = accumulation.historyExhausted;
      latestHistoryId = accumulation.latestHistoryId;
    } else {
      // Shouldn't happen (backfill_complete implies history_id was set at
      // connect time) — degrade to restarting backfill rather than throw.
      syncPhase = "restart_backfill";
      candidateIds = [];
    }

    let processed = 0;
    let suggestionsCreated = 0;

    // ── Batched dedup — ONE query for the whole page instead of one
    // findMessageByGmailId call per candidate. This is the actual fix for
    // the subrequest exhaustion: with the old BATCH_SIZE=50 and a
    // per-candidate query, dedup alone could consume the entire Free-plan
    // 50-subrequest budget before a single new message was ever fetched.
    const existingIds = await gmailRepo.findExistingGmailIds(userId, candidateIds);
    used += SUPABASE_CALL_CHARGE;
    const newCandidateIdsAfterDedup = candidateIds.filter((id) => !existingIds.has(id));

    // The history path can hand back more genuinely-new ids than one
    // invocation should process (accumulateHistoryCandidates no longer caps
    // this itself — see its header) — bound actual work to BATCH_SIZE here.
    // The backfill path never needs this slice in practice (Gmail's own
    // maxResults already bounds `candidateIds` there), but the same line
    // covers it too rather than branching on syncPhase for no benefit.
    const newCandidateIds = newCandidateIdsAfterDedup.slice(0, BATCH_SIZE);

    // False from the start whenever the slice above already deferred
    // something — the checkpoint must not advance past ids that were never
    // even attempted, not only ones cut off mid-loop by the subrequest
    // budget (see the loop below, which can also flip this to false).
    let allProcessed = newCandidateIdsAfterDedup.length <= BATCH_SIZE;

    // ── Duplicate-suggestion guard ──
    //
    // UNIQUE(user_id, gmail_message_id) guarantees each EMAIL is processed
    // once, but not that each ACTION is proposed once: an ATS confirmation
    // and the recruiter's own follow-up are two different emails that can
    // each independently justify "create an application at Groww". Seeding
    // this set from the existing pending rows — and adding to it as we go —
    // means the second one is suppressed, within a run and across runs. Also
    // seeded across sources now: a Calendar-sourced pending suggestion for
    // the same action suppresses a Gmail one just as readily (Module 9B).
    const pendingKeys = new Set<string>();
    for (const row of await suggestionRepo.findPendingSuggestionKeys(userId)) {
      pendingKeys.add(
        suggestionDedupeKey(row.type, row.target_application_id, row.suggested_payload),
      );
    }
    used += SUPABASE_CALL_CHARGE;

    // ── Per-user rows hoisted out of the per-message loop ──
    //
    // matchApplication's Signals 2/3/4 (contact email/domain, company name)
    // read the SAME two tables regardless of which message is being
    // matched — the old code re-fetched both on every single loop
    // iteration. Fetching once here and passing the rows into
    // matchApplication's `prefetched` parameter is the other half of the
    // subrequest fix, alongside the batched dedup above.
    const { data: applicationRows, error: applicationsError } = await authed.supabase
      .from("applications")
      .select("id, company_name, role")
      .eq("user_id", userId)
      .eq("archived", false);
    if (applicationsError) throw applicationsError;
    used += SUPABASE_CALL_CHARGE;
    const { data: contactRows, error: contactsError } = await authed.supabase
      .from("application_contacts")
      .select("application_id, email")
      .eq("user_id", userId);
    if (contactsError) throw contactsError;
    used += SUPABASE_CALL_CHARGE;
    const prefetchedMatchData = {
      applications: (applicationRows ?? []) as ApplicationCandidate[],
      contacts: (contactRows ?? []) as ContactRow[],
    };

    for (const gmailMessageId of newCandidateIds) {
      // Reserved BEFORE starting this message, not charged after — a
      // message already in flight always finishes; nothing here is ever
      // interrupted mid-write. Stopping here is normal partial progress,
      // not an error: the checkpoint below simply doesn't advance, so this
      // exact page/history-window is safely retried next invocation.
      if (!canAffordOneMoreMessage(used)) {
        allProcessed = false;
        break;
      }

      used += GMAIL_API_CALL_CHARGE; // getMessageMetadata — goes through gmailFetch's retry loop
      const metadata = await gmailApi.getMessageMetadata(accessToken, gmailMessageId);
      const from = parseFromHeader(metadata.headers.from ?? "");
      const subject = metadata.headers.subject ?? "";

      // Stage 0 — never fetched in full or persisted past this point.
      // `googleEmail` lets the filter drop the user's OWN outgoing mail: an
      // application email you sent that nobody has replied to isn't a
      // recruiter update and must never become a suggestion (it still shows
      // up later on the application timeline, which is the right home for
      // it). Without this, "I applied" mail comes back as a create_application
      // suggestion for an application the user already knows about.
      if (!isRelevant(from, subject, { googleEmail: connection.google_email })) continue;

      used += GMAIL_API_CALL_CHARGE; // getFullMessage — goes through gmailFetch's retry loop
      const full = await gmailApi.getFullMessage(accessToken, gmailMessageId);
      const hasIcsAttachment = full.attachments.some(
        (a) => a.filename.toLowerCase().endsWith(".ics") || a.mimeType === "text/calendar",
      );
      const bodyText = full.bodyText || full.snippet;

      // Stage 1 — deterministic.
      let classification = classify({ from, subject, bodyText, hasIcsAttachment });
      let classifiedBy: "rule" | "ai" = "rule";

      // Stage 2 — AI fallback, ONLY when Stage 1 wasn't confident. Never
      // consumes user AI credits (see EmailClassifierAI's own header).
      if (classification.category === "unknown") {
        used += AI_CLASSIFY_CALL_CHARGE; // classifyWithAI — has its own internal retry loop
        const aiResult = await classifyWithAI(authed, {
          fromDomain: from.domain,
          fromDisplayName: from.displayName,
          subject,
          snippet: full.snippet,
          hasMeetingLink: Boolean(classification.extracted.meetingLink),
          hasIcsAttachment,
        });
        if (aiResult && aiResult.category !== "unknown") {
          classification = {
            category: aiResult.category,
            confidence: aiResult.confidence,
            extracted: classification.extracted,
          };
          classifiedBy = "ai";
        }
      }

      // .ics UID capture (Module 9B) — fetched only for interview-category
      // messages that actually carry an .ics attachment, never for every
      // message: this is the strongest merge key against a calendar event
      // (the same UID appears in both), so it's worth one extra API call
      // exactly where it pays off, and nowhere else. A fetch/parse failure
      // here must never abort the message's own processing — the .ics UID
      // is a bonus signal, not a required one.
      let icalUid: string | null = null;
      if (hasIcsAttachment && INTERVIEW_CATEGORIES.has(classification.category)) {
        const icsAttachment = full.attachments.find(
          (a) => a.filename.toLowerCase().endsWith(".ics") || a.mimeType === "text/calendar",
        );
        if (icsAttachment) {
          used += GMAIL_API_CALL_CHARGE; // getAttachment — counted before the try so a failed attempt is still charged (the subrequest was still made either way)
          try {
            const bytes = await gmailApi.getAttachment(
              accessToken,
              gmailMessageId,
              icsAttachment.attachmentId,
            );
            const icsText = new TextDecoder().decode(bytes.data);
            icalUid = parseIcs(icsText).uid;
          } catch {
            // Best-effort — a fetch failure here just means no UID for this
            // message, not a sync failure.
          }
        }
      }

      // Entity extraction runs on the full body, not just the subject — the
      // employer's real brand and the job title both routinely appear only
      // in the copy (especially on ATS-sent mail, where the sender domain is
      // the vendor's).
      const companyName = extractCompanyName(from, subject, bodyText);
      const role = extractRole(subject, bodyText);
      const recruiterName = extractRecruiterName(from, bodyText);

      let match: MatchResult = { kind: "none" };
      let matchedApplicationId: string | null = null;
      if (classification.category !== "unknown") {
        // matchApplication's own worst case: thread lookup (always, gmailThreadId
        // is never empty for a Gmail message) + linked-app lookup (conditional on
        // a thread hit) — both plain Supabase queries, never retried. Contacts/
        // applications are prefetched, never queried per-message.
        used += SUPABASE_CALL_CHARGE * 2;
        match = await matchApplication(
          authed.supabase,
          userId,
          {
            fromAddress: from.address,
            companyName,
            gmailThreadId: metadata.threadId,
            subject,
          },
          prefetchedMatchData,
        );
        if (match.kind === "single") matchedApplicationId = match.applicationId;
      }

      used += SUPABASE_CALL_CHARGE; // createMessage
      const messageRow = await gmailRepo.createMessage({
        user_id: userId,
        gmail_message_id: metadata.id,
        gmail_thread_id: metadata.threadId,
        from_address: from.address,
        from_domain: from.domain,
        subject: subject || null,
        snippet: metadata.snippet || null,
        company_name: companyName,
        internal_date: new Date(Number(metadata.internalDate)).toISOString(),
        category: classification.category,
        confidence: classification.confidence,
        classified_by: classifiedBy,
        matched_application_id: matchedApplicationId,
        ical_uid: icalUid,
        // Read state at the moment we first saw it. A snapshot, not a live
        // mirror — see migration 20260810000001. Purely a view filter: the
        // message is fetched, classified and stored identically either way.
        is_unread: metadata.labelIds.includes("UNREAD"),
      });
      processed += 1;

      // Passive timeline record — independent of whether any suggestion
      // below is later accepted or dismissed; an email that arrived is a
      // real fact (see src/types/index.ts's ApplicationTimelineEventType).
      if (matchedApplicationId) {
        used += SUPABASE_CALL_CHARGE; // application_activity insert
        const { error: timelineError } = await authed.supabase.from("application_activity").insert({
          application_id: matchedApplicationId,
          user_id: userId,
          kind: "email_received",
          text: `Email received: ${categoryLabel(classification.category)}`,
          previous_value: null,
          new_value: null,
          metadata: {
            gmail_message_id: messageRow.gmail_message_id,
            category: classification.category,
            confidence: classification.confidence,
          },
        });
        if (timelineError) throw timelineError;
      }

      if (classification.category !== "unknown") {
        const drafts = buildSuggestions({
          classification,
          match,
          companyName,
          role,
          recruiterName,
          receivedAtIso: new Date(Number(metadata.internalDate)).toISOString(),
          subject: subject || null,
          attachments: full.attachments,
          onKnownAtsDomain: isKnownAtsDomain(from.domain),
        });
        for (const draft of drafts) {
          const key = suggestionDedupeKey(draft.type, draft.targetApplicationId, draft.payload);
          if (pendingKeys.has(key)) continue;

          used += SUPABASE_CALL_CHARGE; // createSuggestion
          await suggestionRepo.createSuggestion({
            user_id: userId,
            gmail_message_id: messageRow.id,
            type: draft.type,
            confidence: draft.confidence,
            explanation: draft.explanation,
            target_application_id: draft.targetApplicationId,
            suggested_payload: draft.payload,
          });
          pendingKeys.add(key);
          suggestionsCreated += 1;
        }
      }
    }

    // ── Checkpoint — only advances now that everything above is committed,
    // AND only for the phase that actually ran this invocation. A budget-
    // interrupted run (allProcessed === false) always resolves to "leave
    // the checkpoint where it was" — see GmailSyncBudget.ts. ──
    const nextSyncAt = new Date(Date.now() + MIN_SYNC_INTERVAL_MINUTES * 60_000).toISOString();

    let finalBackfillComplete = connection.gmail_backfill_complete;
    let finalPageToken = connection.gmail_backfill_page_token;
    let finalHistoryId: string | undefined;

    if (syncPhase === "backfill") {
      const checkpoint = resolveBackfillCheckpoint({
        allProcessed,
        startingPageToken: startingBackfillPageToken,
        gmailNextPageToken,
      });
      finalBackfillComplete = checkpoint.backfillComplete;
      finalPageToken = checkpoint.pageTokenToPersist;
    } else if (syncPhase === "history") {
      finalHistoryId = resolveHistoryCheckpoint({
        allProcessed,
        historyExhausted,
        latestHistoryId,
      });
    } else {
      // restart_backfill — see the defensive branch above.
      finalBackfillComplete = false;
    }

    used += SUPABASE_CALL_CHARGE; // final releaseGmailSyncLock
    await connectionRepo.releaseGmailSyncLock(userId, {
      status: "connected",
      backfill_complete: finalBackfillComplete,
      backfill_page_token: finalBackfillComplete ? null : finalPageToken,
      ...(finalHistoryId ? { history_id: finalHistoryId } : {}),
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      next_sync_at: nextSyncAt,
    });

    return { status: "synced", processed, suggestionsCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await connectionRepo.releaseGmailSyncLock(userId, {
      status: "error",
      last_sync_error: message,
    });
    return { status: "error", message };
  }
}

/**
 * Whether an opportunistic (app-open) sync should fire right now — "Sync Now"
 * bypasses this entirely.
 *
 * A `syncing` status only blocks while the lock backing it is still fresh.
 * Once that lock is stale the run holding it is presumed dead, and this has to
 * agree with `claimSyncLock` (which will reclaim it): a bare
 * `status === "syncing" → false` here would mean a connection stranded by a
 * hard-terminated run never auto-recovers, and only comes back if the user
 * happens to press Sync Now. `claimSyncLock` remains the atomic authority —
 * this only decides whether an attempt is worth making.
 */
export function isSyncDue(connection: {
  gmail_auto_sync_enabled: boolean;
  gmail_next_sync_at: string | null;
  gmail_status: string;
  gmail_sync_lock_acquired_at: string | null;
}): boolean {
  if (!connection.gmail_auto_sync_enabled) return false;
  if (connection.gmail_status === "disconnected" || connection.gmail_status === "needs_reauth")
    return false;
  if (
    connection.gmail_status === "syncing" &&
    !isSyncLockStale(connection.gmail_sync_lock_acquired_at)
  )
    return false;
  if (!connection.gmail_next_sync_at) return true;
  return new Date(connection.gmail_next_sync_at).getTime() <= Date.now();
}
