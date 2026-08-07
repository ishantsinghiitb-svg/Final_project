import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarSearch, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePendingCalendarSuggestions, useResolveSuggestion } from "@/features/gmail/hooks";
import { useAllInterviews, useUpdateInterview } from "@/features/interviews/hooks";
import { buildKeepInterviewPatch } from "@/features/interviews/constants";
import { readSuggestionSummary } from "@/features/gmail/summary";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";
import type { Interview } from "@/types";

// ── NotificationBell (Module 9 UX pass) ──
//
// Replaces the old static-mock dropdown. Every item here is derived, in real
// time, from data that already exists elsewhere — no new table, no separate
// "notifications" write path:
//   - a pending calendar-sourced suggestion (invite detected / time changed /
//     link changed) → dismissing it here IS resolving the suggestion, the
//     exact same mutation the Interviews page's panel uses. It disappears
//     from both places at once.
//   - a scheduled, calendar-linked interview whose event was cancelled in
//     Google (is_calendar_event_stale) → "Keep" unlinks it from the gone
//     event (see buildKeepInterviewPatch), which clears the flag and removes
//     the notification the same way.
// There's no "read" state to track — an item's only two states are
// "still needs your attention" (visible) and "acted on" (gone), so there's
// no "Mark all read" button either.

type NotificationItem =
  | { kind: "suggestion"; id: string; title: string; body: string; suggestion: SuggestionListItem }
  | { kind: "cancelled"; id: string; title: string; body: string; interview: Interview };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: calendarSuggestions = [] } = usePendingCalendarSuggestions();
  const { data: interviews = [] } = useAllInterviews();
  const resolveSuggestion = useResolveSuggestion();
  const updateInterview = useUpdateInterview();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const suggestionItems: NotificationItem[] = calendarSuggestions.map((s) => {
    const summary = readSuggestionSummary(s);
    return {
      kind: "suggestion",
      id: s.id,
      title: summary?.headline ?? "A calendar event looks like an interview",
      body: summary?.reason ?? s.explanation,
      suggestion: s,
    };
  });

  const cancelledItems: NotificationItem[] = interviews
    .filter((i) => i.is_calendar_event_stale && i.status === "scheduled")
    .map((i) => ({
      kind: "cancelled",
      id: i.id,
      title: `Google Calendar event cancelled — ${i.company_name}`,
      body: i.role,
      interview: i,
    }));

  const items = [...suggestionItems, ...cancelledItems];

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="grid h-9 w-9 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#F43F5E] px-1 text-[9px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-[340px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="font-display text-sm font-semibold">Notifications</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-[oklch(0.55_0.02_265)]">
              Nothing needs your attention.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 border-b border-black/5 px-4 py-3 last:border-0 hover:bg-[oklch(0.98_0.005_265)]"
                >
                  {item.kind === "suggestion" ? (
                    <CalendarSearch className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={
                        item.kind === "suggestion"
                          ? "/dashboard/interviews"
                          : "/dashboard/interviews/$interviewId"
                      }
                      params={
                        item.kind === "cancelled" ? { interviewId: item.interview.id } : undefined
                      }
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <p className="text-sm font-medium text-[oklch(0.2_0.02_265)]">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[oklch(0.45_0.02_265)]">
                        {item.body}
                      </p>
                    </Link>
                    <button
                      onClick={() =>
                        item.kind === "suggestion"
                          ? resolveSuggestion.mutate({
                              suggestionId: item.suggestion.id,
                              decision: { action: "dismiss" },
                            })
                          : updateInterview.mutate({
                              id: item.interview.id,
                              updates: buildKeepInterviewPatch(item.interview),
                            })
                      }
                      className={cn(
                        "mt-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-black/[0.05]",
                        item.kind === "suggestion"
                          ? "text-[oklch(0.5_0.02_265)]"
                          : "text-[#B45309]",
                      )}
                    >
                      {item.kind === "suggestion" ? "Dismiss" : "Keep"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
