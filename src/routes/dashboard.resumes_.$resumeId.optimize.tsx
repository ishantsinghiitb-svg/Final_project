import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Sparkles, AlertCircle, Wand2, History, X } from "lucide-react";
import { toast } from "sonner";
import { DashCard, EmptyState } from "@/components/dashboard/primitives";
import { AIPage, AIPageHeader } from "@/components/dashboard/ai/AIPage";
import { aiErrorCopy, creditsReassurance } from "@/features/ai/errorMessages";
import { OptimizeSetupPanel } from "@/components/dashboard/optimizer/OptimizeSetupPanel";
import { OptimizeConfirmDialog } from "@/components/dashboard/optimizer/OptimizeConfirmDialog";
import { SuggestionReviewList } from "@/components/dashboard/optimizer/SuggestionReviewList";
import { TransformationRoadmap } from "@/components/dashboard/optimizer/TransformationRoadmap";
import { CareerSignalsSection } from "@/components/dashboard/optimizer/CareerSignalsSection";
import { SaveVersionDialog } from "@/components/dashboard/optimizer/SaveVersionDialog";
import { OptimizeSuccessPanel } from "@/components/dashboard/optimizer/OptimizeSuccessPanel";
import { useResumes, useResumeParsed } from "@/features/resumes/hooks";
import { useAICredits } from "@/features/ai/hooks";
import { useOptimizeResume, useSaveOptimizedVersion } from "@/features/optimizer/hooks";
import {
  composeOptimizedResume,
  renderResumeText,
  type ResumeDocument,
} from "@/features/optimizer/compose";
import { downloadResume, type DownloadFormat } from "@/features/optimizer/download";
import type { CareerCategoryId, OptimizeSectionId } from "@/features/optimizer/constants";
import { sanitizeCustomCategory } from "@/features/optimizer/constants";
import {
  loadOptimizerDraft,
  saveOptimizerDraft,
  clearOptimizerDraft,
} from "@/features/optimizer/draft";
import type {
  OptimizationResult,
  SavedResumeVersion,
  SuggestionDecision,
} from "@/features/optimizer/types";

export const Route = createFileRoute("/dashboard/resumes_/$resumeId/optimize")({
  head: () => ({
    meta: [{ title: "Optimize resume — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: OptimizeResumePage,
});

type Phase = "setup" | "review" | "success";

function OptimizeResumePage() {
  const { resumeId } = Route.useParams();
  const { data: resumes = [], isLoading: resumesLoading } = useResumes();
  const { data: parsed } = useResumeParsed(resumeId);
  const { data: credits } = useAICredits();

  const resume = useMemo(() => resumes.find((r) => r.id === resumeId) ?? null, [resumes, resumeId]);

  const optimize = useOptimizeResume();
  const saveVersion = useSaveOptimizedVersion();

  const [phase, setPhase] = useState<Phase>("setup");
  const [category, setCategory] = useState<CareerCategoryId>("general");
  const [customCategory, setCustomCategory] = useState("");
  const [sections, setSections] = useState<OptimizeSectionId[]>(["full"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SuggestionDecision>>({});
  const [savedVersion, setSavedVersion] = useState<SavedResumeVersion | null>(null);
  const [savedDoc, setSavedDoc] = useState<ResumeDocument | null>(null);
  // An unsaved optimization from a previous visit (persisted locally so the AI
  // work is never lost). Detected post-mount to avoid an SSR/client mismatch.
  const [draftAvailable, setDraftAvailable] = useState<{ savedAt: string } | null>(null);

  useEffect(() => {
    if (phase !== "setup") return;
    const draft = loadOptimizerDraft(resumeId);
    setDraftAvailable(draft ? { savedAt: draft.savedAt } : null);
  }, [resumeId, phase]);

  // Persist the in-progress review (result + accept/reject decisions) so closing
  // the page or navigating away never discards a completed optimization.
  useEffect(() => {
    if (phase === "review" && result) {
      saveOptimizerDraft(resumeId, { result, decisions, savedAt: new Date().toISOString() });
    }
  }, [phase, result, decisions, resumeId]);

  function resumeDraft() {
    const draft = loadOptimizerDraft(resumeId);
    if (!draft) {
      setDraftAvailable(null);
      return;
    }
    setResult(draft.result);
    setDecisions(draft.decisions);
    setCategory(draft.result.category);
    setSections(draft.result.sections);
    if (draft.result.category === "other") setCustomCategory(draft.result.categoryLabel);
    setDraftAvailable(null);
    setPhase("review");
  }

  function discardDraft() {
    clearOptimizerDraft(resumeId);
    setDraftAvailable(null);
  }

  const creditsRemaining = credits?.creditsRemaining ?? 0;
  const acceptedSuggestions = useMemo(
    () => (result ? result.suggestions.filter((s) => decisions[s.id] === "accepted") : []),
    [result, decisions],
  );

  async function runOptimize() {
    // `mutateAsync` REJECTS on a transport-level failure (offline, a dropped
    // worker request) rather than returning a structured envelope. Without this
    // catch the rejection is unhandled and nothing ever clears `isPending`, so
    // the confirm dialog sits on its loading state forever with no way out.
    let res;
    try {
      res = await optimize.mutateAsync({
        resumeId,
        category,
        customCategory: sanitizeCustomCategory(customCategory),
        sections,
      });
    } catch {
      const copy = aiErrorCopy(undefined);
      toast.error(copy.title, { description: copy.body });
      setConfirmOpen(false);
      return;
    }
    if (!res.ok) {
      // Never `res.message` — the raw engine text can carry provider internals
      // (rate-limit strings, model ids). Map the structured code instead, and
      // state plainly when the run cost nothing.
      const copy = aiErrorCopy(res.code);
      toast.error(copy.title, {
        description: [copy.body, creditsReassurance(res.creditsRefunded)].filter(Boolean).join(" "),
      });
      // Keep the confirm dialog on a hard limit so the upgrade path is visible.
      if (res.code !== "ai_limit_reached") setConfirmOpen(false);
      return;
    }
    setResult(res.result);
    setDecisions(
      Object.fromEntries(
        res.result.suggestions.map((s) => [s.id, "pending" as SuggestionDecision]),
      ),
    );
    setConfirmOpen(false);
    setPhase("review");
    if (res.result.suggestions.length === 0) {
      toast.info("No safe improvements were found", {
        description:
          "Your resume already holds up for this selection. Try another section or category.",
      });
    } else if (res.result.cacheHit) {
      // "Reused" is the wording used everywhere in 6G — never "cache hit" — and
      // the no-charge benefit is stated rather than left for the user to infer.
      toast.success("Reused your earlier optimization", {
        description: `${res.result.suggestions.length} suggestions ready. No credit was used.`,
      });
    } else {
      toast.success("Optimization ready", {
        description: `${res.result.suggestions.length} suggestions to review.`,
      });
    }
  }

  function setDecision(id: string, decision: SuggestionDecision) {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
  }
  function setAll(decision: SuggestionDecision) {
    if (!result) return;
    setDecisions(Object.fromEntries(result.suggestions.map((s) => [s.id, decision])));
  }

  async function handleSave(name: string) {
    if (!parsed?.structured || !result) {
      toast.error("Your resume is still loading. Try again in a moment.");
      return;
    }
    const doc = composeOptimizedResume(parsed.structured, acceptedSuggestions);
    const content = renderResumeText(doc);
    try {
      const version = await saveVersion.mutateAsync({
        resumeId,
        name,
        content,
        result,
        decisions,
      });
      setSavedVersion(version);
      setSavedDoc(doc);
      setSaveOpen(false);
      setPhase("success");
      // The optimization is now an applied version — the local draft is done.
      clearOptimizerDraft(resumeId);
      toast.success("New resume version created.");
    } catch {
      toast.error("Couldn't save the version. Please try again.");
    }
  }

  async function handleDownload(format: DownloadFormat) {
    if (!savedDoc || !savedVersion) return;
    try {
      await downloadResume(savedDoc, savedVersion.name, format);
    } catch (err) {
      // `downloadResume` throws only library errors (jsPDF / docx), whose text
      // is developer-facing — so the user gets our own wording, not theirs.
      toast.error("Couldn't build that file", {
        description: "Try a different format, or download again in a moment.",
      });
    }
  }

  const defaultVersionName = resume ? `${resume.name} v2` : "Optimized resume v2";
  const resumeReady = resume?.parse_status === "ready";

  return (
    // Shared AI frame (Module 6G): same measure and rhythm as the AI Hub and the
    // Cover Letter Studio, so moving between AI features doesn't shift the page.
    // `bottomGutter` clears the fixed review action bar below.
    <AIPage bottomGutter>
      <AIPageHeader
        backTo="/dashboard/resumes"
        backLabel="Resumes"
        icon={Wand2}
        title="Resume Optimization Studio"
        subtitle={
          resume
            ? `${resume.name}${phase === "review" && result ? ` · optimized for ${result.categoryLabel}` : ""}`
            : undefined
        }
      />

      {/* Body */}
      {resumesLoading ? (
        <div className="grid place-items-center py-20 text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !resume ? (
        <EmptyState
          icon={AlertCircle}
          title="Resume not found"
          body="This resume doesn't exist or isn't available. Head back to your library."
          cta={
            <Link
              to="/dashboard/resumes"
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to resumes
            </Link>
          }
        />
      ) : !resumeReady ? (
        <DashCard className="border-[#F59E0B]/20 bg-[#F59E0B]/[0.04]">
          <div className="flex gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
            <div>
              <p className="text-sm font-medium text-[oklch(0.3_0.02_265)]">
                This resume isn't ready to optimize yet
              </p>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">
                It needs to finish parsing first. Go back to the resume, make sure parsing
                succeeded, then return here.
              </p>
            </div>
          </div>
        </DashCard>
      ) : phase === "success" && savedVersion ? (
        <OptimizeSuccessPanel version={savedVersion} onDownload={handleDownload} />
      ) : phase === "review" && result ? (
        <>
          <div className="mx-auto max-w-3xl space-y-4">
            {/* 1-3. Action-first: the prioritized changes come immediately (verdict is
                moved to the bottom so users act before they read explanations). */}
            <SuggestionReviewList
              suggestions={result.suggestions}
              decisions={decisions}
              auditSummary=""
              summary=""
              onAccept={(id) => setDecision(id, "accepted")}
              onReject={(id) => setDecision(id, "rejected")}
              onUndo={(id) => setDecision(id, "pending")}
              onAcceptAll={() => setAll("accepted")}
              onRejectAll={() => setAll("rejected")}
            />

            {/* 5-8. The analysis: readiness/potential, scorecard, strengths, gaps. */}
            <TransformationRoadmap result={result} showBenchmark={false} />

            {/* 9. Career signals — recruiter expectations beyond the current resume. */}
            <CareerSignalsSection
              signals={result.careerSignals}
              categoryLabel={result.categoryLabel}
            />

            {/* 10-11. Reviewer's verdict + benchmark, last (the "why", after the "what to do"). */}
            {(result.auditSummary || result.benchmark) && (
              <DashCard>
                {result.auditSummary && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                      Reviewer's verdict
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">
                      {result.auditSummary}
                    </p>
                  </div>
                )}
                {result.benchmark && (
                  <div className={result.auditSummary ? "mt-3 border-t border-black/5 pt-3" : ""}>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                      What a top {result.categoryLabel} resume looks like
                    </p>
                    <p className="mt-1.5 text-sm italic leading-relaxed text-[oklch(0.4_0.02_265)]">
                      {result.benchmark}
                    </p>
                  </div>
                )}
              </DashCard>
            )}
          </div>

          {/* Sticky action bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/90 backdrop-blur lg:left-60">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-5">
              <button
                onClick={() => {
                  setPhase("setup");
                  setResult(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
              >
                <ArrowLeft className="h-4 w-4" /> New optimization
              </button>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-[oklch(0.45_0.02_265)] sm:inline">
                  {acceptedSuggestions.length} change
                  {acceptedSuggestions.length === 1 ? "" : "s"} selected
                </span>
                <button
                  onClick={() => setSaveOpen(true)}
                  disabled={acceptedSuggestions.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0"
                >
                  <Sparkles className="h-4 w-4" /> Save new version
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {draftAvailable && (
            <DashCard className="border-[#2563EB]/20 bg-[#2563EB]/[0.03]">
              <div className="flex flex-wrap items-center gap-3">
                <History className="h-4 w-4 shrink-0 text-[#2563EB]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[oklch(0.28_0.02_265)]">
                    You have an unsaved optimization
                  </p>
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">
                    Draft from{" "}
                    {new Date(draftAvailable.savedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    — pick up exactly where you left off, no credit needed.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={discardDraft}
                    className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.45_0.02_265)] transition-colors hover:bg-black/[0.03]"
                  >
                    <X className="h-3.5 w-3.5" /> Discard
                  </button>
                  <button
                    onClick={resumeDraft}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-px"
                  >
                    Resume draft
                  </button>
                </div>
              </div>
            </DashCard>
          )}
          <OptimizeSetupPanel
            category={category}
            onCategoryChange={setCategory}
            customCategory={customCategory}
            onCustomCategoryChange={setCustomCategory}
            sections={sections}
            onSectionsChange={setSections}
            onOptimize={() => setConfirmOpen(true)}
            disabled={optimize.isPending}
          />
        </div>
      )}

      <OptimizeConfirmDialog
        open={confirmOpen}
        reOptimize={Boolean(result)}
        creditsRemaining={creditsRemaining}
        isPending={optimize.isPending}
        onConfirm={() => void runOptimize()}
        onCancel={() => setConfirmOpen(false)}
      />

      <SaveVersionDialog
        open={saveOpen}
        defaultName={defaultVersionName}
        acceptedCount={acceptedSuggestions.length}
        isPending={saveVersion.isPending}
        onSave={(name) => void handleSave(name)}
        onCancel={() => setSaveOpen(false)}
      />
    </AIPage>
  );
}
