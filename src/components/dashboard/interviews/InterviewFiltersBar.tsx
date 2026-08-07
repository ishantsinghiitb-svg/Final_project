import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ListFilter, Search, X } from "lucide-react";
import type {
  InterviewFilters,
  InterviewLinkedFilter,
  InterviewSortOption,
  InterviewWhenFilter,
} from "@/features/interviews/types";
import {
  SORT_LABELS,
  SOURCE_FILTER_LABELS,
  SOURCE_FILTER_OPTIONS,
  WHEN_FILTER_LABELS,
  WHEN_FILTER_OPTIONS,
} from "@/features/interviews/constants";
import type { InterviewSource } from "@/types";
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
 * InterviewFiltersBar (Module 9B finalization — simplified)
 *
 * Only Search and the Today/Upcoming/Completed chips stay always-visible, per
 * the finalization pass's explicit UI simplification requirement. Sort,
 * Round, Source and Linked/Standalone all live inside one "Filters" dropdown
 * instead of each being its own always-on control — fewer things competing
 * for attention, same filtering power underneath.
 */
export function InterviewFiltersBar({
  filters,
  sortOption,
  onFiltersChange,
  onSortChange,
  roundOptions,
  totalCount,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const handlePointer = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [panelOpen]);

  const setQ = (q: string) => onFiltersChange({ ...filters, q: q || undefined });

  const setWhen = (when: InterviewWhenFilter) =>
    onFiltersChange({ ...filters, when: filters.when === when ? undefined : when });

  const setLinked = (linked: InterviewLinkedFilter) =>
    onFiltersChange({ ...filters, linked: filters.linked === linked ? undefined : linked });

  const toggleRound = (round: string) => {
    const current = filters.round ?? [];
    const next = current.includes(round) ? current.filter((r) => r !== round) : [...current, round];
    onFiltersChange({ ...filters, round: next.length === 0 ? undefined : next });
  };

  const toggleSource = (source: InterviewSource) => {
    const current = filters.source ?? [];
    const next = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source];
    onFiltersChange({ ...filters, source: next.length === 0 ? undefined : next });
  };

  const hasAdvancedFilters = Boolean(
    filters.linked ||
    (filters.round && filters.round.length > 0) ||
    (filters.source && filters.source.length > 0),
  );
  const hasFilters = Boolean(filters.q || filters.when) || hasAdvancedFilters;

  const advancedCount =
    (filters.linked ? 1 : 0) + (filters.round?.length ?? 0) + (filters.source?.length ?? 0);

  const clearFilters = () => onFiltersChange({});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:min-w-[200px] sm:max-w-sm sm:flex-1">
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

        <div ref={panelRef} className="relative">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={panelOpen}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm transition-colors",
              hasAdvancedFilters
                ? "border-[#2563EB]/30 text-[#2563EB]"
                : "border-black/5 text-[oklch(0.4_0.02_265)] hover:border-black/10",
            )}
          >
            <ListFilter className="h-3.5 w-3.5" />
            Filters{advancedCount > 0 ? ` (${advancedCount})` : ""}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", panelOpen && "rotate-180")}
            />
          </button>

          {panelOpen && (
            <div className="absolute right-0 top-10 z-20 w-64 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
              <div className="max-h-[26rem] overflow-y-auto p-3">
                <FilterSection title="Sort by">
                  {(Object.keys(SORT_LABELS) as InterviewSortOption[]).map((opt) => (
                    <FilterRow
                      key={opt}
                      label={SORT_LABELS[opt]}
                      active={sortOption === opt}
                      onClick={() => onSortChange(opt)}
                    />
                  ))}
                </FilterSection>

                <FilterSection title="Type">
                  <div className="flex overflow-hidden rounded-lg border border-black/5">
                    {(["linked", "standalone"] as InterviewLinkedFilter[]).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLinked(l)}
                        className={cn(
                          "flex-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                          filters.linked === l
                            ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                            : "text-[oklch(0.5_0.02_265)] hover:bg-black/[0.03]",
                        )}
                      >
                        {LINKED_FILTER_LABELS[l]}
                      </button>
                    ))}
                  </div>
                </FilterSection>

                {roundOptions.length > 0 && (
                  <FilterSection title="Round">
                    {roundOptions.map((round) => (
                      <FilterRow
                        key={round}
                        label={round}
                        active={(filters.round ?? []).includes(round)}
                        onClick={() => toggleRound(round)}
                        multi
                      />
                    ))}
                  </FilterSection>
                )}

                <FilterSection title="Source" last>
                  {SOURCE_FILTER_OPTIONS.map((source) => (
                    <FilterRow
                      key={source}
                      label={SOURCE_FILTER_LABELS[source]}
                      active={(filters.source ?? []).includes(source)}
                      onClick={() => toggleSource(source)}
                      multi
                    />
                  ))}
                </FilterSection>
              </div>
            </div>
          )}
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
    </div>
  );
}

function FilterSection({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-0.5", !last && "mb-3 border-b border-black/5 pb-3")}>
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
        {title}
      </p>
      {children}
    </div>
  );
}

function FilterRow({
  label,
  active,
  onClick,
  multi,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Checkbox-style affordance for multi-select rows (Round/Source); sort rows are single-select. */
  multi?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
          : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
      )}
    >
      {multi && (
        <span
          className={cn(
            "grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
            active ? "border-[#2563EB] bg-[#2563EB] text-white" : "border-black/15",
          )}
        >
          {active && <CheckCircle2 className="h-3 w-3" />}
        </span>
      )}
      <span className="truncate">{label}</span>
      {!multi && active && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-[#2563EB]" />}
    </button>
  );
}
