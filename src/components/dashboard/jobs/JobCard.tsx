import { memo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, ArrowUpRight, MapPin, Briefcase, Clock, Banknote } from "lucide-react";
import { Chip, CompanyMark } from "@/components/dashboard/primitives";
import { formatSalary, formatPostedTime, formatSourceLabel, logoToneForCompany } from "@/features/jobs/utils";
import type { GlobalJob } from "@/types";

// ── Job Card ─────────────────────────────────────────────────────────────────
// The canonical list-row Job Card — originally lived only on the Jobs page;
// extracted verbatim (same JSX/behavior) so Collection Details (Module 5B)
// can reuse the exact same card instead of a fourth bespoke implementation.
// Renders as an <li>, meant to sit inside a <ul className="divide-y ..."> —
// see dashboard.jobs.index.tsx / dashboard.collections.$collectionId.tsx.

export interface JobCardProps {
  job: GlobalJob;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onApply: (job: GlobalJob) => void;
  /**
   * Extra action rendered in the trailing action row, between Save and Apply
   * — e.g. an Add-to-Collection trigger, or a "Remove from this collection"
   * button on Collection Details. Omitted entirely when not provided, so
   * every existing caller renders identically to before this prop existed.
   */
  extraAction?: ReactNode;
}

export const JobCard = memo(function JobCard({
  job,
  isSaved,
  onSave,
  onUnsave,
  onApply,
  extraAction,
}: JobCardProps) {
  const salary = formatSalary(job);
  const posted = formatPostedTime(job);
  const tone = logoToneForCompany(job.company_name);

  return (
    <li className="group flex items-center gap-4 px-4 py-4 hover:bg-[oklch(0.98_0.005_265)] transition-colors">
      {/*
       * The entire left region is a <Link> so clicking anywhere on the card
       * navigates to the detail page. The Save and Apply buttons outside the
       * <Link> call stopPropagation only on their own events.
       */}
      <Link
        to="/dashboard/jobs/$jobId"
        params={{ jobId: job.id }}
        className="flex flex-1 min-w-0 items-center gap-4"
      >
        <CompanyMark company={job.company_name} tone={tone} size={46} logoUrl={job.company_logo_url} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate font-display text-[15px] font-semibold">{job.role}</p>
            {job.remote && (
              <Chip tone="green" className="shrink-0">
                Remote
              </Chip>
            )}
            {job.work_mode && !job.remote && (
              <Chip
                tone={
                  job.work_mode === "Remote"
                    ? "green"
                    : job.work_mode === "Hybrid"
                      ? "blue"
                      : "default"
                }
                className="shrink-0"
              >
                {job.work_mode}
              </Chip>
            )}
            {job.experience_level && (
              <Chip tone="default" className="shrink-0">
                {job.experience_level}
              </Chip>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <p className="text-[13px] text-[oklch(0.5_0.02_265)]">
              {job.company_name}
              {job.location && (
                <>
                  {" · "}
                  <MapPin className="inline h-3 w-3" /> {job.location}
                </>
              )}
            </p>
            {job.employment_type && (
              <span className="flex items-center gap-0.5 text-[13px] text-[oklch(0.5_0.02_265)]">
                <Briefcase className="h-3 w-3" /> {job.employment_type}
              </span>
            )}
            {/*
             * Salary already contains the currency symbol (e.g. "₹18L–₹30L"
             * or "$120K–$150K"). Use Banknote icon — never a DollarSign icon
             * which would produce "$ ₹18L" double-currency.
             */}
            {salary && (
              <span className="flex items-center gap-0.5 text-[13px] text-[oklch(0.5_0.02_265)]">
                <Banknote className="h-3 w-3" /> {salary}
              </span>
            )}
          </div>
        </div>

        {/* Source + time — desktop only */}
        <div className="hidden flex-col items-end gap-0.5 md:flex min-w-[80px]">
          <span className="text-xs text-[oklch(0.55_0.02_265)]">{formatSourceLabel(job.source)}</span>
          {posted && (
            <span className="flex items-center gap-1 text-xs text-[oklch(0.55_0.02_265)]">
              <Clock className="h-3 w-3" /> {posted}
            </span>
          )}
        </div>
      </Link>

      {/* Action buttons — outside the <Link>, stopPropagation not needed as
          they are siblings, not ancestors, of the <Link> element. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => {
            if (isSaved) onUnsave();
            else onSave();
          }}
          aria-label={isSaved ? "Unsave job" : "Save job"}
          className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
        >
          {isSaved ? (
            <BookmarkCheck className="h-4 w-4 text-[#2563EB]" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </button>

        {extraAction}

        {job.url && (
          <button
            onClick={() => onApply(job)}
            className="hidden md:inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.25_0.02_265)] hover:bg-black/[0.03] transition-colors"
          >
            Apply
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </li>
  );
});
