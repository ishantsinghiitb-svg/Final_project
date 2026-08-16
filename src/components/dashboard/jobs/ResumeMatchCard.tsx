import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Loader2, AlertCircle, CheckCircle2, FileSearch } from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { useResumes } from "@/features/resumes/hooks";
import { useResumeMatch, useAnalyzeMatch } from "@/features/ai/hooks";
import { MATCH_LABELS, type MatchLabel } from "@/features/ai/matchLabel";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { AIThinkingPanel } from "@/components/dashboard/ai/AIThinking";
import { AIErrorNotice } from "@/components/dashboard/ai/AIErrorNotice";
import { AIMetaStrip, AIOutdatedNotice } from "@/components/dashboard/ai/AIMeta";
import type { Resume } from "@/types";
import { AnalyzeMatchDialog } from "./AnalyzeMatchDialog";
import { ResumeMatchReportDialog } from "./ResumeMatchReportDialog";
import { NeedMoreCreditsLink } from "../ai/NeedMoreCredits";

// ── AI Resume Match card (Module 6B, compacted in the Module 6C polish pass) ──
//
// Separate product from Resume Health: AI-powered, job-specific, consumes
// credits. The card itself is a QUICK SUMMARY only (score, label, up to two
// short highlights) — the full report (strengths, areas to improve, missing
// skills/keywords, dimension breakdown, recommendation, summary, history,
// re-analyze) lives in ResumeMatchReportDialog, opened via "View Full Report".
// This keeps the card companion-sized to the ATS Compatibility card instead of
// growing tall with the whole AI output.

const LABEL_TONE: Record<MatchLabel, "green" | "blue" | "amber" | "rose"> = {
  [MATCH_LABELS.EXCELLENT]: "green",
  [MATCH_LABELS.GOOD]: "blue",
  [MATCH_LABELS.PARTIAL]: "amber",
  [MATCH_LABELS.LIMITED]: "rose",
};

function MatchCardShell({
  children,
  resumeName,
  picker,
}: {
  children: ReactNode;
  resumeName?: string | null;
  /** Rendered instead of the single-resume subtitle when the user has 2+ resumes. */
  picker?: ReactNode;
}) {
  return (
    <DashCard>
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">AI Resume Match</p>
          {picker ?? (
            <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
              {resumeName ? `Using ${resumeName} · AI` : "AI · 1 credit"}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </DashCard>
  );
}

/**
 * Resume selector for the Match card. Shown only when the user has 2+ resumes;
 * defaults to their default resume. Switching is free — the read path
 * (useResumeMatch) is keyed by resumeId, so selecting a resume that already has
 * a cached analysis for this job shows it instantly with no AI call, and the
 * cache stays deterministic per (resume, job). Native <select> for reliable
 * keyboard/mobile behavior. Disabled while an analysis is in flight so the
 * selected resume can't change mid-request.
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
        aria-label="Resume used for this analysis"
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

export function ResumeMatchCard({
  jobId,
  deepLink,
  onDeepLinkConsumed,
}: {
  jobId: string;
  /**
   * Parsed `?resume=…&analyze=1&force=1` from the route (Module 6G). Supplied
   * by the page rather than read from `window` here: the router resolves the
   * same values during SSR and the first client render, so the card no longer
   * needs a post-mount effect to avoid a hydration mismatch (React #418).
   */
  deepLink?: { resumeId?: string; analyze?: boolean; force?: boolean };
  /** Called once the analyze intent has been acted on, so the page can clear it. */
  onDeepLinkConsumed?: () => void;
}) {
  const { data: resumes, isLoading: resumesLoading } = useResumes();
  // null = "follow the default resume"; a concrete id = a deep link or the
  // user's own pick. Safe to seed from the deep link during render — it comes
  // from the router, so server and client agree on it.
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(
    deepLink?.resumeId ?? null,
  );
  const autoAnalyze = {
    analyze: Boolean(deepLink?.analyze),
    force: Boolean(deepLink?.force),
  };

  const resume =
    resumes?.find((r) => r.id === selectedResumeId) ??
    resumes?.find((r) => r.is_default) ??
    resumes?.[0];

  const matchQuery = useResumeMatch(resume?.id, jobId, resume?.parse_status === "ready");
  const analyzeMutation = useAnalyzeMatch(resume?.id, jobId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reAnalyze, setReAnalyze] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Synchronous re-entrancy guard: `analyzeMutation.isPending` only flips on
  // the NEXT render, so a fast double-click on the confirm button (two real
  // click events in the same tick) could otherwise fire mutate() twice before
  // the button disables — charging two credits for one click. A ref updates
  // immediately, closing that window.
  const submittingRef = useRef(false);

  // Auto-open the credit confirmation once when arriving from a deep link (the
  // extension's "Analyze"/"Re-analyze", or the AI Hub's "Run again") — only
  // after the resume is ready and the read (which carries the credit balance)
  // has loaded. Strips the intent params afterwards so a refresh or a
  // back-navigation doesn't re-open the dialog.
  const autoOpenedRef = useRef(false);
  const matchLoaded = matchQuery.data?.ok === true;
  useEffect(() => {
    if (autoOpenedRef.current || !autoAnalyze.analyze) return;
    if (!resume || resume.parse_status !== "ready" || !matchLoaded) return;
    autoOpenedRef.current = true;
    setReAnalyze(autoAnalyze.force);
    setConfirmOpen(true);
    onDeepLinkConsumed?.();
  }, [autoAnalyze.analyze, autoAnalyze.force, resume, matchLoaded, onDeepLinkConsumed]);

  // Switching resume also clears any lingering analyze error/result from the
  // previous resume's mutation (which is a single shared instance, not keyed by
  // resumeId) so a failed analysis on resume A doesn't flash its error banner
  // over resume B's card. B's own cached result comes from matchQuery, which IS
  // keyed by resumeId and refetches on switch.
  const handleSelectResume = (id: string) => {
    analyzeMutation.reset();
    setSelectedResumeId(id);
  };

  // Resume selector — shown only when there's a real choice to make (2+
  // resumes) and a resume is resolved. Disabled during an in-flight analysis
  // so the selected resume can't change mid-request.
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
      <MatchCardShell>
        <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
      </MatchCardShell>
    );
  }

  if (!resume) {
    return (
      <MatchCardShell>
        <p className="text-sm text-[oklch(0.45_0.02_265)]">
          Upload a resume to see your AI match score for this job.
        </p>
        <Link
          to="/dashboard/resumes"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Go to Resume Manager →
        </Link>
      </MatchCardShell>
    );
  }

  if (resume.parse_status === "pending" || resume.parse_status === "processing") {
    return (
      <MatchCardShell resumeName={resume.name} picker={picker}>
        <div className="flex items-center gap-2 text-sm text-[oklch(0.45_0.02_265)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing your resume…
        </div>
      </MatchCardShell>
    );
  }

  if (resume.parse_status === "failed") {
    return (
      <MatchCardShell resumeName={resume.name} picker={picker}>
        <div className="flex items-center gap-2 text-sm text-[#E11D48]">
          <AlertCircle className="h-4 w-4" /> Fix your resume before analyzing a match.
        </div>
        <Link
          to="/dashboard/resumes"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Go to Resume Manager →
        </Link>
      </MatchCardShell>
    );
  }

  if (matchQuery.isLoading) {
    return (
      <MatchCardShell resumeName={resume.name} picker={picker}>
        <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
      </MatchCardShell>
    );
  }

  const result = matchQuery.data;
  if (!result || !result.ok) {
    return (
      <MatchCardShell resumeName={resume.name} picker={picker}>
        <p className="text-sm text-[#E11D48]">Couldn't load your match status. Try again later.</p>
      </MatchCardShell>
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

  // Re-analyze is triggered from inside the report dialog now — close it and
  // open the same credit-confirmation flow the compact card used to show
  // inline. The updated result is visible the next time the user reopens the
  // report (or, once analysis completes, the card's own highlights update).
  const handleReanalyzeFromDialog = () => {
    setReportOpen(false);
    openConfirm(true);
  };

  // Friendly error copy only — the raw server/provider message is never shown
  // (it can carry OpenAI/rate-limit internals). AIErrorNotice maps the
  // structured code to copy, offers a retry where retrying can help, and only
  // claims "no credit was used" when the engine confirmed the refund.
  const failed = analyzeMutation.data && !analyzeMutation.data.ok ? analyzeMutation.data : null;
  const showError = Boolean(failed) || analyzeMutation.isError;
  const errorBanner = showError && (
    <AIErrorNotice
      code={failed?.code}
      creditsRefunded={failed?.creditsRefunded}
      onRetry={() => openConfirm(reAnalyze)}
      retryLabel="Try again"
      retrying={analyzeMutation.isPending}
      compact
    />
  );

  const analysis = result.analysis;
  // Up to two one-line highlights; falls back to a clamped summary line when
  // the AI returned no whatMatches items (rare — e.g. a very weak fit).
  const highlights = analysis?.whatMatches.slice(0, 2) ?? [];

  return (
    <>
      <MatchCardShell resumeName={result.resumeName ?? resume.name} picker={picker}>
        {analyzeMutation.isPending ? (
          // A first analysis has nothing to show underneath, so the wait IS the
          // card. A re-analysis keeps the existing result visible below (see
          // the `analysis` branch) rather than blanking a usable score.
          <AIThinkingPanel
            capability={AI_CAPABILITIES.RESUME_MATCH}
            title={analysis ? "Updating your match" : "Analyzing your match"}
            className="border-0 bg-transparent p-0"
          />
        ) : !analysis ? (
          <div className="space-y-3">
            {errorBanner}
            <p className="text-sm text-[oklch(0.45_0.02_265)]">
              See how well your resume matches this job, including what already fits and what to
              improve.
            </p>
            <DashButton
              onClick={() => openConfirm(false)}
              disabled={locked}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Analyze Match
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
                1 Credit
              </span>
            </DashButton>
            {locked && (
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                You've used all your AI credits.{" "}
                <NeedMoreCreditsLink variant="inline" context="resume match" />
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {errorBanner}

            {result.stale && (
              <AIOutdatedNotice
                changed="either"
                onRegenerate={() => openConfirm(true)}
                regenerateLabel="Re-analyze"
                busy={locked}
              />
            )}

            {/* Overall Match */}
            <div className="flex items-end justify-between">
              <p className="font-display text-4xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
                {analysis.overallScore}
                <span className="text-base font-medium text-[oklch(0.5_0.02_265)]">%</span>
              </p>
              <Chip tone={LABEL_TONE[analysis.matchLabel]}>{analysis.matchLabel}</Chip>
            </div>

            {/* Up to two short highlights */}
            {highlights.length > 0 ? (
              <ul className="space-y-1.5">
                {highlights.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                    <span className="line-clamp-1 text-[oklch(0.3_0.02_265)]" title={item}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="line-clamp-2 text-sm text-[oklch(0.35_0.02_265)]"
                title={analysis.summary}
              >
                {analysis.summary}
              </p>
            )}

            <DashButton
              variant="outline"
              size="sm"
              onClick={() => setReportOpen(true)}
              className="w-full"
            >
              <FileSearch className="h-3.5 w-3.5" /> View Full Report
            </DashButton>

            {/* Where this number came from (Module 6G). The resume is already
                named in the card header, so it isn't repeated here — only what
                the header can't say: when it ran, and whether it cost a credit. */}
            <AIMetaStrip
              generatedAt={analysis.createdAt}
              reused={analyzeMutation.data?.ok === true && analyzeMutation.data.cacheHit}
              className="border-t border-black/5 pt-3"
            />
          </div>
        )}
      </MatchCardShell>

      <AnalyzeMatchDialog
        open={confirmOpen}
        reAnalyze={reAnalyze}
        creditsRemaining={credits.creditsRemaining}
        isPending={analyzeMutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />

      {analysis && (
        <ResumeMatchReportDialog
          open={reportOpen}
          analysis={analysis}
          resumeId={resume.id}
          jobId={jobId}
          onReanalyze={handleReanalyzeFromDialog}
          reanalyzeDisabled={analyzeMutation.isPending || locked}
          reanalyzePending={analyzeMutation.isPending}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}
