import { AlertTriangle } from "lucide-react";

/**
 * RegeneratePrepWarning
 *
 * Extra content shown inside GeneratePrepDialog only for an explicit
 * "Regenerate Entire Preparation" — the server deletes every existing
 * per-question answer when it regenerates (question ids are reassigned each
 * time, so a stale answer would otherwise silently attach to a different
 * question). This has to be said plainly before 3 more credits are spent.
 */
export function RegeneratePrepWarning({ answeredCount }: { answeredCount: number }) {
  if (answeredCount === 0) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] px-3 py-2.5 text-left">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B45309]" />
      <p className="text-xs leading-relaxed text-[oklch(0.35_0.02_265)]">
        This replaces your questions and topics with a fresh set — your{" "}
        <span className="font-medium">
          {answeredCount} answer{answeredCount === 1 ? "" : "s"}
        </span>{" "}
        will be cleared along with them.
      </p>
    </div>
  );
}
