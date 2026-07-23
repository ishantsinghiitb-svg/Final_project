import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowUpCircle,
} from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { cn } from "@/lib/utils";
import { useResumes } from "@/features/resumes/hooks";
import { useResumeMatch, useResumeMatchHistory, useAnalyzeMatch } from "@/features/ai/hooks";
import { MATCH_LABELS, matchLabelForScore, type MatchLabel } from "@/features/ai/matchLabel";
import { friendlyAIError } from "@/features/ai/errorMessages";
import type { Resume } from "@/types";
import { AnalyzeMatchDialog } from "./AnalyzeMatchDialog";

// ── AI Resume Match card (Module 6B) ──
//
// Separate product from Resume Health: AI-powered, job-specific, consumes
// credits. The card ONLY ever shows overallScore/matchLabel/whatMatches/
// whatToImprove/summary — no confidence, dimension scores, model/provider,
// or prompt/analysis version anywhere in this file. "View past analyses" is
// a deliberately low-emphasis text link, not a first-class section.

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

function MatchHistoryList({ resumeId, jobId }: { resumeId: string; jobId: string }) {
  const { data: history, isLoading } = useResumeMatchHistory(resumeId, jobId);

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
            {entry.score != null ? `${entry.score}% · ${matchLabelForScore(entry.score)}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ResumeMatchCard({ jobId }: { jobId: string }) {
  const { data: resumes, isLoading: resumesLoading } = useResumes();
  // null = "follow the default resume"; a concrete id = the user picked one.
  // A `?resume=` deep-link (the extension opening the dashboard on the resume
  // the user was viewing) preselects that resume — but it is read in the effect
  // BELOW, never in a render-phase initializer. Reading `window` during the
  // initial render made SSR (null) and the first client render (the param)
  // disagree → a hydration mismatch (React #418). Seeding to the SSR value here
  // and applying the param after mount keeps the first render identical on both.
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  // One-shot analyze intent from the extension deep-link (`?analyze=1[&force=1]`).
  const [autoAnalyze, setAutoAnalyze] = useState({ analyze: false, force: false });

  // Client-only, post-hydration: read the deep-link params. Runs after the
  // first render, so it can never cause a server/client render mismatch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeParam = params.get("resume");
    if (resumeParam) setSelectedResumeId(resumeParam);
    if (params.get("analyze") === "1") {
      setAutoAnalyze({ analyze: true, force: params.get("force") === "1" });
    }
  }, []);

  const resume =
    resumes?.find((r) => r.id === selectedResumeId) ??
    resumes?.find((r) => r.is_default) ??
    resumes?.[0];

  const matchQuery = useResumeMatch(resume?.id, jobId, resume?.parse_status === "ready");
  const analyzeMutation = useAnalyzeMatch(resume?.id, jobId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reAnalyze, setReAnalyze] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Synchronous re-entrancy guard: `analyzeMutation.isPending` only flips on
  // the NEXT render, so a fast double-click on the confirm button (two real
  // click events in the same tick) could otherwise fire mutate() twice before
  // the button disables — charging two credits for one click. A ref updates
  // immediately, closing that window.
  const submittingRef = useRef(false);

  // Auto-open the credit confirmation once when arriving from the extension's
  // "Analyze"/"Re-analyze" deep-link — only after the resume is ready and the
  // read (which carries the credit balance) has loaded. Strips the params so a
  // refresh or back-navigation doesn't re-trigger it.
  const autoOpenedRef = useRef(false);
  const matchLoaded = matchQuery.data?.ok === true;
  useEffect(() => {
    if (autoOpenedRef.current || !autoAnalyze.analyze) return;
    if (!resume || resume.parse_status !== "ready" || !matchLoaded) return;
    autoOpenedRef.current = true;
    setReAnalyze(autoAnalyze.force);
    setConfirmOpen(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("analyze");
      url.searchParams.delete("force");
      window.history.replaceState({}, "", url.toString());
    }
  }, [autoAnalyze, resume, matchLoaded]);

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

  // Friendly error copy only — the raw server/provider message is never shown
  // (it can carry OpenAI/rate-limit internals). Map by structured code instead.
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

  return (
    <>
      <MatchCardShell resumeName={result.resumeName ?? resume.name} picker={picker}>
        {!result.analysis ? (
          <div className="space-y-3">
            {errorBanner}
            <p className="text-sm text-[oklch(0.45_0.02_265)]">
              See how well your resume matches this job — what already fits, and what to improve.
            </p>
            <DashButton
              onClick={() => openConfirm(false)}
              disabled={analyzeMutation.isPending || locked}
              className="w-full"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Analyze Match · 1 credit
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
          <div className="space-y-5">
            {errorBanner}

            {result.stale && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-[#B45309]">
                Your resume or this job has changed since your last match. Re-analyze to update your
                result.
              </div>
            )}

            {/* Overall Match */}
            <div className="flex items-end justify-between">
              <p className="font-display text-4xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
                {result.analysis.overallScore}
                <span className="text-base font-medium text-[oklch(0.5_0.02_265)]">%</span>
              </p>
              <Chip tone={LABEL_TONE[result.analysis.matchLabel]}>
                {result.analysis.matchLabel}
              </Chip>
            </div>

            {/* What Matches */}
            {result.analysis.whatMatches.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                  What Matches
                </p>
                <ul className="mt-2 space-y-1.5">
                  {result.analysis.whatMatches.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                      <span className="text-[oklch(0.3_0.02_265)]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* What You Can Improve */}
            {result.analysis.whatToImprove.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                  What You Can Improve
                </p>
                <ul className="mt-2 space-y-1.5">
                  {result.analysis.whatToImprove.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                      <span className="text-[oklch(0.3_0.02_265)]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Summary */}
            <div className="rounded-lg bg-[oklch(0.97_0.01_265)] p-3 text-sm italic leading-relaxed text-[oklch(0.35_0.02_265)]">
              {result.analysis.summary}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-black/5 pt-3">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="text-xs text-[oklch(0.5_0.02_265)] hover:underline"
              >
                {historyOpen ? "Hide" : "View"} past analyses
              </button>
              <DashButton
                variant="outline"
                size="sm"
                onClick={() => openConfirm(true)}
                disabled={analyzeMutation.isPending || locked}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", analyzeMutation.isPending && "animate-spin")}
                />
                Re-analyze
              </DashButton>
            </div>

            {historyOpen && <MatchHistoryList resumeId={resume.id} jobId={jobId} />}
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
    </>
  );
}
