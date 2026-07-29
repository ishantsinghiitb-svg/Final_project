import { useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type {
  InterviewFilters,
  InterviewLinkedFilter,
  InterviewSortOption,
  InterviewWhenFilter,
} from "@/features/interviews/types";
import {
  SORT_LABELS,
  WHEN_FILTER_LABELS,
  WHEN_FILTER_OPTIONS,
} from "@/features/interviews/constants";
import { MultiSelectDropdown } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

type Props = {
  filters: InterviewFilters;
  sortOption: InterviewSortOption;
  onFiltersChange: (filters: InterviewFilters) => void;
  onSortChange: (sort: InterviewSortOption) => void;
  /** Distinct round values across the loaded interviews, for the Round filter's options. */
  roundOptions: string[];
  totalCount: number;
};

const LINKED_FILTER_LABELS: Record<InterviewLinkedFilter, string> = {
  linked: "Linked",
  standalone: "Standalone",
};

/**
 * InterviewFiltersBar
 *
 * Search + When/Round/Linked filters + sort. All state is lifted to the
 * parent route, mirroring ApplicationFiltersBar.
 */
export function InterviewFiltersBar({
  filters,
  sortOption,
  onFiltersChange,
  onSortChange,
  roundOptions,
  totalCount,
}: Props) {
  const [sortOpen, setSortOpen] = useState(false);

  const setQ = (q: string) => onFiltersChange({ ...filters, q: q || undefined });

  const setWhen = (when: InterviewWhenFilter) =>
    onFiltersChange({ ...filters, when: filters.when === when ? undefined : when });

  const setLinked = (linked: InterviewLinkedFilter) =>
    onFiltersChange({ ...filters, linked: filters.linked === linked ? undefined : linked });

  const setRounds = (rounds: string[]) =>
    onFiltersChange({ ...filters, round: rounds.length === 0 ? undefined : rounds });

  const hasFilters = Boolean(
    filters.q || filters.when || filters.linked || (filters.round && filters.round.length > 0),
  );

  const clearFilters = () => onFiltersChange({});

  return (
    <div className="space-y-3">
      {/* Row 1: Search + Round + Linked/Standalone + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[oklch(0.55_0.02_265)]" />
          <input
            id="interview-search"
            type="search"
            placeholder="Search company, role, interviewer…"
            value={filters.q ?? ""}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full rounded-lg border border-black/5 bg-white pl-9 pr-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setSortOpen((o) => !o)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.4_0.02_265)] hover:border-black/10 hover:bg-black/[0.02] transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {SORT_LABELS[sortOption]}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", sortOpen && "rotate-180")}
            />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
              {(Object.keys(SORT_LABELS) as InterviewSortOption[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onSortChange(opt);
                    setSortOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                    sortOption === opt
                      ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB] font-medium"
                      : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
                  )}
                >
                  {SORT_LABELS[opt]}
                </button>
              ))}
            </div>
          )}
        </div>

        <MultiSelectDropdown
          label="Round"
          options={roundOptions.map((r) => ({ value: r, label: r }))}
          selected={filters.round ?? []}
          onChange={setRounds}
        />

        <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
          {(["linked", "standalone"] as InterviewLinkedFilter[]).map((l) => (
            <button
              key={l}
              onClick={() => setLinked(l)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
                filters.linked === l
                  ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                  : "text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.3_0.02_265)]",
              )}
            >
              {LINKED_FILTER_LABELS[l]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[oklch(0.55_0.02_265)]">
            {totalCount} interview{totalCount !== 1 ? "s" : ""}
          </span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Row 2: When chips */}
      <div className="flex flex-wrap gap-1.5">
        {WHEN_FILTER_OPTIONS.map((w) => {
          const active = filters.when === w;
          return (
            <button
              key={w}
              onClick={() => setWhen(w)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                active
                  ? "border-transparent bg-[#2563EB]/10 text-[#2563EB] shadow-[0_0_0_2px] shadow-current/20"
                  : "border-black/5 bg-white text-[oklch(0.5_0.02_265)] hover:border-black/10",
              )}
            >
              {WHEN_FILTER_LABELS[w]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
