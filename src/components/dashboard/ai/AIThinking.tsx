import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadingPhasesFor } from "@/features/ai/loadingPhases";
import type { ShippedAICapability } from "@/features/ai/constants";

// ── AI thinking / loading experience (Module 6G) ──
//
// The single loading surface for every credit-spending AI request — Resume
// Match, ATS, Optimizer and Cover Letter all render this, so a wait feels the
// same everywhere. It narrates the work in the user's language (see
// features/ai/loadingPhases.ts) instead of showing a bare spinner.
//
// Two deliberate constraints:
//   • It never claims to be finished. The script advances through its phases
//     and then HOLDS on the final line for as long as the request takes, so a
//     slow response never reads as a lie or a stuck UI.
//   • It shows no percentage. A fake progress number would be the one piece of
//     invented information in the whole flow; the phase list carries the same
//     "something is happening" signal honestly.

/**
 * Drives the phase script on a chain of timeouts (not one interval) so each
 * line can hold for its own duration. Stops on the last phase and stays there.
 */
function useLoadingPhase(capability: ShippedAICapability, active: boolean) {
  const phases = useMemo(() => loadingPhasesFor(capability), [capability]);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    // Restart from the top whenever a new request begins.
    setIndex(0);

    let current = 0;
    const advance = () => {
      if (current >= phases.length - 1) return; // hold on the final line
      timerRef.current = setTimeout(() => {
        current += 1;
        setIndex(current);
        advance();
      }, phases[current].holdMs);
    };
    advance();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, phases]);

  return { phases, index };
}

/** The sweeping indeterminate bar shared by both variants. */
function SweepBar({ className }: { className?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-black/[0.06]", className)}>
      <div className="h-full w-1/3 origin-left rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] animate-ai-sweep" />
    </div>
  );
}

/**
 * Full loading panel — the default for anywhere with room (card bodies, page
 * bodies, dialogs). Shows the completed phases as a short trail above the
 * current one so the user can see how far the work has come.
 */
export function AIThinkingPanel({
  capability,
  title,
  className,
  active = true,
}: {
  capability: ShippedAICapability;
  /** Optional heading, e.g. "Analyzing your match". Omit for just the phases. */
  title?: string;
  className?: string;
  /** Set false to reset the script without unmounting. */
  active?: boolean;
}) {
  const { phases, index } = useLoadingPhase(capability, active);
  // Only the two most recent completed lines stay visible — a full checklist
  // of six would out-weigh the line that actually matters.
  const trailStart = Math.max(0, index - 2);
  const trail = phases.slice(trailStart, index);

  return (
    <div
      className={cn("rounded-xl border border-black/5 bg-white/60 p-4", className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center">
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/25 animate-ai-breathe" />
          <Sparkles className="relative h-4 w-4 text-[#7C3AED]" />
        </div>

        <div className="min-w-0 flex-1">
          {title && (
            <p className="font-display text-sm font-semibold text-[oklch(0.25_0.02_265)]">
              {title}
            </p>
          )}

          <ul className={cn("space-y-1", title && "mt-2")}>
            {trail.map((phase, i) => (
              <li
                key={trailStart + i}
                className="flex items-center gap-1.5 text-xs text-[oklch(0.6_0.02_265)]"
              >
                <Check className="h-3 w-3 shrink-0 text-[#16A34A]" />
                <span className="truncate">{phase.label}</span>
              </li>
            ))}
            <li
              // Keyed by index so each new line re-runs its entrance animation.
              key={index}
              className="flex items-center gap-1.5 text-sm text-[oklch(0.3_0.02_265)] animate-ai-phase-in"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB] animate-ai-breathe" />
              <span className="truncate">{phases[index].label}</span>
            </li>
          </ul>

          <SweepBar className="mt-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact one-line variant for tight spots (a card header, a table row, a
 * button-adjacent status). Same script, no trail, no border.
 */
export function AIThinkingInline({
  capability,
  className,
  active = true,
}: {
  capability: ShippedAICapability;
  className?: string;
  active?: boolean;
}) {
  const { phases, index } = useLoadingPhase(capability, active);

  return (
    <div className={cn("min-w-0", className)} role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB] animate-ai-breathe" />
        <span
          key={index}
          className="truncate text-sm text-[oklch(0.4_0.02_265)] animate-ai-phase-in"
        >
          {phases[index].label}
        </span>
      </div>
      <SweepBar className="mt-2" />
    </div>
  );
}
