import { useState } from "react";
import { CalendarSearch, ChevronDown, ChevronUp } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { SuggestionCard } from "@/components/dashboard/gmail/SuggestionCard";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

// ── PendingCalendarSuggestions (Module 9 UX pass) ──
//
// Calendar-sourced suggestions live on the Interviews page now, not the
// Inbox — this panel covers the "brand new" ones (no existingInterviewId in
// the payload): a new interview candidate for a tracked application, a
// possible-duplicate of one you already have, or a new company/application
// entirely. A suggestion that already targets a SPECIFIC known interview
// (a reschedule/link-change conflict) is rendered inline on that interview's
// own card instead — see InterviewCard's pendingSuggestion prop — so it
// reads as "this interview has an update," not a separate queue item.
//
// Reuses SuggestionCard as-is (same accept/dismiss/review affordances the
// Inbox already has) — no new review UI, just a new place it's shown.

type Props = {
  suggestions: SuggestionListItem[];
  busyId: string | null;
  onReview: (item: SuggestionListItem) => void;
  onDismiss: (id: string) => void;
};

export function PendingCalendarSuggestions({ suggestions, busyId, onReview, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (suggestions.length === 0) return null;

  return (
    <DashCard padded={false}>
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <CalendarSearch className="h-4 w-4 shrink-0 text-[#2563EB]" />
        <p className="flex-1 text-sm font-medium text-[oklch(0.2_0.02_265)]">
          {suggestions.length} calendar event{suggestions.length === 1 ? "" : "s"} look
          {suggestions.length === 1 ? "s" : ""} like interview
          {suggestions.length === 1 ? "" : "s"}
        </p>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-black/5">
          {suggestions.map((item) => (
            <SuggestionCard
              key={item.id}
              suggestion={item}
              googleEmail={null}
              selected={false}
              onToggleSelect={() => {}}
              onReview={() => onReview(item)}
              onDismiss={() => onDismiss(item.id)}
              busy={busyId === item.id}
              selectable={false}
            />
          ))}
        </div>
      )}
    </DashCard>
  );
}
