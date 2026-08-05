import type { ServerSupabase, AuthedContext } from "@/server/supabase";
import { GmailRepository } from "@/repositories/GmailRepository";
import { parseFromHeader } from "./emailParsing";
import { classify } from "./EmailClassifier";
import { isKnownAtsDomain } from "./RelevanceFilter";
import { extractCompanyName } from "./CompanyExtractor";
import { extractRole, extractRecruiterName } from "./EntityExtractor";
import { matchApplication, type MatchResult } from "./ApplicationMatcher";
import { buildSuggestions } from "./SuggestionBuilder";
import { suggestionDedupeKey } from "./GmailSyncService";

// ── Suggestion rebuild (Module 9A · DEVELOPMENT ONLY) ──
//
// Re-runs the CURRENT classification pipeline over already-stored
// gmail_messages and regenerates gmail_suggestions from scratch. It exists
// because iterating on the classifier is otherwise painful: the only way to
// see new logic applied to real mail was to disconnect, reconnect and
// re-sync, which burns Gmail API quota and destroys the sync checkpoint.
//
// Guarantees, in the order they matter:
//   - gmail_messages is NEVER deleted. Rows are UPDATED in place with the
//     new category/confidence/company_name, because the Inbox reads
//     category off the message row for grouping and view filters — leaving
//     them stale would make the rebuild look like it did nothing.
//   - The Gmail API is NEVER called. Nothing here touches the network.
//   - gmail_connections is untouched: OAuth tokens, history_id, backfill
//     progress and last_synced_at all survive, so the next real sync picks
//     up exactly where it left off.
//
// ⚠️ ACCURACY CAVEAT — this is NOT equivalent to a real sync, and must not
// be presented as one. gmail_messages deliberately stores only Gmail's short
// `snippet`, never the full body (the module's privacy model), and stores no
// attachment metadata or sender display name. So a rebuild classifies from
// subject + snippet alone, which means:
//   - Dates/deadlines usually live in the body → interview and reminder
//     suggestions will often come back without a date.
//   - No attachment data → import_attachment suggestions cannot be
//     regenerated at all.
//   - No display name stored → recruiter names are usually unavailable.
//   - No ICS/meeting-link detection.
// Expect systematically LOWER confidence and FEWER suggestions than a live
// sync of the same mail. Use it to check that classification/summary changes
// behave, not to judge the pipeline's real-world quality.
//
// Stage 2 (AI fallback) is deliberately skipped: a rebuild is a tight
// iteration loop, and firing an AI call per unclassified message would make
// it slow and costly for no benefit to the thing being tested.

export type RebuildOutcome = {
  messagesScanned: number;
  messagesReclassified: number;
  suggestionsDeleted: number;
  suggestionsCreated: number;
  /** Non-fatal problems (e.g. a single row failing its CHECK constraint). */
  warnings: string[];
};

type StoredMessage = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_address: string;
  from_domain: string;
  subject: string | null;
  snippet: string | null;
  company_name: string | null;
  internal_date: string;
};

/**
 * @param authed  The caller's own RLS-scoped context — used for reads that
 *                should stay user-scoped (application matching).
 * @param service Service-role client — required because gmail_suggestions
 *                has no DELETE policy for `authenticated` (see the Module 9A
 *                migration: inserts/deletes are service-role by design).
 *                Every statement below is still explicitly scoped by
 *                user_id, since RLS is not doing it for us here.
 */
export async function rebuildSuggestions(
  authed: AuthedContext,
  service: ServerSupabase,
): Promise<RebuildOutcome> {
  const userId = authed.user.id;
  const warnings: string[] = [];

  // ── 1. Load every stored message for this user ──
  const { data: messageRows, error: readError } = await service
    .from("gmail_messages")
    .select(
      "id, gmail_message_id, gmail_thread_id, from_address, from_domain, subject, snippet, company_name, internal_date",
    )
    .eq("user_id", userId)
    .order("internal_date", { ascending: true });
  if (readError) throw readError;
  const messages = (messageRows ?? []) as StoredMessage[];

  // ── 2. Drop existing suggestions for this user only ──
  //
  // NOTE: applications/interviews/reminders/attachments carry a
  // `source_gmail_suggestion_id` FK with ON DELETE SET NULL, so records the
  // user already accepted SURVIVE — they simply lose the provenance link
  // back to the suggestion that produced them. Nothing the user created is
  // deleted here.
  const { data: deletedRows, error: deleteError } = await service
    .from("gmail_suggestions")
    .delete()
    .eq("user_id", userId)
    .select("id");
  if (deleteError) throw deleteError;
  const suggestionsDeleted = (deletedRows ?? []).length;

  // ── 3. Re-run the pipeline per message ──
  const gmailRepo = new GmailRepository(service);
  const pendingKeys = new Set<string>();
  let messagesReclassified = 0;
  let suggestionsCreated = 0;

  for (const message of messages) {
    const from = parseFromHeader(message.from_address);
    const subject = message.subject ?? "";
    // Snippet stands in for the body — see the accuracy caveat above.
    const bodyText = message.snippet ?? "";

    const classification = classify({
      from,
      subject,
      bodyText,
      hasIcsAttachment: false,
    });

    const companyName = extractCompanyName(from, subject, bodyText);
    const role = extractRole(subject, bodyText);
    const recruiterName = extractRecruiterName(from, bodyText);

    // Persist the refreshed classification onto the message row. A failure
    // here is almost always the category CHECK constraint rejecting a value
    // from a migration that hasn't been applied yet — surface that clearly
    // rather than aborting the whole rebuild.
    const { error: updateError } = await service
      .from("gmail_messages")
      .update({
        category: classification.category,
        confidence: classification.confidence,
        company_name: companyName,
        classified_by: "rule",
      })
      .eq("id", message.id)
      .eq("user_id", userId);
    if (updateError) {
      warnings.push(
        `Could not save classification "${classification.category}" for "${subject || message.gmail_message_id}": ${updateError.message}`,
      );
      continue;
    }
    messagesReclassified += 1;

    if (classification.category === "unknown") continue;

    let match: MatchResult = { kind: "none" };
    try {
      match = await matchApplication(authed.supabase, userId, {
        fromAddress: from.address,
        companyName,
        gmailThreadId: message.gmail_thread_id,
        subject,
      });
    } catch (err) {
      warnings.push(
        `Matching failed for "${subject || message.gmail_message_id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const drafts = buildSuggestions({
      classification,
      match,
      companyName,
      role,
      recruiterName,
      receivedAtIso: message.internal_date,
      subject: message.subject,
      // Attachment metadata isn't stored, so import_attachment suggestions
      // genuinely cannot be rebuilt — see the caveat above.
      attachments: [],
      onKnownAtsDomain: isKnownAtsDomain(from.domain),
    });

    for (const draft of drafts) {
      const key = suggestionDedupeKey(draft.type, draft.targetApplicationId, draft.payload);
      if (pendingKeys.has(key)) continue;
      try {
        await gmailRepo.createSuggestion({
          user_id: userId,
          gmail_message_id: message.id,
          type: draft.type,
          confidence: draft.confidence,
          explanation: draft.explanation,
          target_application_id: draft.targetApplicationId,
          suggested_payload: draft.payload,
        });
        pendingKeys.add(key);
        suggestionsCreated += 1;
      } catch (err) {
        warnings.push(
          `Could not create a ${draft.type} suggestion for "${subject || message.gmail_message_id}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return {
    messagesScanned: messages.length,
    messagesReclassified,
    suggestionsDeleted,
    suggestionsCreated,
    warnings,
  };
}
