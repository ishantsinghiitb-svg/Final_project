import { Loader2, ArrowRight, GitMerge, SplitSquareHorizontal } from "lucide-react";
import { useInterview } from "@/features/interviews/hooks";
import { cn } from "@/lib/utils";

// ── InterviewMergeCompare (Module 9B) ──
//
// Shown inside ReviewSuggestionDialog's create_interview case only when the
// suggestion's payload carries a `possibleDuplicateOfInterviewId` — a Tier 3
// merge-ladder match (same application, close in time to an existing
// interview) that isn't confident enough to auto-merge silently (see
// CalendarSyncService.findMergeCandidate). The user decides: this is the
// same interview (merge, update the existing one) or a genuinely separate
// round (keep both). Accepting without a choice is blocked — see
// ReviewSuggestionDialog's isValid().

type CalendarSide = {
  scheduledAtIso: string | null;
  mode: "online" | "offline";
  link: string | null;
  location: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "No specific time set";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InterviewMergeCompare({
  existingInterviewId,
  calendarSide,
  choice,
  onChoiceChange,
}: {
  existingInterviewId: string;
  calendarSide: CalendarSide;
  choice: "merge" | "separate" | null;
  onChoiceChange: (choice: "merge" | "separate") => void;
}) {
  const { data: existing, isLoading } = useInterview(existingInterviewId);

  return (
    <div className="rounded-xl border border-black/5 bg-black/[0.012] p-3.5">
      <p className="text-xs font-medium text-[oklch(0.4_0.02_265)]">
        This might be the same interview as one you're already tracking
      </p>

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the existing interview…
        </div>
      ) : existing ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-black/5 bg-white p-2.5">
            <p className="font-medium text-[oklch(0.5_0.02_265)]">Your existing interview</p>
            <p className="mt-1 font-medium text-[oklch(0.2_0.02_265)]">{existing.type}</p>
            <p className="mt-0.5 text-[oklch(0.45_0.02_265)]">
              {formatWhen(existing.scheduled_at)}
            </p>
            <p className="mt-0.5 truncate text-[oklch(0.45_0.02_265)]">
              {existing.mode === "online"
                ? (existing.link ?? "No link set")
                : (existing.location ?? "No location set")}
            </p>
          </div>
          <div className="rounded-lg border border-black/5 bg-white p-2.5">
            <p className="font-medium text-[oklch(0.5_0.02_265)]">Calendar says</p>
            <p className="mt-1 font-medium text-[oklch(0.2_0.02_265)]">&nbsp;</p>
            <p className="mt-0.5 text-[oklch(0.45_0.02_265)]">
              {formatWhen(calendarSide.scheduledAtIso)}
            </p>
            <p className="mt-0.5 truncate text-[oklch(0.45_0.02_265)]">
              {calendarSide.mode === "online"
                ? (calendarSide.link ?? "No link set")
                : (calendarSide.location ?? "No location set")}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#B45309]">
          Couldn't load the existing interview — it may have been deleted since this suggestion was
          created.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onChoiceChange("merge")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
            choice === "merge"
              ? "border-[#2563EB]/30 bg-[#2563EB]/10 text-[#2563EB]"
              : "border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]",
          )}
        >
          <GitMerge className="h-3.5 w-3.5" />
          Same interview — merge
        </button>
        <button
          type="button"
          onClick={() => onChoiceChange("separate")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
            choice === "separate"
              ? "border-[#2563EB]/30 bg-[#2563EB]/10 text-[#2563EB]"
              : "border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]",
          )}
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
          Separate round — keep both
        </button>
      </div>

      {choice === "merge" && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-[oklch(0.5_0.02_265)]">
          <ArrowRight className="h-3 w-3" />
          Accepting will update the existing interview's time and details from this calendar event.
        </p>
      )}
    </div>
  );
}
