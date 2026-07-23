import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard } from "@/components/dashboard/primitives";
import { RESUME_FORMATS, type DownloadFormat } from "@/features/optimizer/download";
import type { SavedResumeVersion } from "@/features/optimizer/types";

// ── OptimizeSuccessPanel (Module 6D) ──
//
// Post-save confirmation: the version was created, download it (PDF / plain
// text; DOCX shown as coming soon via the format registry's `available` flag),
// or head back to the resume library.

type Props = {
  version: SavedResumeVersion;
  onDownload: (format: DownloadFormat) => void;
};

export function OptimizeSuccessPanel({ version, onDownload }: Props) {
  return (
    <div className="mx-auto max-w-xl">
      <DashCard className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E]/15 to-[#16A34A]/20 text-[#16A34A]">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-[oklch(0.2_0.02_265)]">
          Resume successfully optimized
        </h2>
        <p className="mt-1.5 text-sm text-[oklch(0.45_0.02_265)]">
          A new version was created. Your original resume is untouched.
        </p>

        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl border border-black/5 bg-black/[0.02] px-4 py-2.5">
          <FileText className="h-4 w-4 text-[#2563EB]" />
          <span className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{version.name}</span>
          <span className="rounded-md bg-[#2563EB]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#2563EB]">
            v{version.versionNumber}
          </span>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
            Download
          </p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {RESUME_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => f.available && onDownload(f.id)}
                disabled={!f.available}
                title={f.hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all",
                  f.available
                    ? "border-black/10 bg-white text-[oklch(0.3_0.02_265)] hover:-translate-y-px hover:border-[#2563EB]/30 hover:text-[#2563EB]"
                    : "cursor-not-allowed border-dashed border-black/10 bg-black/[0.02] text-[oklch(0.6_0.02_265)]",
                )}
              >
                <Download className="h-3.5 w-3.5" />
                {f.label}
                {!f.available && (
                  <span className="ml-0.5 text-[10px] text-[oklch(0.6_0.02_265)]">soon</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 border-t border-black/5 pt-5">
          <Link
            to="/dashboard/resumes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:text-[#2563EB]"
          >
            <ArrowLeft className="h-4 w-4" /> Return to resume library
          </Link>
        </div>
      </DashCard>
    </div>
  );
}
