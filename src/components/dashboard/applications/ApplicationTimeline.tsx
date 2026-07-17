import { Rocket, PenLine, ArrowRightLeft, Archive, ArchiveRestore, Circle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useApplicationTimeline } from "@/features/applications/hooks";
import { STATUS_META } from "@/features/applications/constants";
import type { ApplicationStatus, ApplicationTimelineEventType } from "@/types";
import { cn } from "@/lib/utils";

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
};

const DEFAULT_EVENT_META: EventMeta = {
  label: "Event",
  icon: Circle,
  tone: "text-[oklch(0.5_0.02_265)]",
};

/** Maps a raw status value to its display label, tolerating unknown/legacy values. */
function statusLabel(value: string | null): string | null {
  if (!value) return null;
  return STATUS_META[value as ApplicationStatus]?.label ?? value;
}

type Props = {
  applicationId: string;
};

/**
 * ApplicationTimeline
 *
 * Minimal vertical activity feed rendering `application_activity` rows,
 * which are written automatically by a DB trigger whenever an application
 * is created, has its status changed, is archived, or is restored.
 */
export function ApplicationTimeline({ applicationId }: Props) {
  const { data: events = [], isLoading } = useApplicationTimeline(applicationId);

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

  return (
    <ol className="relative space-y-5 py-1 pl-6 before:absolute before:left-[9px] before:top-1 before:bottom-1 before:w-px before:bg-black/10">
      {events.map((ev) => {
        const meta = EVENT_META[ev.event_type] ?? DEFAULT_EVENT_META;
        const Icon = meta.icon;
        const showDiff =
          ev.event_type === "status_changed" && (ev.previous_value || ev.new_value);

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
                {statusLabel(ev.previous_value) ?? "—"}
                <ArrowRightLeft className="h-3 w-3 text-[oklch(0.6_0.02_265)]" />
                <span className="font-medium text-[oklch(0.25_0.02_265)]">
                  {statusLabel(ev.new_value) ?? "—"}
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
