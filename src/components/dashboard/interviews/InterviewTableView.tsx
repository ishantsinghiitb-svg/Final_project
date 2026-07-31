import { MapPin, Pencil, Search, Trash2, Video } from "lucide-react";
import type { Interview } from "@/types";
import { CompanyMark, Chip, EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { INTERVIEW_STATUS_META, roundTone } from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { format, parseISO } from "date-fns";

type Props = {
  interviews: Interview[];
  onOpen: (interview: Interview) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
  /** Only relevant when the empty list is caused by filters — see the parent's own identical `filtered.length === 0` case. */
  onClearFilters?: () => void;
};

/**
 * InterviewTableView
 *
 * Tabular list view — rows open the Interview Details page (Module 7B); the
 * pencil icon opens the edit dialog directly.
 */
export function InterviewTableView({
  interviews,
  onOpen,
  onEdit,
  onDelete,
  onClearFilters,
}: Props) {
  if (interviews.length === 0) {
    // Same wording/treatment as the card view's own empty state for this
    // identical case (the parent only renders this view once at least one
    // interview exists at all, so an empty `interviews` here always means the
    // current filters exclude everything — never "no interviews ever").
    return (
      <EmptyState
        icon={Search}
        title="No interviews found"
        body="Try adjusting your filters."
        cta={
          onClearFilters && (
            <DashButton variant="outline" onClick={onClearFilters}>
              Clear filters
            </DashButton>
          )
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-black/5 text-left text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
          <tr>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Round</th>
            <th className="hidden px-4 py-3 md:table-cell">Date &amp; Time</th>
            <th className="hidden px-4 py-3 lg:table-cell">Mode</th>
            <th className="px-4 py-3">Status</th>
            <th className="w-8 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.03]">
          {interviews.map((interview) => {
            const tone = logoToneForCompany(interview.company_name);
            const statusMeta = INTERVIEW_STATUS_META[interview.status];

            return (
              <tr
                key={interview.id}
                onClick={() => onOpen(interview)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  // Same keyboard-access gap as the card grid view of this
                  // same list — the row-open action was mouse-only.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(interview);
                  }
                }}
                aria-label={`View interview details for ${interview.company_name}, ${interview.role}`}
                className="group cursor-pointer transition-colors hover:bg-[oklch(0.99_0.005_265)] focus-visible:outline-none focus-visible:bg-[oklch(0.98_0.005_265)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CompanyMark
                      company={interview.company_name}
                      tone={tone}
                      size={28}
                      logoUrl={interview.company_logo_url}
                    />
                    <span className="font-medium text-[oklch(0.2_0.02_265)]">
                      {interview.company_name}
                    </span>
                    {interview.application_id && <Chip tone="default">Linked</Chip>}
                  </div>
                </td>

                <td className="max-w-[200px] px-4 py-3">
                  <span className="line-clamp-2 text-xs text-[oklch(0.35_0.02_265)]">
                    {interview.role}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
                </td>

                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] md:table-cell">
                  {format(parseISO(interview.scheduled_at), "MMM d, yyyy · h:mm a")}
                </td>

                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  <span className="flex items-center gap-1">
                    {interview.mode === "online" ? (
                      <Video className="h-3 w-3 shrink-0" />
                    ) : (
                      <MapPin className="h-3 w-3 shrink-0" />
                    )}
                    {interview.mode === "online" ? "Online" : "Offline"}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
                </td>

                <td className="px-4 py-3">
                  <div
                    className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onEdit(interview)}
                      aria-label="Edit interview"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(interview.id)}
                      aria-label="Delete interview"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
