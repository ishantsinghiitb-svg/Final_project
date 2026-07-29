import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { CoverLetterExplanation } from "@/features/cover-letters/types";

// ── Explain AI Decisions — inline result block (Module 6E) ──
//
// Presentation only, no card chrome: this renders INSIDE the AI Actions panel
// (see AIActionsPanel) rather than as a standalone sidebar card, so "explain"
// reads as one more optional action instead of a second surface competing for
// attention.
//
// `stale` is true once the letter has changed since this explanation was
// fetched. A "why" panel describing text that is no longer on screen would
// undermine the trust it exists to build, so staleness is surfaced with a
// one-click refresh rather than left looking current.

export type ExplanationState = {
  loading: boolean;
  explanation: CoverLetterExplanation | null;
  stale: boolean;
  error: string | null;
};

export function ExplanationBlock({
  state,
  onRefresh,
}: {
  state: ExplanationState;
  onRefresh: () => void;
}) {
  const { loading, explanation, stale, error } = state;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reviewing your letter…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 px-2 py-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E11D48]" />
        <p className="text-xs text-[oklch(0.4_0.02_265)]">{error}</p>
      </div>
    );
  }

  if (!explanation) return null;

  return (
    <div className="space-y-2.5 px-2 pb-2 pt-1">
      {stale && (
        <button
          type="button"
          onClick={onRefresh}
          className="flex w-full items-center gap-1.5 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] px-2 py-1.5 text-left text-[11px] font-medium text-[oklch(0.4_0.05_80)] transition-colors hover:bg-[#F59E0B]/[0.1]"
        >
          <RefreshCw className="h-3 w-3 shrink-0" />
          The letter changed — refresh this explanation
        </button>
      )}
      <Row label="Tone" text={explanation.toneReason} />
      <Row label="Structure" text={explanation.structureReason} />
      <Row label="Highlights" text={explanation.highlightsReason} />
      {explanation.summary && (
        <p className="border-t border-black/5 pt-2 text-xs italic leading-relaxed text-[oklch(0.42_0.02_265)]">
          {explanation.summary}
        </p>
      )}
    </div>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.58_0.02_265)]">
        {label}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-[oklch(0.32_0.02_265)]">{text}</p>
    </div>
  );
}
