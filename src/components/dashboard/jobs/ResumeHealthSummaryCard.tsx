import { Link } from "@tanstack/react-router";
import { DashCard } from "@/components/dashboard/primitives";
import { ResumeHealthPanel } from "@/components/dashboard/resumes/ResumeHealthPanel";
import { useResumes, useResumeParsed, useReparseResume } from "@/features/resumes/hooks";

// ── Resume Health, shown on the job detail page (Module 6B) ──
//
// Deterministic, free, always available — completely separate from the AI
// Resume Match card below it. Uses the user's default resume; if none is set
// yet, points to Resume Manager instead of guessing.
export function ResumeHealthSummaryCard() {
  const { data: resumes, isLoading } = useResumes();
  const resume = resumes?.find((r) => r.is_default) ?? resumes?.[0];
  const { data: parsed } = useResumeParsed(resume?.id);
  const reparse = useReparseResume();

  if (isLoading) return null;

  if (!resume) {
    return (
      <DashCard>
        <p className="text-sm text-[oklch(0.45_0.02_265)]">
          Upload a resume to get an instant health report.
        </p>
        <Link
          to="/dashboard/resumes"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Go to Resume Manager →
        </Link>
      </DashCard>
    );
  }

  return (
    <DashCard>
      <ResumeHealthPanel
        health={parsed?.health ?? null}
        parseStatus={resume.parse_status}
        parseError={resume.parse_error}
        onReparse={() => reparse.mutate(resume.id)}
        reparsing={reparse.isPending}
      />
    </DashCard>
  );
}
