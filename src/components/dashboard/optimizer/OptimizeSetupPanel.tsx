import { Check, Sparkles, Target, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard } from "@/components/dashboard/primitives";
import {
  CAREER_CATEGORIES,
  CUSTOM_CATEGORY_EXAMPLES,
  CUSTOM_CATEGORY_MAX_LENGTH,
  OPTIMIZE_SECTIONS,
  isCustomCategory,
  sanitizeCustomCategory,
  type CareerCategoryId,
  type OptimizeSectionId,
} from "@/features/optimizer/constants";

// ── OptimizeSetupPanel (Module 6D, polish pass) ──
//
// Step 1 of the studio: pick ONE career category (context for the AI) and ONE
// or MORE resume sections to optimize. Category is a single choice — picking
// "Other" reveals a free-text career-target input whose value is passed
// straight into the AI prompt (no hardcoded role list to validate against).
// "Entire Resume" is exclusive for sections — selecting it clears the others,
// and picking a specific section clears "Entire Resume".

type Props = {
  category: CareerCategoryId;
  onCategoryChange: (id: CareerCategoryId) => void;
  customCategory: string;
  onCustomCategoryChange: (value: string) => void;
  sections: OptimizeSectionId[];
  onSectionsChange: (next: OptimizeSectionId[]) => void;
  onOptimize: () => void;
  disabled?: boolean;
};

export function OptimizeSetupPanel({
  category,
  onCategoryChange,
  customCategory,
  onCustomCategoryChange,
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

  const isOther = isCustomCategory(category);
  const customValid = !isOther || sanitizeCustomCategory(customCategory).length > 0;
  const hasSelection = sections.length > 0 && customValid;

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
          Choose one career direction. This gives the AI context. It does not target a specific job.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CAREER_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategoryChange(c.id)}
                disabled={disabled}
                className={cn(
                  "group flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all disabled:opacity-60",
                  active
                    ? "border-[#2563EB]/40 bg-gradient-to-br from-[#2563EB]/[0.06] to-[#7C3AED]/[0.08] shadow-[0_1px_2px_rgba(37,99,235,0.08)]"
                    : "border-black/5 bg-white hover:border-black/10 hover:bg-black/[0.02]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border transition-colors",
                    active
                      ? "border-[#2563EB] bg-[#2563EB] text-white"
                      : "border-black/15 bg-white text-transparent",
                  )}
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[oklch(0.25_0.02_265)]">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
                    {c.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {isOther && (
          <div className="mt-3 rounded-xl border border-[#2563EB]/20 bg-[#2563EB]/[0.03] p-3.5">
            <label
              htmlFor="custom-career-target"
              className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.45_0.02_265)]"
            >
              Career target
            </label>
            <input
              id="custom-career-target"
              value={customCategory}
              onChange={(e) =>
                onCustomCategoryChange(e.target.value.slice(0, CUSTOM_CATEGORY_MAX_LENGTH))
              }
              disabled={disabled}
              placeholder="e.g. Developer Relations"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[oklch(0.25_0.02_265)] outline-none transition-colors placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CUSTOM_CATEGORY_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => onCustomCategoryChange(ex)}
                  disabled={disabled}
                  className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-[oklch(0.45_0.02_265)] transition-colors hover:border-[#2563EB]/30 hover:text-[#2563EB] disabled:opacity-60"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
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
