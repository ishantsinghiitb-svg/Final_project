import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, MapPin, Video, X } from "lucide-react";
import { toast } from "sonner";
import { RichTextToolbar } from "@/components/shared/RichTextToolbar";
import { applyRichTextCommand, type RichTextCommand } from "@/lib/richText";
import { useCreateInterview, useUpdateInterview } from "@/features/interviews/hooks";
import { useResumes } from "@/features/resumes/hooks";
import { INTERVIEW_ROUND_PRESETS } from "@/features/interviews/constants";
import type { ScheduleInterviewInput, StandaloneInterviewInput } from "@/features/interviews/types";
import type { Interview, InterviewMode } from "@/types";
import { cn } from "@/lib/utils";

/** Minimal prefill for scheduling from an existing application — see ApplicationInterviews. */
export type LinkedApplicationPrefill = {
  applicationId: string;
  companyName: string;
  role: string;
  resumeId?: string | null;
  resumeName?: string | null;
};

type Props = {
  onClose: () => void;
  /** Present = "Schedule Interview" from an application. Absent + no `interview` = standalone create. */
  linkedApplication?: LinkedApplicationPrefill;
  /** Present = edit an existing interview (linked or standalone). */
  interview?: Interview;
  /** Fires after a successful create (linked or standalone) — e.g. to trigger the Applications↔Interviews sync prompt. */
  onCreated?: (interview: Interview) => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors disabled:bg-black/[0.02] disabled:text-[oklch(0.5_0.02_265)]";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * ScheduleInterviewDialog
 *
 * One dialog, both flows (linked/standalone) and both modes (create/edit).
 * Kept compact: only Company/Role/Round/Date/Time/Mode show by default —
 * everything else lives behind "More details".
 */
export function ScheduleInterviewDialog({
  onClose,
  linkedApplication,
  interview,
  onCreated,
}: Props) {
  const isEdit = Boolean(interview);
  const isLinked = isEdit ? Boolean(interview!.application_id) : Boolean(linkedApplication);

  const [companyName, setCompanyName] = useState(
    interview?.company_name ?? linkedApplication?.companyName ?? "",
  );
  const [role, setRole] = useState(interview?.role ?? linkedApplication?.role ?? "");
  const [round, setRound] = useState(interview?.type ?? "");
  const [date, setDate] = useState(interview ? toDateInputValue(interview.scheduled_at) : "");
  const [time, setTime] = useState(interview ? toTimeInputValue(interview.scheduled_at) : "");
  const [mode, setMode] = useState<InterviewMode>(interview?.mode ?? "online");
  const [moreOpen, setMoreOpen] = useState(false);
  const [link, setLink] = useState(interview?.link ?? "");
  const [location, setLocation] = useState(interview?.location ?? "");
  const [interviewer, setInterviewer] = useState(interview?.interviewer ?? "");
  const [resumeId, setResumeId] = useState<string | null>(
    interview?.resume_id ?? linkedApplication?.resumeId ?? null,
  );
  const [changingResume, setChangingResume] = useState(false);
  const [notes, setNotes] = useState(interview?.notes ?? "");

  const inheritedResumeName =
    interview?.resume_name_snapshot ?? linkedApplication?.resumeName ?? null;

  const { data: resumes = [] } = useResumes();
  const createInterview = useCreateInterview();
  const updateInterview = useUpdateInterview();
  const isPending = createInterview.isPending || updateInterview.isPending;

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const node = notesRef.current;
    if (pending && node) {
      node.focus();
      node.setSelectionRange(pending.start, pending.end);
      pendingSelection.current = null;
    }
  }, [notes]);

  function handleNotesCommand(command: RichTextCommand, linkUrl?: string) {
    const node = notesRef.current;
    if (!node) return;
    const next = applyRichTextCommand(
      command,
      { value: notes, start: node.selectionStart, end: node.selectionEnd },
      linkUrl,
    );
    pendingSelection.current = { start: next.start, end: next.end };
    setNotes(next.value);
  }

  const isValid =
    (isLinked || (companyName.trim().length > 0 && role.trim().length > 0)) &&
    round.trim().length > 0 &&
    date.length > 0 &&
    time.length > 0;

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isPending) return;

    const scheduled_at = new Date(`${date}T${time}`).toISOString();
    const shared: ScheduleInterviewInput = {
      round: round.trim(),
      scheduled_at,
      mode,
      link: mode === "online" ? link.trim() || null : null,
      location: mode === "offline" ? location.trim() || null : null,
      interviewer: interviewer.trim() || null,
      resume_id: resumeId,
      notes: notes.trim() || null,
    };

    if (interview) {
      updateInterview.mutate(
        {
          id: interview.id,
          updates: {
            type: shared.round,
            scheduled_at: shared.scheduled_at,
            mode: shared.mode,
            link: shared.link,
            location: shared.location,
            interviewer: shared.interviewer,
            resume_id: shared.resume_id,
            notes: shared.notes,
            ...(isLinked ? {} : { company_name: companyName.trim(), role: role.trim() }),
          },
        },
        {
          onSuccess: () => {
            toast.success("Interview updated.");
            onClose();
          },
          onError: () => toast.error("Failed to update interview."),
        },
      );
    } else if (linkedApplication) {
      createInterview.mutate(
        { applicationId: linkedApplication.applicationId, input: shared },
        {
          onSuccess: (created) => {
            toast.success("Interview scheduled.");
            onClose();
            onCreated?.(created);
          },
          onError: () => toast.error("Failed to schedule interview."),
        },
      );
    } else {
      const input: StandaloneInterviewInput = {
        ...shared,
        company_name: companyName.trim(),
        role: role.trim(),
      };
      createInterview.mutate(
        { input },
        {
          onSuccess: (created) => {
            toast.success("Interview scheduled.");
            onClose();
            onCreated?.(created);
          },
          onError: () => toast.error("Failed to schedule interview."),
        },
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-interview-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="max-h-[85vh] overflow-y-auto p-6">
          <button
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="schedule-interview-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            {isEdit ? "Edit Interview" : "Schedule Interview"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLinked ? "Linked to a tracked application." : "Not linked to a tracked application."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="interview-company">
                  Company
                </label>
                <input
                  id="interview-company"
                  type="text"
                  required
                  disabled={isLinked}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="interview-role">
                  Role
                </label>
                <input
                  id="interview-role"
                  type="text"
                  required
                  disabled={isLinked}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Software Engineer"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="interview-round">
                Interview Round
              </label>
              <input
                id="interview-round"
                type="text"
                required
                list="interview-round-presets"
                value={round}
                onChange={(e) => setRound(e.target.value)}
                placeholder="Technical"
                className={inputClass}
              />
              <datalist id="interview-round-presets">
                {INTERVIEW_ROUND_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="interview-date">
                  Date
                </label>
                <input
                  id="interview-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="interview-time">
                  Time
                </label>
                <input
                  id="interview-time"
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Mode</label>
              <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
                {(["online", "offline"] as InterviewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
                      mode === m
                        ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                        : "text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.3_0.02_265)]",
                    )}
                  >
                    {m === "online" ? (
                      <Video className="h-3.5 w-3.5" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    {m === "online" ? "Online" : "Offline"}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg px-0.5 py-1 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:text-[oklch(0.2_0.02_265)] transition-colors"
            >
              More details
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")}
              />
            </button>

            {moreOpen && (
              <div className="space-y-3.5">
                {mode === "online" ? (
                  <div>
                    <label className={labelClass} htmlFor="interview-link">
                      Meeting Link <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
                    </label>
                    <input
                      id="interview-link"
                      type="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://meet.google.com/…"
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass} htmlFor="interview-location">
                      Location <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
                    </label>
                    <input
                      id="interview-location"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="123 Market St, San Francisco"
                      className={inputClass}
                    />
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="interview-interviewer">
                    Recruiter / Interviewer{" "}
                    <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
                  </label>
                  <input
                    id="interview-interviewer"
                    type="text"
                    value={interviewer}
                    onChange={(e) => setInterviewer(e.target.value)}
                    placeholder="Jane Doe"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Resume</label>
                  {isLinked && !changingResume ? (
                    <div className="flex h-9 items-center justify-between rounded-lg border border-black/5 bg-black/[0.02] px-3">
                      <span className="truncate text-sm text-[oklch(0.4_0.02_265)]">
                        {inheritedResumeName ?? "No resume selected"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChangingResume(true)}
                        className="shrink-0 text-xs font-medium text-[#2563EB] hover:underline"
                      >
                        Change Resume
                      </button>
                    </div>
                  ) : (
                    <select
                      value={resumeId ?? ""}
                      onChange={(e) => setResumeId(e.target.value || null)}
                      className={inputClass}
                    >
                      <option value="">No resume</option>
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className={labelClass}>
                    Notes <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
                  </label>
                  <div className="rounded-lg border border-black/5 bg-white focus-within:border-[#2563EB]/40 focus-within:outline-none focus-within:ring-2 focus-within:ring-[#2563EB]/10 transition-colors">
                    <div className="border-b border-black/5 px-1.5 py-1">
                      <RichTextToolbar onCommand={handleNotesCommand} />
                    </div>
                    <textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      placeholder="Anything worth remembering…"
                      className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!isValid || isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEdit ? "Saving…" : "Scheduling…"}
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Schedule Interview"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
