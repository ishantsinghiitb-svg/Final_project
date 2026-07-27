import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { DownloadMenu } from "./DownloadMenu";
import type { DownloadFormat } from "@/features/optimizer/download";
import type { SavedResumeVersion } from "@/features/optimizer/types";

// ── OptimizeSuccessPanel (Module 6D; 6E download menu) ──
//
// Post-save confirmation: the version was created, download it (PDF / DOCX via
// the Download ▼ menu), or head back to the resume library.

type Props = {
  version: SavedResumeVersion;
  onDownload: (format: DownloadFormat) => void | Promise<void>;
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

        <div className="mt-6 flex justify-center">
          <DownloadMenu onDownload={onDownload} />
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
