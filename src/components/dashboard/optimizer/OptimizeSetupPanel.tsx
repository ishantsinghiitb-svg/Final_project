import { Check, Sparkles, Target, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard } from "@/components/dashboard/primitives";
import {
  CAREER_CATEGORIES,
  OPTIMIZE_SECTIONS,
  type CareerCategoryId,
  type OptimizeSectionId,
} from "@/features/optimizer/constants";

// ── OptimizeSetupPanel (Module 6D) ──
//
// Step 1 of the studio: pick ONE career category (context for the AI) and ONE or
// MORE resume sections to optimize. "Entire Resume" is exclusive — selecting it
// clears the others, and picking a specific section clears "Entire Resume".

type Props = {
  category: CareerCategoryId;
  onCategoryChange: (id: CareerCategoryId) => void;
  sections: OptimizeSectionId[];
  onSectionsChange: (next: OptimizeSectionId[]) => void;
  onOptimize: () => void;
  disabled?: boolean;
};

export function OptimizeSetupPanel({
  category,
  onCategoryChange,
  sections,
  onSectionsChange,
  onOptimize,
  disabled,
}: Props) {
  function toggleSection(id: OptimizeSectionId) {
    if (id === "full") {
      onSectionsChange(["full"]);
      return;
    }
    const withoutFull = sections.filter((s) => s !== "full");
    const next = withoutFull.includes(id)
      ? withoutFull.filter((s) => s !== id)
      : [...withoutFull, id];
    onSectionsChange(next);
  }

  const hasSelection = sections.length > 0;

  return (
    <div className="space-y-4">
      <DashCard>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#2563EB]" />
          <p className="font-display text-sm font-semibold text-[oklch(0.25_0.02_265)]">
            Optimize for
          </p>
        </div>
        <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
          Choose a career direction. This gives the AI context. It does not target a specific job.
        </p>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {CAREER_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategoryChange(c.id)}
                disabled={disabled}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:opacity-60",
                  active
                    ? "border-[#2563EB]/40 bg-gradient-to-br from-[#2563EB]/[0.06] to-[#7C3AED]/[0.08] shadow-[0_1px_2px_rgba(37,99,235,0.08)]"
                    : "border-black/5 bg-white hover:border-black/10 hover:bg-black/[0.02]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                    active
                      ? "border-[#2563EB] bg-[#2563EB] text-white"
                      : "border-black/15 bg-white text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[oklch(0.25_0.02_265)]">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[oklch(0.5_0.02_265)]">
                    {c.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DashCard>

      <DashCard>
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-[#7C3AED]" />
          <p className="font-display text-sm font-semibold text-[oklch(0.25_0.02_265)]">Sections</p>
        </div>
        <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
          Pick one or more sections to improve.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {OPTIMIZE_SECTIONS.map((s) => {
            const active = sections.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSection(s.id)}
                disabled={disabled}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60",
                  active
                    ? "border-[#7C3AED]/40 bg-[#7C3AED]/10 font-medium text-[#7C3AED]"
                    : "border-black/10 bg-white text-[oklch(0.4_0.02_265)] hover:border-black/20",
                )}
              >
                {active && <Check className="h-3.5 w-3.5" />}
                {s.label}
              </button>
            );
          })}
        </div>
      </DashCard>

      <button
        type="button"
        onClick={onOptimize}
        disabled={disabled || !hasSelection}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0 disabled:shadow-none"
      >
        <Sparkles className="h-4 w-4" /> Optimize resume
        <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">
          1 credit
        </span>
      </button>
    </div>
  );
}
