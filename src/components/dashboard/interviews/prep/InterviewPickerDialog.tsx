import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Search, Sparkles, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CompanyMark, Chip } from "@/components/dashboard/primitives";
import { roundTone } from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import type { Interview } from "@/types";

type Props = {
  interviews: Interview[];
  onClose: () => void;
};

/**
 * InterviewPickerDialog
 *
 * Backs the Interviews Dashboard's "Start Preparation" button (Module 7B).
 * Preparation always targets an EXISTING interview, so — unlike Cover
 * Letters' "New cover letter", which starts from a blank resume/job picker —
 * this is a search-and-select over interviews the user has already
 * scheduled, upcoming first.
 */
export function InterviewPickerDialog({ interviews, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    return [...interviews].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  }, [interviews]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (i) => i.company_name.toLowerCase().includes(q) || i.role.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  function openPrep(interview: Interview) {
    onClose();
    void navigate({
      to: "/dashboard/interviews/$interviewId/prep",
      params: { interviewId: interview.id },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-picker-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Sparkles className="h-5 w-5" />
          </div>

          <h2
            id="interview-picker-title"
            className="mt-4 font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Start Preparation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Which interview are you preparing for?
          </p>

          {interviews.length === 0 ? (
            <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 py-8 text-center">
              <CalendarClock className="h-6 w-6 text-[oklch(0.6_0.02_265)]" />
              <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No interviews yet</p>
              <p className="max-w-[240px] text-xs text-[oklch(0.55_0.02_265)]">
                Schedule an interview first, then come back to start preparing.
              </p>
            </div>
          ) : (
            <>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(0.6_0.02_265)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by company or role…"
                  className="h-9 w-full rounded-lg border border-black/5 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40"
                />
              </div>

              <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[oklch(0.55_0.02_265)]">
                    No interviews match "{query}".
                  </p>
                ) : (
                  filtered.map((interview) => (
                    <button
                      key={interview.id}
                      onClick={() => openPrep(interview)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-black/5 p-2.5 text-left transition-colors hover:border-black/10 hover:bg-black/[0.02]"
                    >
                      <CompanyMark
                        company={interview.company_name}
                        tone={logoToneForCompany(interview.company_name)}
                        size={30}
                        logoUrl={interview.company_logo_url}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[oklch(0.2_0.02_265)]">
                          {interview.company_name}
                        </p>
                        <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">
                          {interview.role}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
                        <span className="text-[10px] text-[oklch(0.55_0.02_265)]">
                          {format(parseISO(interview.scheduled_at), "MMM d")}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
