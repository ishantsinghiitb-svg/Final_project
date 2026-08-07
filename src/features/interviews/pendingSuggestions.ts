import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

// ── Calendar suggestion routing (Module 9 UX pass) ──
//
// A pending calendar-sourced suggestion has exactly one of two homes on the
// Interviews page: if its payload names a specific `existingInterviewId`
// (a reschedule/link-change conflict on an already-tracked interview — see
// CalendarSuggestionBuilder.buildCalendarInterviewUpdateDraft), it belongs
// attached to THAT interview's own card, not in a generic queue. Everything
// else (a brand-new interview/application candidate, or a weak
// possibleDuplicateOfInterviewId match) has no specific interview to attach
// to yet, so it goes in the standalone panel instead.

function payloadExistingInterviewId(item: SuggestionListItem): string | null {
  const payload = item.suggested_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).existingInterviewId;
  return typeof value === "string" ? value : null;
}

export function splitCalendarSuggestions(suggestions: SuggestionListItem[]): {
  /** Keyed by the interview it targets — at most one pending suggestion per interview by construction (see CalendarSyncService's "already pending" dedupe guard). */
  attachedByInterviewId: Map<string, SuggestionListItem>;
  unattached: SuggestionListItem[];
} {
  const attachedByInterviewId = new Map<string, SuggestionListItem>();
  const unattached: SuggestionListItem[] = [];

  for (const item of suggestions) {
    const interviewId = payloadExistingInterviewId(item);
    if (interviewId) attachedByInterviewId.set(interviewId, item);
    else unattached.push(item);
  }

  return { attachedByInterviewId, unattached };
}
