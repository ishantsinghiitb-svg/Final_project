import { useState, type ChangeEvent } from "react";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { DashButton } from "@/components/dashboard/DashButton";
import { useUploadResume } from "@/features/resumes/hooks";
import { FILE_LIMITS } from "@/constants";
import { toast } from "sonner";

// Custom overlay modal — matches the dashboard's established modal pattern
// (see ApplyPromptDialog's TrackApplicationModal) rather than the shadcn
// Dialog primitive, whose default tokens (bg-popover/bg-background) resolve
// to this app's dark theme variables and render as a dark floating panel.

export function ResumeUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const upload = useUploadResume();

  if (!open) return null;

  function reset() {
    setFile(null);
    setName("");
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    if (picked.size > FILE_LIMITS.RESUME_MAX_BYTES) {
      toast.error("Resume must be under 10 MB.");
      return;
    }
    setFile(picked);
    if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file) return;
    try {
      const { isDuplicate } = await upload.mutateAsync({ name: name.trim() || file.name, file });
      toast.success(
        isDuplicate
          ? "This resume is already in your library — reusing the existing analysis."
          : "Resume uploaded and analyzed.",
      );
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-upload-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => !upload.isPending && close()}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        {/* Gradient strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          <button
            onClick={close}
            disabled={upload.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] transition-colors hover:bg-black/[0.05] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="resume-upload-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Upload resume
          </h2>
          <p className="mt-1 text-sm text-[oklch(0.5_0.02_265)]">
            PDF only. We extract the text and generate a deterministic health report — no AI credits
            used.
          </p>

          <div className="mt-5 space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-8 text-center transition-colors hover:bg-black/[0.03]">
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onPick}
              />
              {file ? (
                <>
                  <FileText className="h-6 w-6 text-[#2563EB]" />
                  <span className="text-sm font-medium text-[oklch(0.25_0.02_265)]">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-[oklch(0.5_0.02_265)]">
                    {(file.size / 1024).toFixed(0)} KB · click to replace
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-[oklch(0.5_0.02_265)]" />
                  <span className="text-sm font-medium text-[oklch(0.25_0.02_265)]">
                    Choose a PDF
                  </span>
                  <span className="text-[11px] text-[oklch(0.5_0.02_265)]">Up to 10 MB</span>
                </>
              )}
            </label>

            <input
              type="text"
              placeholder="Resume name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] outline-none transition-colors placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <DashButton variant="outline" onClick={close} disabled={upload.isPending}>
              Cancel
            </DashButton>
            <DashButton onClick={submit} disabled={!file || upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </DashButton>
          </div>
        </div>
      </div>
    </div>
  );
}
