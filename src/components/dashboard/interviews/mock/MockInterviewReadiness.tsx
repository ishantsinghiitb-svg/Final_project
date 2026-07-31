import { useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { useUpdateInterview } from "@/features/interviews/hooks";
import { useResumes } from "@/features/resumes/hooks";
import type { Interview } from "@/types";

// ── MockInterviewReadiness (Module 7C) ──
//
// Same resume-link + manual job description gating as 7B's PrepSetupPanel —
// a mock interview needs the exact same inputs to stay grounded. Kept as its
// own component (not a re-import of PrepSetupPanel) because it does NOT
// render 7B's "Additional Interview Context" field — this module's
// equivalent ("what do you want tested?") is a launcher-level field, shown
// alongside the interviewer role picker rather than folded in here.

const inputClass =
  "w-full rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

export function MockInterviewReadiness({
  interview,
  manualJobDescription,
  manualCompanyDescription,
  onManualJobDescriptionChange,
  onManualCompanyDescriptionChange,
}: {
  interview: Interview;
  manualJobDescription: string;
  manualCompanyDescription: string;
  onManualJobDescriptionChange: (value: string) => void;
  onManualCompanyDescriptionChange: (value: string) => void;
}) {
  const { data: resumes = [] } = useResumes();
  const updateInterview = useUpdateInterview();
  const [pickingResume, setPickingResume] = useState(!interview.resume_id);

  const needsResume = !interview.resume_id;
  const needsJobDescription = !interview.job_id;

  if (!needsResume && !needsJobDescription) return null;

  function saveResume(resumeId: string) {
    if (!resumeId) return;
    updateInterview.mutate(
      { id: interview.id, updates: { resume_id: resumeId } },
      {
        onSuccess: () => {
          setPickingResume(false);
          toast.success("Resume linked to this interview.");
        },
        onError: () => toast.error("Could not save that resume."),
      },
    );
  }

  return (
    <DashCard>
      <SectionTitle>Before starting your mock interview</SectionTitle>
      <div className="mt-4 space-y-4">
        {needsResume && (
          <div>
            <label className={labelClass}>
              Resume <span className="text-[oklch(0.6_0.02_265)]">(required)</span>
            </label>
            {!pickingResume && interview.resume_id ? (
              <div className="flex h-9 items-center justify-between rounded-lg border border-black/5 bg-black/[0.02] px-3">
                <span className="flex items-center gap-1.5 truncate text-sm text-[oklch(0.4_0.02_265)]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                  {interview.resume_name_snapshot ?? "Resume selected"}
                </span>
                <button
                  type="button"
                  onClick={() => setPickingResume(true)}
                  className="shrink-0 text-xs font-medium text-[#2563EB] hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <select
                disabled={updateInterview.isPending}
                defaultValue=""
                onChange={(e) => saveResume(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  {updateInterview.isPending ? "Saving…" : "Select a resume…"}
                </option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {resumes.length === 0 && (
              <p className="mt-1.5 text-xs text-[oklch(0.55_0.02_265)]">
                Upload a resume first so this interview can be personalized to it.
              </p>
            )}
          </div>
        )}

        {needsJobDescription && (
          <>
            <div>
              <label className={labelClass} htmlFor="mock-jd">
                Job Description <span className="text-[oklch(0.6_0.02_265)]">(required)</span>
              </label>
              <textarea
                id="mock-jd"
                value={manualJobDescription}
                onChange={(e) => onManualJobDescriptionChange(e.target.value)}
                rows={6}
                placeholder="Paste the job description — the more complete it is, the more realistic your interviewer's questions will be."
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1.5 flex items-center gap-1 text-xs text-[oklch(0.55_0.02_265)]">
                <FileText className="h-3 w-3" /> This interview isn't linked to a tracked job, so it
                needs to be entered manually.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="mock-company-desc">
                Company Description <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <textarea
                id="mock-company-desc"
                value={manualCompanyDescription}
                onChange={(e) => onManualCompanyDescriptionChange(e.target.value)}
                rows={3}
                placeholder="Anything else worth knowing about the company — size, stage, product…"
                className={`${inputClass} resize-none`}
              />
            </div>
          </>
        )}

        {updateInterview.isPending && (
          <div className="flex items-center gap-1.5 text-xs text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving resume…
          </div>
        )}
      </div>
    </DashCard>
  );
}
