import { useRef, useState } from "react";
import { Plus, Trash2, X, Loader2, Check, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Chip } from "@/components/dashboard/primitives";
import {
  useReminders,
  useCreateReminder,
  useSetReminderCompleted,
  useDeleteReminder,
} from "@/features/applications/hooks/reminders";
import {
  useReminderAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/features/applications/hooks/attachments";
import { attachmentService } from "@/services/AttachmentService";
import type { ApplicationReminderType } from "@/types";
import { cn } from "@/lib/utils";

const REMINDER_TYPE_LABELS: Record<ApplicationReminderType, string> = {
  follow_up: "Follow-up",
  interview: "Interview",
  oa_deadline: "OA Deadline",
  offer_expiry: "Offer Expiry",
  custom: "Custom",
};

const REMINDER_TYPE_OPTIONS = Object.keys(REMINDER_TYPE_LABELS) as ApplicationReminderType[];

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

function AddReminderDialog({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const [type, setType] = useState<ApplicationReminderType>("follow_up");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const createReminder = useCreateReminder(applicationId);

  const isValid = title.trim().length > 0 && date.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || createReminder.isPending) return;

    createReminder.mutate(
      {
        type,
        title: title.trim(),
        remind_at: new Date(date).toISOString(),
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Reminder added.");
          onClose();
        },
        onError: () => toast.error("Failed to add reminder."),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />
        <div className="p-6">
          <button
            onClick={onClose}
            disabled={createReminder.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">Add Reminder</h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="reminder-type">Type</label>
                <select
                  id="reminder-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ApplicationReminderType)}
                  className={inputClass}
                >
                  {REMINDER_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{REMINDER_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="reminder-date">Date</label>
                <input
                  id="reminder-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="reminder-title">Title</label>
              <input
                id="reminder-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Follow up with recruiter"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="reminder-note">Note <span className="text-[oklch(0.6_0.02_265)]">(optional)</span></label>
              <textarea
                id="reminder-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || createReminder.isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {createReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Reminder"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Reminder attachments ─────────────────────────────────────────────────────
// Reuses the general attachment infrastructure (application_attachments +
// the existing private `documents` bucket) via the optional reminder_id link
// — no separate storage or table for reminder files.
function ReminderAttachments({
  applicationId,
  reminderId,
}: {
  applicationId: string;
  reminderId: string;
}) {
  const { data: attachments = [] } = useReminderAttachments(reminderId);
  const uploadAttachment = useUploadAttachment(applicationId);
  const deleteAttachment = useDeleteAttachment(applicationId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadAttachment.mutate(
      { kind: "other", file, reminderId },
      { onError: () => toast.error("Failed to attach file.") },
    );
  };

  const handleDownload = async (id: string, path: string) => {
    setDownloadingId(id);
    try {
      const url = await attachmentService.getDownloadUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to open file.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {attachments.map((a) => (
        <span
          key={a.id}
          className="inline-flex max-w-[160px] items-center gap-1 rounded-md border border-black/5 bg-[oklch(0.97_0.01_265)] px-1.5 py-0.5 text-[10px] text-[oklch(0.4_0.02_265)]"
        >
          <Paperclip className="h-2.5 w-2.5 shrink-0" />
          <button
            onClick={() => void handleDownload(a.id, a.file_path)}
            disabled={downloadingId === a.id}
            className="truncate hover:text-[#2563EB] hover:underline disabled:opacity-60"
          >
            {a.name}
          </button>
          <button
            onClick={() => deleteAttachment.mutate({ id: a.id })}
            aria-label="Remove attachment"
            className="shrink-0 text-[oklch(0.6_0.02_265)] hover:text-rose-600"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadAttachment.isPending}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-black/20 px-1.5 py-0.5 text-[10px] font-medium text-[#2563EB] hover:bg-[#2563EB]/5 disabled:opacity-60"
      >
        {uploadAttachment.isPending ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <Paperclip className="h-2.5 w-2.5" />
        )}
        Attach
      </button>
      <input ref={fileInputRef} type="file" onChange={handleFilePicked} className="hidden" />
    </div>
  );
}

export function ApplicationReminders({ applicationId }: { applicationId: string }) {
  const { data: reminders = [], isLoading } = useReminders(applicationId);
  const setCompleted = useSetReminderCompleted(applicationId);
  const deleteReminder = useDeleteReminder(applicationId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleToggle = (id: string, completed: boolean) => {
    setCompleted.mutate({ id, completed: !completed });
  };

  const handleDelete = (id: string) => {
    deleteReminder.mutate(
      { id },
      {
        onSuccess: () => toast.success("Reminder removed."),
        onError: () => toast.error("Failed to remove reminder."),
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[oklch(0.55_0.02_265)]">Follow-ups, deadlines, and other dates to track.</p>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading reminders…
          </div>
        ) : reminders.length === 0 ? (
          <p className="py-2 text-xs text-[oklch(0.55_0.02_265)]">No reminders yet.</p>
        ) : (
          reminders.map((r) => (
            <div
              key={r.id}
              className="group flex items-start gap-3 rounded-xl border border-black/5 bg-white p-3 hover:bg-[oklch(0.99_0.005_265)] transition-colors"
            >
              <button
                onClick={() => handleToggle(r.id, r.completed)}
                aria-label={r.completed ? "Mark as pending" : "Mark as completed"}
                className={cn(
                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                  r.completed ? "border-[#16A34A] bg-[#16A34A]" : "border-black/20 bg-white",
                )}
              >
                {r.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className={cn("text-sm font-medium", r.completed ? "text-[oklch(0.6_0.02_265)] line-through" : "text-[oklch(0.2_0.02_265)]")}>
                    {r.title}
                  </p>
                  <Chip tone={r.completed ? "default" : "amber"}>{REMINDER_TYPE_LABELS[r.type]}</Chip>
                </div>
                <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
                  {format(parseISO(r.remind_at), "MMM d, yyyy")} · {r.completed ? "Completed" : "Pending"}
                </p>
                {r.note && <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">{r.note}</p>}
                <ReminderAttachments applicationId={applicationId} reminderId={r.id} />
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                aria-label="Delete reminder"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {dialogOpen && <AddReminderDialog applicationId={applicationId} onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
