import { useState, useCallback } from "react";
import { Search, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ApplicationStatus } from "@/types";
import type {
  AppliedDatePreset,
  ApplicationFilters,
  ApplicationSortOption,
  RoleCategory,
} from "@/features/applications/types";
import {
  STATUS_META,
  ALL_STATUSES,
  SORT_LABELS,
  DEFAULT_APPLICATION_SORT_OPTION,
  ROLE_CATEGORY_LABELS,
  ROLE_CATEGORY_OPTIONS,
  APPLIED_DATE_PRESET_LABELS,
  APPLIED_DATE_PRESET_OPTIONS,
} from "@/features/applications/constants";
import { dateRangeForPreset } from "@/features/applications/utils";
import { MultiSelectDropdown } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-lg border border-black/5 bg-white px-2.5 text-sm text-[oklch(0.4_0.02_265)] hover:border-black/10 focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";

const dateInputClass =
  "h-9 rounded-lg border border-black/5 bg-white px-2.5 text-sm text-[oklch(0.4_0.02_265)] hover:border-black/10 focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";

type Props = {
  filters: ApplicationFilters;
  sortOption: ApplicationSortOption;
  onFiltersChange: (filters: ApplicationFilters) => void;
  onSortChange: (sort: ApplicationSortOption) => void;
  totalCount: number;
};

/**
 * ApplicationFiltersBar
 *
 * Search + filter + sort controls for the Applications page.
 * All state is lifted to the parent (dashboard.applications.tsx).
 */
export function ApplicationFiltersBar({
  filters,
  sortOption,
  onFiltersChange,
  onSortChange,
  totalCount,
}: Props) {
  const [sortOpen, setSortOpen] = useState(false);

  const setQ = useCallback(
    (q: string) => onFiltersChange({ ...filters, q: q || undefined }),
    [filters, onFiltersChange],
  );

  const toggleStatus = useCallback(
    (status: ApplicationStatus) => {
      const current = Array.isArray(filters.status)
        ? filters.status
        : filters.status
        ? [filters.status]
        : [];
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onFiltersChange({
        ...filters,
        status: next.length === 0 ? undefined : (next as ApplicationStatus[]),
      });
    },
    [filters, onFiltersChange],
  );

  const activeStatuses = Array.isArray(filters.status)
    ? filters.status
    : filters.status
    ? [filters.status]
    : [];

  const activeRoles = Array.isArray(filters.role)
    ? filters.role
    : filters.role
    ? [filters.role]
    : [];

  const setRoles = useCallback(
    (roles: string[]) =>
      onFiltersChange({
        ...filters,
        role: roles.length === 0 ? undefined : (roles as RoleCategory[]),
      }),
    [filters, onFiltersChange],
  );

  const setDatePreset = useCallback(
    (preset: string) => {
      if (!preset) {
        const { appliedDatePreset, appliedAfter, appliedBefore, ...rest } = filters;
        onFiltersChange(rest);
        return;
      }
      const p = preset as AppliedDatePreset;
      if (p === "custom") {
        onFiltersChange({ ...filters, appliedDatePreset: p });
        return;
      }
      const { after, before } = dateRangeForPreset(p);
      onFiltersChange({ ...filters, appliedDatePreset: p, appliedAfter: after, appliedBefore: before });
    },
    [filters, onFiltersChange],
  );

  const setCustomRange = useCallback(
    (key: "appliedAfter" | "appliedBefore", value: string) => {
      onFiltersChange({
        ...filters,
        appliedDatePreset: "custom",
        [key]: value ? new Date(value).toISOString() : undefined,
      });
    },
    [filters, onFiltersChange],
  );

  const hasFilters = Boolean(
    filters.q ||
      activeStatuses.length > 0 ||
      filters.source ||
      activeRoles.length > 0 ||
      filters.appliedDatePreset,
  );

  const clearFilters = () =>
    onFiltersChange({});

  return (
    <div className="space-y-3">
      {/* Row 1: Search + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[oklch(0.55_0.02_265)]" />
          <input
            id="app-search"
            type="search"
            placeholder="Search company, role, notes…"
            value={filters.q ?? ""}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full rounded-lg border border-black/5 bg-white pl-9 pr-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortOpen((o) => !o)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.4_0.02_265)] hover:border-black/10 hover:bg-black/[0.02] transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {SORT_LABELS[sortOption]}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sortOpen && "rotate-180")} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
              {(Object.keys(SORT_LABELS) as ApplicationSortOption[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => { onSortChange(opt); setSortOpen(false); }}
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

        {/* Role filter — multi-select */}
        <MultiSelectDropdown
          label="Role"
          options={ROLE_CATEGORY_OPTIONS.map((r) => ({ value: r, label: ROLE_CATEGORY_LABELS[r] }))}
          selected={activeRoles}
          onChange={setRoles}
        />

        {/* Applied date filter */}
        <select
          id="app-date-filter"
          value={filters.appliedDatePreset ?? ""}
          onChange={(e) => setDatePreset(e.target.value)}
          className={selectClass}
        >
          <option value="">Any time applied</option>
          {APPLIED_DATE_PRESET_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {APPLIED_DATE_PRESET_LABELS[p]}
            </option>
          ))}
        </select>

        {/* Custom range inputs — only shown once "Custom Range" is selected */}
        {filters.appliedDatePreset === "custom" && (
          <>
            <input
              id="app-date-after"
              type="date"
              aria-label="Applied after"
              value={filters.appliedAfter?.slice(0, 10) ?? ""}
              onChange={(e) => setCustomRange("appliedAfter", e.target.value)}
              className={dateInputClass}
            />
            <input
              id="app-date-before"
              type="date"
              aria-label="Applied before"
              value={filters.appliedBefore?.slice(0, 10) ?? ""}
              onChange={(e) => setCustomRange("appliedBefore", e.target.value)}
              className={dateInputClass}
            />
          </>
        )}

        {/* Count + clear */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[oklch(0.55_0.02_265)]">
            {totalCount} application{totalCount !== 1 ? "s" : ""}
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

      {/* Row 2: Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const active = activeStatuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                active
                  ? `${meta.bg} ${meta.text} border-transparent shadow-[0_0_0_2px] shadow-current/20`
                  : "border-black/5 bg-white text-[oklch(0.5_0.02_265)] hover:border-black/10",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? meta.dot : "bg-current opacity-40")} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
