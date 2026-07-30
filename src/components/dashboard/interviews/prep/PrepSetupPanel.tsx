import { useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { useUpdateInterview } from "@/features/interviews/hooks";
import { useResumes } from "@/features/resumes/hooks";
import type { Interview } from "@/types";

const inputClass =
  "w-full rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

type Props = {
  interview: Interview;
  manualJobDescription: string;
  manualCompanyDescription: string;
  onManualJobDescriptionChange: (value: string) => void;
  onManualCompanyDescriptionChange: (value: string) => void;
  additionalContext: string;
  onAdditionalContextChange: (value: string) => void;
};

/**
 * PrepSetupPanel
 *
 * The step before the first "Generate my preparation". Resume selection
 * persists immediately onto the interview (it's just the existing resume
 * field ScheduleInterviewDialog already edits); the job description, company
 * context and additional context are held as local draft state until the
 * user actually generates, since they only matter to this AI call. Always
 * renders (previously returned null once resume+job were both present) so
 * the optional Additional Interview Context field is available even when
 * nothing is strictly missing.
 */
export function PrepSetupPanel({
  interview,
  manualJobDescription,
  manualCompanyDescription,
  onManualJobDescriptionChange,
  onManualCompanyDescriptionChange,
  additionalContext,
  onAdditionalContextChange,
}: Props) {
  const { data: resumes = [] } = useResumes();
  const updateInterview = useUpdateInterview();
  const [pickingResume, setPickingResume] = useState(!interview.resume_id);

  const needsResume = !interview.resume_id;
  const needsJobDescription = !interview.job_id;

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
      <SectionTitle>Before generating your preparation</SectionTitle>
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
                Upload a resume first so preparation can be personalized to it.
              </p>
            )}
          </div>
        )}

        {needsJobDescription && (
          <>
            <div>
              <label className={labelClass} htmlFor="prep-jd">
                Job Description <span className="text-[oklch(0.6_0.02_265)]">(required)</span>
              </label>
              <textarea
                id="prep-jd"
                value={manualJobDescription}
                onChange={(e) => onManualJobDescriptionChange(e.target.value)}
                rows={6}
                placeholder="Paste the job description — the more complete it is, the more grounded your preparation will be."
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1.5 flex items-center gap-1 text-xs text-[oklch(0.55_0.02_265)]">
                <FileText className="h-3 w-3" /> This interview isn't linked to a tracked job, so it
                needs to be entered manually.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="prep-company-desc">
                Company Description{" "}
                <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <textarea
                id="prep-company-desc"
                value={manualCompanyDescription}
                onChange={(e) => onManualCompanyDescriptionChange(e.target.value)}
                rows={3}
                placeholder="Anything else worth knowing about the company — size, stage, product…"
                className={`${inputClass} resize-none`}
              />
            </div>
          </>
        )}

        <div>
          <label className={labelClass} htmlFor="prep-additional-context">
            Additional Interview Context{" "}
            <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
          </label>
          <textarea
            id="prep-additional-context"
            value={additionalContext}
            onChange={(e) => onAdditionalContextChange(e.target.value)}
            rows={3}
            placeholder="Anything else you know about this interview? e.g. &quot;Recruiter told me they'll focus on product metrics&quot;, &quot;This is the final hiring manager round&quot;, &quot;They asked me to prepare SQL&quot;."
            className={`${inputClass} resize-none`}
          />
          <p className="mt-1.5 text-xs text-[oklch(0.55_0.02_265)]">
            Help the AI personalize your preparation even further. Nothing here is invented if you
            leave it blank.
          </p>
        </div>

        {updateInterview.isPending && (
          <div className="flex items-center gap-1.5 text-xs text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving resume…
          </div>
        )}
      </div>
    </DashCard>
  );
}
