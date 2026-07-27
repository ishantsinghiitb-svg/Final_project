import { useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Sparkles, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESUME_PARSE_STATUS_LABELS } from "@/constants";
import type { Resume } from "@/types";

// ── OptimizeEntryDialog (Module 6D, polish pass) ──
//
// The page-level "Optimize Resume" entry point. Step 1 offers a choice —
// optimize a resume already in the library, or upload a new one first. Step 2
// (existing-resume path only) lists the user's resumes so they can pick one
// without leaving the dialog. The upload path hands off to the existing
// ResumeUploadDialog (see dashboard.resumes.tsx), which continues straight
// into the studio once the upload finishes parsing.

type Step = "choose" | "pick-existing";

type Props = {
  open: boolean;
  resumes: Resume[];
  onOpenChange: (open: boolean) => void;
  onSelectExisting: (resumeId: string) => void;
  onUploadNew: () => void;
};

export function OptimizeEntryDialog({
  open,
  resumes,
  onOpenChange,
  onSelectExisting,
  onUploadNew,
}: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    onOpenChange(false);
    setStep("choose");
    setSelectedId(null);
  }

  function confirmExisting() {
    if (!selectedId) return;
    onSelectExisting(selectedId);
    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimize-entry-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          <button
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] transition-colors hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>

          {step === "choose" ? (
            <>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2
                id="optimize-entry-title"
                className="mt-4 font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
              >
                Optimize a resume
              </h2>
              <p className="mt-1 text-sm text-[oklch(0.5_0.02_265)]">
                Start from a resume already in your library, or upload a new one.
              </p>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  onClick={() => setStep("pick-existing")}
                  className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3.5 text-left transition-all hover:-translate-y-px hover:border-[#2563EB]/30 hover:shadow-[0_4px_16px_-6px_rgba(37,99,235,0.25)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]">
                    <FileText className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[oklch(0.25_0.02_265)]">
                      Choose existing resume
                    </span>
                    <span className="block text-xs text-[oklch(0.5_0.02_265)]">
                      Pick from your resume library
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[oklch(0.6_0.02_265)] transition-transform group-hover:translate-x-0.5" />
                </button>

                <button
                  onClick={() => {
                    close();
                    onUploadNew();
                  }}
                  className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3.5 text-left transition-all hover:-translate-y-px hover:border-[#7C3AED]/30 hover:shadow-[0_4px_16px_-6px_rgba(124,58,237,0.25)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#7C3AED]/10 text-[#7C3AED]">
                    <Upload className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[oklch(0.25_0.02_265)]">
                      Upload new resume
                    </span>
                    <span className="block text-xs text-[oklch(0.5_0.02_265)]">
                      Add a PDF, then optimize it
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[oklch(0.6_0.02_265)] transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep("choose")}
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[oklch(0.5_0.02_265)] hover:text-[#2563EB]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h2 className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
                Choose a resume
              </h2>

              {resumes.length === 0 ? (
                <p className="mt-3 text-sm text-[oklch(0.5_0.02_265)]">
                  You don't have any resumes yet. Go back and upload one instead.
                </p>
              ) : (
                <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                  {resumes.map((r) => {
                    const ready = r.parse_status === "ready";
                    const selected = selectedId === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => ready && setSelectedId(r.id)}
                        disabled={!ready}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          selected
                            ? "border-[#2563EB]/40 bg-[#2563EB]/[0.05]"
                            : "border-black/5 bg-white hover:bg-black/[0.02]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border",
                            selected ? "border-[#2563EB] bg-[#2563EB]" : "border-black/20 bg-white",
                          )}
                        >
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[oklch(0.25_0.02_265)]">
                            {r.name}
                          </span>
                          {!ready && (
                            <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">
                              {RESUME_PARSE_STATUS_LABELS[r.parse_status ?? "pending"] ??
                                "Not ready"}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={confirmExisting}
                disabled={!selectedId}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
