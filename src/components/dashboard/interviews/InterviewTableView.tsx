import { MapPin, Pencil, Trash2, Video } from "lucide-react";
import type { Interview } from "@/types";
import { CompanyMark, Chip } from "@/components/dashboard/primitives";
import { INTERVIEW_STATUS_META, roundTone } from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { format, parseISO } from "date-fns";

type Props = {
  interviews: Interview[];
  onOpen: (interview: Interview) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
};

/**
 * InterviewTableView
 *
 * Tabular list view — rows open the Interview Details page (Module 7B); the
 * pencil icon opens the edit dialog directly.
 */
export function InterviewTableView({ interviews, onOpen, onEdit, onDelete }: Props) {
  if (interviews.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No interviews found</p>
        <p className="text-xs text-[oklch(0.55_0.02_265)]">
          Schedule one from an application, or add a standalone interview.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
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
                className="group cursor-pointer transition-colors hover:bg-[oklch(0.99_0.005_265)]"
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
