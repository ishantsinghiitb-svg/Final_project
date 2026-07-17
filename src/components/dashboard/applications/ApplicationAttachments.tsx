import { useRef, useState } from "react";
import { Paperclip, Download, Trash2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/features/applications/hooks/attachments";
import { attachmentService } from "@/services/AttachmentService";
import type { ApplicationAttachmentKind } from "@/types";

const KIND_LABELS: Record<ApplicationAttachmentKind, string> = {
  offer_letter: "Offer Letter",
  assignment: "Assignment",
  pdf: "PDF",
  other: "Other",
};

const KIND_OPTIONS = Object.keys(KIND_LABELS) as ApplicationAttachmentKind[];

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ApplicationAttachments({ applicationId }: { applicationId: string }) {
  const { data: attachments = [], isLoading } = useAttachments(applicationId);
  const uploadAttachment = useUploadAttachment(applicationId);
  const deleteAttachment = useDeleteAttachment(applicationId);
  const [kind, setKind] = useState<ApplicationAttachmentKind>("other");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadAttachment.mutate(
      { kind, file },
      {
        onSuccess: () => toast.success("File attached."),
        onError: () => toast.error("Failed to upload file."),
      },
    );
  };

  const handleDownload = async (id: string, path: string) => {
    setDownloadingId(id);
    try {
      const url = await attachmentService.getDownloadUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to download file.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (id: string) => {
    deleteAttachment.mutate(
      { id },
      {
        onSuccess: () => toast.success("Attachment deleted."),
        onError: () => toast.error("Failed to delete attachment."),
      },
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[oklch(0.55_0.02_265)]">Offer letters, assignments, and other documents.</p>
        <div className="flex items-center gap-1.5">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ApplicationAttachmentKind)}
            className="h-8 rounded-lg border border-black/5 bg-white px-2 text-xs text-[oklch(0.4_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAttachment.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.5)] transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {uploadAttachment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFilePicked} className="hidden" />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading attachments…
          </div>
        ) : attachments.length === 0 ? (
          <p className="py-2 text-xs text-[oklch(0.55_0.02_265)]">No files attached yet.</p>
        ) : (
          attachments.map((a) => (
            <div
              key={a.id}
              className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 hover:bg-[oklch(0.99_0.005_265)] transition-colors"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[oklch(0.2_0.02_265)]">{a.name}</p>
                <p className="text-[11px] text-[oklch(0.55_0.02_265)]">
                  {KIND_LABELS[a.kind]}
                  {a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}
                  {` · ${format(parseISO(a.created_at), "MMM d, yyyy")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => void handleDownload(a.id, a.file_path)}
                  disabled={downloadingId === a.id}
                  aria-label="Download attachment"
                  className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors disabled:opacity-60"
                >
                  {downloadingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  aria-label="Delete attachment"
                  className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
