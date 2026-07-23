import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
} from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { cn } from "@/lib/utils";
import { useResumes } from "@/features/resumes/hooks";
import { useAtsScore, useAtsScoreHistory, useAnalyzeAts } from "@/features/ai/hooks";
import { ATS_RATINGS, atsRatingForScore, type AtsRating } from "@/features/ai/atsRating";
import { friendlyAIError } from "@/features/ai/errorMessages";
import type { AtsScoreSummary } from "@/features/ai/types";
import type { Resume } from "@/types";
import { AnalyzeAtsDialog } from "./AnalyzeAtsDialog";
import { AtsReportDialog } from "./AtsReportDialog";

// ── ATS Compatibility card (Module 6C, compacted in the Module 6C polish pass) ──
//
// Job-specific, AI-powered, credit-consuming — a distinct product from Resume
// Health (deterministic) and Resume Match ("should I apply?"). This answers
// "will this resume perform well in ATS screening for THIS job?" The card
// itself is a QUICK SUMMARY only (score, rating, one key insight) so it stays
// companion-sized to the Resume Match card — the full breakdown, keywords,
// risks, and recommendations live in the existing AtsReportDialog (unchanged;
// see "View Full Report"). Re-analyze/history stay on the card rather than
// the dialog because the dialog's structure is frozen and must not change.

const RATING_TONE: Record<AtsRating, "green" | "blue" | "amber" | "rose"> = {
  [ATS_RATINGS.EXCELLENT]: "green",
  [ATS_RATINGS.STRONG]: "blue",
  [ATS_RATINGS.MODERATE]: "amber",
  [ATS_RATINGS.NEEDS_IMPROVEMENT]: "rose",
};

function ratingGradient(rating: AtsRating): string {
  return {
    [ATS_RATINGS.EXCELLENT]: "from-[#22C55E] to-[#16A34A]",
    [ATS_RATINGS.STRONG]: "from-[#2563EB] to-[#7C3AED]",
    [ATS_RATINGS.MODERATE]: "from-[#F59E0B] to-[#EAB308]",
    [ATS_RATINGS.NEEDS_IMPROVEMENT]: "from-[#F43F5E] to-[#E11D48]",
  }[rating];
}

/**
 * The ONE headline insight shown on the compact card. Prioritizes the most
 * decision-relevant signal: a critical keyword gap (most actionable) beats a
 * general strength, which beats a lower-priority formatting risk.
 */
function keyInsight(analysis: AtsScoreSummary): { text: string; isRisk: boolean } {
  const criticalCount = analysis.criticalMissingKeywords.length;
  if (criticalCount > 0) {
    return {
      text: `Top issue: missing ${criticalCount} critical keyword${criticalCount > 1 ? "s" : ""}`,
      isRisk: true,
    };
  }
  if (analysis.strengths.length > 0) {
    return { text: analysis.strengths[0], isRisk: false };
  }
  if (analysis.atsRisks.length > 0) {
    return { text: analysis.atsRisks[0], isRisk: true };
  }
  return { text: analysis.summary, isRisk: false };
}

function AtsCardShell({
  children,
  resumeName,
  picker,
  headerAction,
}: {
  children: ReactNode;
  resumeName?: string | null;
  picker?: ReactNode;
  /** Small icon-only action (e.g. Re-analyze) rendered at the far right of the header row. */
  headerAction?: ReactNode;
}) {
  return (
    <DashCard>
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">ATS Compatibility</p>
          {picker ?? (
            <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
              {resumeName ? `Using ${resumeName} · AI` : "AI · 1 credit"}
            </p>
          )}
        </div>
        {headerAction}
      </div>
      <div className="mt-4">{children}</div>
    </DashCard>
  );
}

/**
 * Resume selector — shown only when the user has 2+ resumes. Mirrors the Resume
 * Match picker: switching is free because the read path (useAtsScore) is keyed
 * by resumeId, so a resume that already has a cached analysis for this job shows
 * it instantly with no AI call. Disabled while an analysis is in flight.
 */
function ResumePicker({
  resumes,
  selectedId,
  onSelect,
  disabled,
}: {
  resumes: Resume[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span className="text-[11px] text-[oklch(0.5_0.02_265)]">Using</span>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        aria-label="Resume used for this ATS analysis"
        className="max-w-[180px] truncate rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-[11px] font-medium text-[oklch(0.3_0.02_265)] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 disabled:opacity-60"
      >
        {resumes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.is_default ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function AtsHistoryList({ resumeId, jobId }: { resumeId: string; jobId: string }) {
  const { data: history, isLoading } = useAtsScoreHistory(resumeId, jobId);

  if (isLoading) {
    return <p className="mt-3 text-xs text-[oklch(0.5_0.02_265)]">Loading history…</p>;
  }
  if (!history || history.length === 0) {
    return <p className="mt-3 text-xs text-[oklch(0.5_0.02_265)]">No past analyses yet.</p>;
  }

  return (
    <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between text-xs text-[oklch(0.45_0.02_265)]"
        >
          <span>
            {new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="font-medium">
            {entry.score != null ? `${entry.score}/100 · ${atsRatingForScore(entry.score)}` : "N/A"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AtsCompatibilityCard({ jobId }: { jobId: string }) {
  const { data: resumes, isLoading: resumesLoading } = useResumes();
  // null = "follow the default resume"; a concrete id = the user picked one.
  // A `?resume=` deep-link preselects that resume, but it is read in the effect
  // BELOW (post-mount), never in a render-phase initializer — reading `window`
  // during the initial render makes SSR and the first client render disagree
  // (hydration mismatch). Seeding to the SSR value and applying the param after
  // mount keeps the first render identical on both.
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeParam = params.get("resume");
    if (resumeParam) setSelectedResumeId(resumeParam);
  }, []);

  const resume =
    resumes?.find((r) => r.id === selectedResumeId) ??
    resumes?.find((r) => r.is_default) ??
    resumes?.[0];

  const atsQuery = useAtsScore(resume?.id, jobId, resume?.parse_status === "ready");
  const analyzeMutation = useAnalyzeAts(resume?.id, jobId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reAnalyze, setReAnalyze] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Synchronous re-entrancy guard: isPending only flips on the next render, so a
  // fast double-click could fire mutate() twice (two credits for one click). A
  // ref updates immediately, closing that window.
  const submittingRef = useRef(false);

  // Switching resume clears any lingering analyze error from the previous
  // resume's mutation (a single shared instance, not keyed by resumeId). The
  // new resume's cached result comes from atsQuery, which IS keyed by resumeId.
  const handleSelectResume = (id: string) => {
    analyzeMutation.reset();
    setSelectedResumeId(id);
  };

  const picker =
    resumes && resumes.length > 1 && resume ? (
      <ResumePicker
        resumes={resumes}
        selectedId={resume.id}
        onSelect={handleSelectResume}
        disabled={analyzeMutation.isPending}
      />
    ) : undefined;

  if (resumesLoading) {
    return (
      <AtsCardShell>
        <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
      </AtsCardShell>
    );
  }

  if (!resume) {
    return (
      <AtsCardShell>
        <p className="text-sm text-[oklch(0.45_0.02_265)]">
          Upload a resume to check its ATS compatibility for this job.
        </p>
        <Link
          to="/dashboard/resumes"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Go to Resume Manager →
        </Link>
      </AtsCardShell>
    );
  }

  if (resume.parse_status === "pending" || resume.parse_status === "processing") {
    return (
      <AtsCardShell resumeName={resume.name} picker={picker}>
        <div className="flex items-center gap-2 text-sm text-[oklch(0.45_0.02_265)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing your resume…
        </div>
      </AtsCardShell>
    );
  }

  if (resume.parse_status === "failed") {
    return (
      <AtsCardShell resumeName={resume.name} picker={picker}>
        <div className="flex items-center gap-2 text-sm text-[#E11D48]">
          <AlertCircle className="h-4 w-4" /> Fix your resume before checking ATS compatibility.
        </div>
        <Link
          to="/dashboard/resumes"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Go to Resume Manager →
        </Link>
      </AtsCardShell>
    );
  }

  if (atsQuery.isLoading) {
    return (
      <AtsCardShell resumeName={resume.name} picker={picker}>
        <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
      </AtsCardShell>
    );
  }

  const result = atsQuery.data;
  if (!result || !result.ok) {
    return (
      <AtsCardShell resumeName={resume.name} picker={picker}>
        <p className="text-sm text-[#E11D48]">Couldn't load your ATS status. Try again later.</p>
      </AtsCardShell>
    );
  }

  const credits = result.credits;
  const locked = credits.featureLocked;

  const openConfirm = (isReAnalyze: boolean) => {
    setReAnalyze(isReAnalyze);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setConfirmOpen(false);
    analyzeMutation.mutate(reAnalyze, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  };

  // Friendly error copy only — never the raw provider message.
  const failureCode =
    analyzeMutation.data && !analyzeMutation.data.ok ? analyzeMutation.data.code : null;
  const errorText = failureCode
    ? friendlyAIError(failureCode)
    : analyzeMutation.isError
      ? friendlyAIError(undefined)
      : null;
  const errorBanner = errorText && (
    <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#E11D48]">{errorText}</div>
  );

  const analysis = result.analysis;
  const insight = analysis ? keyInsight(analysis) : null;

  const reanalyzeHeaderButton = analysis && (
    <button
      onClick={() => openConfirm(true)}
      disabled={analyzeMutation.isPending || locked}
      title="Re-analyze"
      aria-label="Re-analyze ATS compatibility"
      className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/5 text-[oklch(0.5_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", analyzeMutation.isPending && "animate-spin")} />
    </button>
  );

  return (
    <>
      <AtsCardShell
        resumeName={result.resumeName ?? resume.name}
        picker={picker}
        headerAction={reanalyzeHeaderButton}
      >
        {!analysis || !insight ? (
          <div className="space-y-3">
            {errorBanner}
            <p className="text-sm text-[oklch(0.45_0.02_265)]">
              Check how ATS-friendly your resume is for this job, including keyword coverage and
              formatting.
            </p>
            <DashButton
              onClick={() => openConfirm(false)}
              disabled={analyzeMutation.isPending || locked}
              className="w-full justify-between"
            >
              {analyzeMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Analyze ATS
                  </span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                    1 Credit
                  </span>
                </>
              )}
            </DashButton>
            {locked && (
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                You've used all your AI credits.{" "}
                <Link to="/pricing" className="font-medium text-[#2563EB] hover:underline">
                  See upgrade options
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {errorBanner}

            {result.stale && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-[#B45309]">
                Your resume or this job has changed since your last ATS check. Re-analyze to update
                your result.
              </div>
            )}

            {/* Score */}
            <div>
              <div className="flex items-end justify-between">
                <p className="font-display text-4xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
                  {analysis.overallScore}
                  <span className="text-base font-medium text-[oklch(0.5_0.02_265)]">/100</span>
                </p>
                <Chip tone={RATING_TONE[analysis.rating]}>{analysis.rating}</Chip>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-black/5">
                <div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r",
                    ratingGradient(analysis.rating),
                  )}
                  style={{ width: `${analysis.overallScore}%` }}
                />
              </div>
            </div>

            {/* One key insight */}
            <div className="flex items-start gap-2 text-sm">
              {insight.isRisk ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
              )}
              <span className="line-clamp-2 text-[oklch(0.3_0.02_265)]" title={insight.text}>
                {insight.text}
              </span>
            </div>

            <DashButton
              variant="outline"
              size="sm"
              onClick={() => setReportOpen(true)}
              className="w-full"
            >
              <FileSearch className="h-3.5 w-3.5" /> View Full Report
            </DashButton>

            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="text-xs text-[oklch(0.5_0.02_265)] hover:underline"
            >
              {historyOpen ? "Hide" : "View"} past analyses
            </button>

            {historyOpen && <AtsHistoryList resumeId={resume.id} jobId={jobId} />}
          </div>
        )}
      </AtsCardShell>

      <AnalyzeAtsDialog
        open={confirmOpen}
        reAnalyze={reAnalyze}
        creditsRemaining={credits.creditsRemaining}
        isPending={analyzeMutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />

      {analysis && (
        <AtsReportDialog
          open={reportOpen}
          analysis={analysis}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}
