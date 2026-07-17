import { useRef, useState } from "react";
import { FileText, ExternalLink, Loader2, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useCoverLetters, useUploadCoverLetter } from "@/features/cover-letters/hooks";
import { useSetCoverLetter } from "@/features/applications/hooks";
import { coverLetterService } from "@/services/CoverLetterService";

/** Strips the file extension so the cover letter name reads cleanly. */
function nameFromFile(file: File): string {
  return file.name.replace(/\.[^./\\]+$/, "") || file.name;
}

type Props = {
  applicationId: string;
  coverLetterId: string | null | undefined;
};

export function ApplicationCoverLetterCard({ applicationId, coverLetterId }: Props) {
  const { data: coverLetters = [] } = useCoverLetters();
  const setCoverLetter = useSetCoverLetter(applicationId);
  const uploadCoverLetter = useUploadCoverLetter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const attached = coverLetters.find((c) => c.id === coverLetterId);
  const isBusy = uploadCoverLetter.isPending || setCoverLetter.isPending;

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    uploadCoverLetter.mutate(
      { name: nameFromFile(file), file },
      {
        onSuccess: (coverLetter) => {
          setCoverLetter.mutate(coverLetter.id, {
            onSuccess: () => toast.success("Cover letter attached."),
            onError: () => toast.error("Failed to attach cover letter."),
          });
        },
        onError: () => toast.error("Failed to upload cover letter."),
      },
    );
  };

  const handleView = async () => {
    if (!attached?.file_url) return;
    setViewLoading(true);
    try {
      const url = await coverLetterService.getDownloadUrl(attached.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to open cover letter.");
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        onChange={handleFilePicked}
        className="hidden"
      />

      {attached ? (
        <div>
          <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[oklch(0.2_0.02_265)]">{attached.name}</p>
              <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
                Version {attached.version_number} · Updated {format(parseISO(attached.updated_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {attached.file_url && (
              <button
                onClick={() => void handleView()}
                disabled={viewLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] transition-colors disabled:opacity-60"
              >
                {viewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                View
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] transition-colors disabled:opacity-60"
            >
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Replace
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-2px_rgba(124,58,237,0.5)] transition-all hover:bg-[#6D28D9] hover:-translate-y-px disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload Cover Letter
        </button>
      )}
    </div>
  );
}
