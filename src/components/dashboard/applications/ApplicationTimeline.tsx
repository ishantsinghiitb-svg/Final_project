import { useState } from "react";
import {
  Rocket,
  PenLine,
  ArrowRightLeft,
  Archive,
  ArchiveRestore,
  Circle,
  Loader2,
  NotebookPen,
  Flag,
  FileText,
  UserPlus,
  BellPlus,
  BellRing,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useApplicationTimeline } from "@/features/applications/hooks";
import { STATUS_META, PRIORITY_META } from "@/features/applications/constants";
import type { ApplicationPriority, ApplicationStatus, ApplicationTimelineEventType } from "@/types";
import { cn } from "@/lib/utils";

// Collapsed view shows the most recent COLLAPSED_COUNT events.
const COLLAPSED_COUNT = 4;

type EventMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

const EVENT_META: Record<ApplicationTimelineEventType, EventMeta> = {
  application_created: { label: "Application Created", icon: Rocket, tone: "text-[#2563EB]" },
  manual_application_created: { label: "Manually Added", icon: PenLine, tone: "text-[#7C3AED]" },
  status_changed: { label: "Status Changed", icon: ArrowRightLeft, tone: "text-[#F59E0B]" },
  archived: { label: "Archived", icon: Archive, tone: "text-[oklch(0.5_0.02_265)]" },
  restored: { label: "Restored", icon: ArchiveRestore, tone: "text-[#16A34A]" },
  notes_updated: { label: "Notes Updated", icon: NotebookPen, tone: "text-[oklch(0.5_0.02_265)]" },
  priority_changed: { label: "Priority Changed", icon: Flag, tone: "text-[#F59E0B]" },
  resume_changed: { label: "Resume Changed", icon: FileText, tone: "text-[#2563EB]" },
  contact_added: { label: "Contact Added", icon: UserPlus, tone: "text-[#7C3AED]" },
  reminder_created: { label: "Reminder Created", icon: BellPlus, tone: "text-[#2563EB]" },
  reminder_completed: { label: "Reminder Completed", icon: BellRing, tone: "text-[#16A34A]" },
};

const DEFAULT_EVENT_META: EventMeta = {
  label: "Event",
  icon: Circle,
  tone: "text-[oklch(0.5_0.02_265)]",
};

// Event types whose previous/new value is meaningful to show as a diff chip.
const DIFF_EVENT_TYPES = new Set<ApplicationTimelineEventType>([
  "status_changed",
  "priority_changed",
  "resume_changed",
]);

/** Formats a raw previous/new value for display, per event type. */
function formatDiffValue(eventType: ApplicationTimelineEventType, value: string | null): string | null {
  if (!value) return null;
  if (eventType === "status_changed") {
    return STATUS_META[value as ApplicationStatus]?.label ?? value;
  }
  if (eventType === "priority_changed") {
    return PRIORITY_META[value as ApplicationPriority]?.label ?? value;
  }
  return value;
}

type Props = {
  applicationId: string;
};

/**
 * ApplicationTimeline
 *
 * Read-only vertical activity feed rendering `application_activity` rows,
 * written automatically by DB triggers — see EVENT_META above for the full
 * set of tracked events (creation, status/priority/resume changes, archive/
 * restore, notes edits, contacts, and reminders).
 */
export function ApplicationTimeline({ applicationId }: Props) {
  const { data: events = [], isLoading } = useApplicationTimeline(applicationId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading timeline…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-xs text-[oklch(0.55_0.02_265)]">No activity recorded yet.</p>
    );
  }

  const hasMore = events.length > COLLAPSED_COUNT;
  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_COUNT);

  return (
    <div>
      <ol className="relative space-y-5 py-1 pl-6 before:absolute before:left-[9px] before:top-1 before:bottom-1 before:w-px before:bg-black/10">
      {visibleEvents.map((ev) => {
        const meta = EVENT_META[ev.event_type] ?? DEFAULT_EVENT_META;
        const Icon = meta.icon;
        const showDiff =
          DIFF_EVENT_TYPES.has(ev.event_type) && (ev.previous_value || ev.new_value);

        return (
          <li key={ev.id} className="relative">
            <span
              className={cn(
                "absolute -left-6 top-0 grid h-[18px] w-[18px] place-items-center rounded-full bg-white ring-2 ring-black/5",
                meta.tone,
              )}
            >
              <Icon className="h-3 w-3" />
            </span>

            <p className="text-sm font-medium text-[oklch(0.2_0.02_265)]">{meta.label}</p>
            <p className="mt-0.5 text-xs text-[oklch(0.55_0.02_265)]">
              {format(parseISO(ev.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>

            {showDiff && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.97_0.01_265)] px-2 py-1 text-xs text-[oklch(0.4_0.02_265)]">
                {formatDiffValue(ev.event_type, ev.previous_value) ?? "—"}
                <ArrowRightLeft className="h-3 w-3 text-[oklch(0.6_0.02_265)]" />
                <span className="font-medium text-[oklch(0.25_0.02_265)]">
                  {formatDiffValue(ev.event_type, ev.new_value) ?? "—"}
                </span>
              </p>
            )}
          </li>
        );
      })}
      </ol>

      {hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Expand ({events.length - COLLAPSED_COUNT} more)
            </>
          )}
        </button>
      )}
    </div>
  );
}
