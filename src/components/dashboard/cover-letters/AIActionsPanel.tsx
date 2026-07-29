import { useState } from "react";
import { ChevronRight, Lightbulb, Loader2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard } from "@/components/dashboard/primitives";
import {
  AI_ACTION_GROUP_LABELS,
  AI_ACTION_OPTIONS,
  LENGTH_OPTIONS,
  TONE_OPTIONS,
  type AIActionOption,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { ExplanationBlock, type ExplanationState } from "./ExplanationBlock";

// ── AI actions panel (Module 6E · right sidebar) ──
//
// Editing session model: only "Regenerate entire letter" starts a new session
// and costs a credit (shown with a small "1 credit" badge). Every other action
// reuses the session opened when the letter was generated and is free — the
// footer and the out-of-credits state reflect that split instead of gating
// every action behind the credit balance.
//
// "Explain AI decisions" lives here too, as an Understand-group action that
// expands in place. It is the one action that returns insight rather than new
// letter text, so it renders its result inline (ExplanationBlock) instead of
// replacing the editor — but it belongs in this list, not in a card of its own.

type Props = {
  disabled: boolean;
  /** Whether this document has an active editing session (opened by Generate). */
  sessionActive: boolean;
  runningAction: CoverLetterAIAction | null;
  creditsRemaining: number;
  currentTone: CoverLetterTone;
  currentLength: CoverLetterLength;
  onRun: (
    action: CoverLetterAIAction,
    options?: { targetTone?: CoverLetterTone; targetLength?: CoverLetterLength },
  ) => void;
  explanation: ExplanationState;
  onExplain: () => void;
};

const GROUPS: AIActionOption["group"][] = ["regenerate", "adjust", "refine"];

export function AIActionsPanel({
  disabled,
  sessionActive,
  runningAction,
  creditsRemaining,
  currentTone,
  currentLength,
  onRun,
  explanation,
  onExplain,
}: Props) {
  const [expanded, setExpanded] = useState<CoverLetterAIAction | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const outOfCredits = creditsRemaining <= 0;
  const busy = disabled || Boolean(runningAction);

  function toggleExplain() {
    const opening = !explainOpen;
    setExplainOpen(opening);
    // Fetch on first open only; afterwards the block's own refresh handles it.
    if (opening && !explanation.explanation && !explanation.loading) onExplain();
  }

  function isLocked(action: AIActionOption): boolean {
    if (busy) return true;
    // Charged actions need a spare credit; free actions just need the session
    // that generating the letter already opened — running out of credits never
    // blocks refining a letter you already paid for.
    return action.chargesCredit ? outOfCredits : !sessionActive;
  }

  function handleClick(action: AIActionOption) {
    if (action.needs) {
      setExpanded((current) => (current === action.id ? null : action.id));
      return;
    }
    onRun(action.id);
  }

  return (
    <DashCard padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
            AI actions
          </p>
        </div>
        <span
          className={cn(
            "rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            outOfCredits ? "text-[#E11D48]" : "text-[oklch(0.45_0.02_265)]",
          )}
        >
          {creditsRemaining} credits
        </span>
      </div>

      {sessionActive && (
        <p className="flex items-center gap-1.5 border-b border-black/5 bg-[#22C55E]/[0.06] px-4 py-2 text-[11px] font-medium text-[oklch(0.35_0.05_150)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
          Editing session active — refinements below are free
        </p>
      )}

      <div className="divide-y divide-black/5">
        {GROUPS.map((group) => (
          <div key={group} className="px-3 py-2.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.58_0.02_265)]">
              {AI_ACTION_GROUP_LABELS[group]}
            </p>
            <div className="mt-1 space-y-0.5">
              {AI_ACTION_OPTIONS.filter((a) => a.group === group).map((action) => {
                const running = runningAction === action.id;
                const isExpanded = expanded === action.id;
                const locked = isLocked(action);
                return (
                  <div key={action.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(action)}
                      disabled={locked}
                      title={action.hint}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        isExpanded
                          ? "bg-[#2563EB]/[0.05] text-[#2563EB]"
                          : "text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03]",
                        "disabled:pointer-events-none disabled:opacity-40",
                      )}
                    >
                      {running ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#7C3AED]" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#7C3AED]/70" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {action.label}
                      </span>
                      {action.chargesCredit ? (
                        <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.45_0.02_265)]">
                          1 credit
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-[#22C55E]/10 px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.35_0.05_150)]">
                          Free
                        </span>
                      )}
                      {action.needs && (
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform",
                            isExpanded && "rotate-90",
                          )}
                        />
                      )}
                    </button>

                    {isExpanded && action.needs === "tone" && (
                      <OptionRow
                        options={TONE_OPTIONS.map((t) => ({ id: t.id, label: t.label }))}
                        activeId={currentTone}
                        disabled={locked}
                        onPick={(id) => {
                          setExpanded(null);
                          onRun(action.id, { targetTone: id as CoverLetterTone });
                        }}
                      />
                    )}

                    {isExpanded && action.needs === "length" && (
                      <OptionRow
                        options={LENGTH_OPTIONS.map((l) => ({ id: l.id, label: l.label }))}
                        activeId={currentLength}
                        disabled={locked}
                        onPick={(id) => {
                          setExpanded(null);
                          onRun(action.id, { targetLength: id as CoverLetterLength });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Understand ── the one action that returns insight, not new text */}
        <div className="px-3 py-2.5">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.58_0.02_265)]">
            Understand
          </p>
          <div className="mt-1">
            <button
              type="button"
              onClick={toggleExplain}
              disabled={busy || !sessionActive}
              title="Why this letter reads the way it does. Doesn't change the text."
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                explainOpen
                  ? "bg-[#2563EB]/[0.05] text-[#2563EB]"
                  : "text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {explanation.loading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#7C3AED]" />
              ) : (
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#7C3AED]/70" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                Explain AI decisions
              </span>
              <span className="shrink-0 rounded-md bg-[#22C55E]/10 px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.35_0.05_150)]">
                Free
              </span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  explainOpen && "rotate-90",
                )}
              />
            </button>

            {explainOpen && <ExplanationBlock state={explanation} onRefresh={onExplain} />}
          </div>
        </div>
      </div>

      <p className="border-t border-black/5 px-4 py-2.5 text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
        {outOfCredits
          ? "You're out of AI credits for a new generation, but refining this letter is still free."
          : "Refining this letter is free — included in your generation credit. Regenerating the entire letter starts a new one."}
      </p>
    </DashCard>
  );
}

function OptionRow({
  options,
  activeId,
  disabled,
  onPick,
}: {
  options: { id: string; label: string }[];
  activeId: string;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option.id)}
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
            option.id === activeId
              ? "border-[#2563EB]/30 bg-[#2563EB]/[0.06] text-[#2563EB]"
              : "border-black/8 bg-white text-[oklch(0.42_0.02_265)] hover:border-black/15 hover:bg-black/[0.02]",
          )}
        >
          {option.label}
          {option.id === activeId && " · current"}
        </button>
      ))}
    </div>
  );
}
