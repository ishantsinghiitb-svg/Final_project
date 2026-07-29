import { Calendar, MapPin, MoreVertical, Trash2, Users, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Interview, InterviewStatus } from "@/types";
import { CompanyMark, Chip } from "@/components/dashboard/primitives";
import {
  INTERVIEW_STATUS_META,
  LINKED_STATUSES,
  STANDALONE_STATUSES,
  roundTone,
} from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

type Props = {
  interview: Interview;
  onStatusChange: (interview: Interview, status: InterviewStatus) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
};

/**
 * InterviewCard
 *
 * No detail route — clicking the card opens the edit dialog directly.
 * The ⋮ menu offers a quick status change plus Edit/Delete.
 */
export function InterviewCard({ interview, onStatusChange, onEdit, onDelete }: Props) {
  const tone = logoToneForCompany(interview.company_name);
  const statusMeta = INTERVIEW_STATUS_META[interview.status];
  const allowedStatuses = interview.application_id ? LINKED_STATUSES : STANDALONE_STATUSES;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      onClick={() => onEdit(interview)}
      className="group relative cursor-pointer rounded-xl border border-black/5 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:border-black/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)]"
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark
          company={interview.company_name}
          tone={tone}
          size={32}
          logoUrl={interview.company_logo_url}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[oklch(0.2_0.02_265)]">
            {interview.company_name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[oklch(0.5_0.02_265)]">{interview.role}</p>
        </div>
        <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Interview options"
            className="grid h-6 w-6 place-items-center rounded-md text-[oklch(0.55_0.02_265)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/[0.05]"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)]">
              <div className="border-b border-black/5 px-2 py-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
                  Mark as
                </p>
                {allowedStatuses
                  .filter((s) => s !== interview.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(interview, s);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-black/[0.04]"
                    >
                      {INTERVIEW_STATUS_META[s].label}
                    </button>
                  ))}
              </div>
              <div className="px-2 py-1.5">
                <button
                  onClick={() => {
                    onEdit(interview);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.4_0.02_265)] hover:bg-black/[0.04]"
                >
                  Edit interview
                </button>
                <button
                  onClick={() => {
                    onDelete(interview.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete interview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
        <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
        {interview.application_id && <Chip tone="default">Linked</Chip>}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)]">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
          <span>{format(parseISO(interview.scheduled_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </div>
        {interview.mode === "online" ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Video className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{interview.link || "Online"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{interview.location || "Offline"}</span>
          </div>
        )}
        {interview.interviewer && (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{interview.interviewer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
