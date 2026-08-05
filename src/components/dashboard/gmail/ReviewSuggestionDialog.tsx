import { useState } from "react";
import { Loader2, Video, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useResolveGmailSuggestion } from "@/features/gmail/hooks";
import { ALL_STATUSES, STATUS_META } from "@/features/applications/constants";
import { INTERVIEW_ROUND_PRESETS } from "@/features/interviews/constants";
import { cn } from "@/lib/utils";
import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";
import type { Json } from "@/types/database";
import type { ApplicationStatus, ApplicationReminderType } from "@/types";

// ── ReviewSuggestionDialog (Module 9A) ──
//
// "Review → Accept / Edit / Dismiss": every field below is pre-filled from
// the suggestion's stored `suggested_payload` (whatever the deterministic/AI
// pipeline extracted) but is always editable — for `create_application` and
// `create_interview` specifically, several required fields (role, interview
// round) are never extracted from the email at all, so editing here is how
// the user actually completes the suggestion, not an optional nicety.

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

type Payload = Record<string, unknown>;

function asPayload(value: Json): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
}
function str(payload: Payload, key: string, fallback = ""): string {
  const v = payload[key];
  return typeof v === "string" ? v : fallback;
}
function bool(payload: Payload, key: string): boolean {
  return payload[key] === true;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combineToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type AttachmentEntry = {
  gmailAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: string;
};

function asAttachments(payload: Payload): AttachmentEntry[] {
  const raw = payload.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is AttachmentEntry =>
      a && typeof a === "object" && typeof (a as AttachmentEntry).gmailAttachmentId === "string",
  );
}

type Props = { suggestion: GmailSuggestionListItem; onClose: () => void };

export function ReviewSuggestionDialog({ suggestion, onClose }: Props) {
  const payload = asPayload(suggestion.suggested_payload);
  const resolve = useResolveGmailSuggestion();

  const handleClose = () => {
    if (resolve.isPending) return;
    onClose();
  };
  const dialogRef = useDialogA11y<HTMLDivElement>(true, handleClose);

  // ── create_application ──
  const [companyName, setCompanyName] = useState(
    str(payload, "companyName", suggestion.company_name ?? ""),
  );
  const [role, setRole] = useState(str(payload, "role"));
  const [createStatus, setCreateStatus] = useState<ApplicationStatus>(
    (str(payload, "status", "applied") as ApplicationStatus) || "applied",
  );

  // ── update_application ──
  const [updateStatus, setUpdateStatus] = useState<ApplicationStatus>(
    (str(payload, "status", "applied") as ApplicationStatus) || "applied",
  );

  // ── create_interview ──
  const scheduledAtIso = str(payload, "scheduledAtIso") || null;
  const [date, setDate] = useState(scheduledAtIso ? toDateInputValue(scheduledAtIso) : "");
  const [time, setTime] = useState(scheduledAtIso ? toTimeInputValue(scheduledAtIso) : "");
  const [mode, setMode] = useState<"online" | "offline">(
    str(payload, "meetingLink") ? "online" : "online",
  );
  const [link, setLink] = useState(str(payload, "link") || str(payload, "meetingLink"));
  const [location, setLocation] = useState(str(payload, "location"));
  const [round, setRound] = useState(str(payload, "round", "Interview"));
  const [interviewer, setInterviewer] = useState(str(payload, "interviewer"));
  const timezoneUnclear =
    !bool(payload, "timezoneConfident") && Boolean(str(payload, "rawDateText"));

  // ── add_reminder ──
  const remindAtIso = str(payload, "remindAtIso") || null;
  const [remindDate, setRemindDate] = useState(remindAtIso ? toDateInputValue(remindAtIso) : "");
  const [remindTime, setRemindTime] = useState(
    remindAtIso ? toTimeInputValue(remindAtIso) : "12:00",
  );
  const [reminderTitle, setReminderTitle] = useState(
    str(payload, "title", `Follow up: ${suggestion.company_name ?? ""}`),
  );
  const [reminderType, setReminderType] = useState<ApplicationReminderType>(
    (str(payload, "reminderType", "follow_up") as ApplicationReminderType) || "follow_up",
  );

  // ── import_attachment ──
  const attachments = asAttachments(payload);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(attachments.map((a) => a.gmailAttachmentId)),
  );

  function isValid(): boolean {
    switch (suggestion.type) {
      // Role is intentionally NOT required — recruiting mail often never
      // states the title, and blocking Accept on it is what made this dialog
      // unusable (see acceptCreateApplication in GmailService).
      case "create_application":
        return companyName.trim().length > 0;
      case "update_application":
        return Boolean(updateStatus);
      case "create_interview":
        return date.length > 0 && time.length > 0 && round.trim().length > 0;
      case "add_reminder":
        return remindDate.length > 0 && remindTime.length > 0 && reminderTitle.trim().length > 0;
      case "import_attachment":
        return selectedIds.size > 0;
    }
  }

  function buildEditedPayload(): Json {
    switch (suggestion.type) {
      case "create_application":
        return { companyName: companyName.trim(), role: role.trim(), status: createStatus };
      case "update_application":
        return { status: updateStatus };
      case "create_interview":
        return {
          scheduledAtIso: combineToIso(date, time),
          mode,
          link: mode === "online" ? link.trim() || null : null,
          location: mode === "offline" ? location.trim() || null : null,
          round: round.trim(),
          interviewer: interviewer.trim() || null,
          existingInterviewId: (payload.existingInterviewId as string | null) ?? null,
        };
      case "add_reminder":
        return {
          reminderType,
          title: reminderTitle.trim(),
          remindAtIso: combineToIso(remindDate, remindTime),
        };
      case "import_attachment":
        return { attachments: attachments.filter((a) => selectedIds.has(a.gmailAttachmentId)) };
    }
  }

  function handleAccept() {
    if (!isValid() || resolve.isPending) return;
    resolve.mutate(
      {
        suggestionId: suggestion.id,
        decision: { action: "accept", editedPayload: buildEditedPayload() },
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success("Added to your applications.");
            onClose();
          } else {
            toast.error(result.message);
          }
        },
        onError: () => toast.error("Failed to apply this suggestion."),
      },
    );
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-suggestion-title"
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
            disabled={resolve.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="review-suggestion-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Review suggestion
          </h2>
          <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">{suggestion.explanation}</p>

          <div className="mt-5 space-y-3.5">
            {suggestion.type === "create_application" && (
              <>
                <div>
                  <label className={labelClass}>Company</label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={inputClass}
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <label className={labelClass}>Role</label>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inputClass}
                    placeholder="Software Engineer"
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as ApplicationStatus)}
                    className={inputClass}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s]?.label ?? s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {suggestion.type === "update_application" && (
              <div>
                <label className={labelClass}>New status</label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as ApplicationStatus)}
                  className={inputClass}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s]?.label ?? s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {suggestion.type === "create_interview" && (
              <>
                {timezoneUnclear && (
                  <p className="rounded-lg bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#B45309]">
                    Timezone wasn't clear from the email ("{str(payload, "rawDateText")}") — please
                    confirm the date and time below.
                  </p>
                )}
                <div>
                  <label className={labelClass}>Interview Round</label>
                  <input
                    value={round}
                    onChange={(e) => setRound(e.target.value)}
                    list="review-interview-round-presets"
                    className={inputClass}
                  />
                  <datalist id="review-interview-round-presets">
                    {INTERVIEW_ROUND_PRESETS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Time (your timezone)</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Mode</label>
                  <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
                    {(["online", "offline"] as const).map((m) => (
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
                {mode === "online" ? (
                  <div>
                    <label className={labelClass}>Meeting link</label>
                    <input
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Location</label>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Interviewer (optional)</label>
                  <input
                    value={interviewer}
                    onChange={(e) => setInterviewer(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {suggestion.type === "add_reminder" && (
              <>
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    value={reminderType}
                    onChange={(e) => setReminderType(e.target.value as ApplicationReminderType)}
                    className={inputClass}
                  >
                    <option value="follow_up">Follow-up</option>
                    <option value="oa_deadline">Assessment deadline</option>
                    <option value="offer_expiry">Offer expiry</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Date</label>
                    <input
                      type="date"
                      value={remindDate}
                      onChange={(e) => setRemindDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Time</label>
                    <input
                      type="time"
                      value={remindTime}
                      onChange={(e) => setRemindTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </>
            )}

            {suggestion.type === "import_attachment" && (
              <div>
                <label className={labelClass}>Attachments to import</label>
                <div className="space-y-2">
                  {attachments.map((a) => (
                    <label
                      key={a.gmailAttachmentId}
                      className="flex items-center gap-2.5 rounded-lg border border-black/5 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.gmailAttachmentId)}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.gmailAttachmentId)) next.delete(a.gmailAttachmentId);
                            else next.add(a.gmailAttachmentId);
                            return next;
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
                      />
                      <span className="truncate">{a.filename}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={handleClose}
              disabled={resolve.isPending}
              className="flex-1 rounded-xl border border-black/5 bg-white py-2.5 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={!isValid() || resolve.isPending}
              className="relative flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] disabled:opacity-70"
            >
              {resolve.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                </>
              ) : (
                // Wording only — same accept path underneath.
                "Add Application"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
