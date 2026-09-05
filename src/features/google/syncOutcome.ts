// ── Sync outcome messaging (Module 9) ──
//
// A single place to turn a sync mutation's result into user-facing copy —
// used by GoogleConnectionCard, the unified sync trigger, and anywhere else
// a "Sync Now" click needs a toast. Deliberately structural rather than
// importing SyncOutcome/CalendarSyncOutcome from src/server/** (those types
// are only ever surfaced to the client via createServerFn's inferred return
// type, never a direct import — this shape matches both without depending
// on either).
//
// The whole point: `suggestionsCreated === 0` is NOT one outcome, it's at
// least three different ones ("nothing came back from Google", "things came
// back but weren't relevant", "things were relevant/updated but nothing new
// to review") — collapsing them into one "nothing new" message is exactly
// what made a real sync bug look like silence instead of a bug.
type SyncResultLike =
  | {
      status: "synced";
      suggestionsCreated: number;
      /** Gmail's counter — total messages processed this run. */
      processed?: number;
      /** Calendar's counters — events returned by Google, and how many were relevant enough to store. */
      eventsProcessed?: number;
      relevantEventsStored?: number;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

export function syncOutcomeMessage(result: SyncResultLike): string {
  if (result.status !== "synced") return "Sync didn't run.";

  if (result.suggestionsCreated > 0) {
    return `Synced — ${result.suggestionsCreated} new update${result.suggestionsCreated === 1 ? "" : "s"} to review.`;
  }

  // Calendar's richer three-counter shape.
  if (result.eventsProcessed !== undefined) {
    if (result.eventsProcessed === 0) return "Synced — no new calendar events found.";
    if (result.relevantEventsStored === 0) {
      return `Synced ${result.eventsProcessed} event${result.eventsProcessed === 1 ? "" : "s"} — none looked like interviews.`;
    }
    return "Synced — already up to date.";
  }

  // Gmail's simpler two-counter shape.
  if (result.processed !== undefined) {
    if (result.processed === 0) return "Synced — no new email found.";
    return `Synced ${result.processed} email${result.processed === 1 ? "" : "s"} — nothing new to review.`;
  }

  return "Sync complete — nothing new.";
}

export type CombinedSyncToast = { tone: "success" | "error"; message: string };

/**
 * useSyncGoogleNow always runs whichever product(s) are connected together —
 * this turns the pair of results into ONE toast, the same way every sync
 * button in the app should read. Precedence, worst outcome first:
 *
 *   1. any hard error          → error, that product's own message
 *   2. any needs_reauth        → error, reconnect prompt
 *   3. any other skip          → error, why it didn't run
 *   4. new suggestions         → success, combined count across both
 *   5. everything ran, nothing new → success, richer of the two explanations
 *
 * THE INVARIANT: if either connected product did not actually sync, the
 * result is never `tone: "success"`. Steps 1-3 all have to precede the
 * success paths for that to hold — one product's clean run must never be
 * able to speak for the other's failure.
 */
export function combinedSyncOutcomeMessage(
  gmailResult: SyncResultLike | null,
  calendarResult: SyncResultLike | null,
): CombinedSyncToast {
  const results = [gmailResult, calendarResult].filter((r): r is SyncResultLike => r !== null);

  const errored = results.find((r) => r.status === "error");
  if (errored && errored.status === "error") {
    return { tone: "error", message: errored.message };
  }

  const needsReauth = results.some((r) => r.status === "skipped" && r.reason === "needs_reauth");
  if (needsReauth) {
    return {
      tone: "error",
      message: "Access was revoked for one of your Google connections — please reconnect.",
    };
  }

  // A product that did not run is NOT a success, even when the other one
  // synced cleanly. This branch has to sit ahead of the success paths below:
  // without it, a healthy Calendar's counters were enough to produce a green
  // "Synced — …" toast while Gmail had been skipped, which is exactly how a
  // sync stuck on `already_syncing` stayed invisible. `needs_reauth` is
  // deliberately handled above and never reaches here.
  const skipped = results.find((r) => r.status === "skipped");
  if (skipped && skipped.status === "skipped") {
    return {
      tone: "error",
      message:
        skipped.reason === "already_syncing"
          ? "A sync was already running, so this one was skipped. Try again in a few minutes."
          : "One of your Google connections didn't sync. Please try again.",
    };
  }

  const newCount = results.reduce(
    (sum, r) => sum + (r.status === "synced" ? r.suggestionsCreated : 0),
    0,
  );
  if (newCount > 0) {
    return {
      tone: "success",
      message: `Synced — ${newCount} new update${newCount === 1 ? "" : "s"} to review.`,
    };
  }

  // Neither produced a new suggestion — fall back to whichever synced
  // result has the richer explanation (Calendar's 3-counter shape is more
  // informative than Gmail's when both ran and both came up empty).
  //
  // "Nothing ran at all" keeps an error tone: a success-styled toast reading
  // "Sync didn't run." told the user two opposite things at once.
  const synced = results.find((r) => r.status === "synced");
  return synced
    ? { tone: "success", message: syncOutcomeMessage(synced) }
    : { tone: "error", message: "Sync didn't run." };
}
