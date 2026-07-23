import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Sparkles, AlertCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DashCard, EmptyState } from "@/components/dashboard/primitives";
import { OptimizeSetupPanel } from "@/components/dashboard/optimizer/OptimizeSetupPanel";
import { OptimizeConfirmDialog } from "@/components/dashboard/optimizer/OptimizeConfirmDialog";
import { SuggestionReviewList } from "@/components/dashboard/optimizer/SuggestionReviewList";
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
import type {
  OptimizationResult,
  SavedResumeVersion,
  SuggestionDecision,
} from "@/features/optimizer/types";

export const Route = createFileRoute("/dashboard/resumes_/$resumeId/optimize")({
  head: () => ({
    meta: [{ title: "Optimize resume — NextOffer" }, { name: "robots", content: "noindex" }],
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
  const [sections, setSections] = useState<OptimizeSectionId[]>(["full"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SuggestionDecision>>({});
  const [savedVersion, setSavedVersion] = useState<SavedResumeVersion | null>(null);
  const [savedDoc, setSavedDoc] = useState<ResumeDocument | null>(null);

  const creditsRemaining = credits?.creditsRemaining ?? 0;
  const acceptedSuggestions = useMemo(
    () => (result ? result.suggestions.filter((s) => decisions[s.id] === "accepted") : []),
    [result, decisions],
  );

  async function runOptimize() {
    const res = await optimize.mutateAsync({ resumeId, category, sections });
    if (!res.ok) {
      toast.error(res.message || "Optimization failed.");
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
      toast.info("No safe improvements were found for this selection.");
    } else if (res.result.cacheHit) {
      toast.success("Loaded your previous optimization (no credit used).");
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
        category,
        result,
      });
      setSavedVersion(version);
      setSavedDoc(doc);
      setSaveOpen(false);
      setPhase("success");
      toast.success("New resume version created.");
    } catch {
      toast.error("Couldn't save the version. Please try again.");
    }
  }

  function handleDownload(format: DownloadFormat) {
    if (!savedDoc || !savedVersion) return;
    try {
      downloadResume(savedDoc, savedVersion.name, format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    }
  }

  const defaultVersionName = resume ? `${resume.name} v2` : "Optimized resume v2";
  const resumeReady = resume?.parse_status === "ready";

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      {/* Header */}
      <div>
        <Link
          to="/dashboard/resumes"
          className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.45_0.02_265)] transition-colors hover:text-[#2563EB]"
        >
          <ArrowLeft className="h-4 w-4" /> Resumes
        </Link>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Wand2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="font-display text-[22px] font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
              Resume Optimization Studio
            </h1>
            {resume && (
              <p className="text-sm text-[oklch(0.45_0.02_265)]">
                {resume.name}
                {phase === "review" && result ? " · review each change below" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

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
          <SuggestionReviewList
            suggestions={result.suggestions}
            decisions={decisions}
            summary={result.summary}
            onAccept={(id) => setDecision(id, "accepted")}
            onReject={(id) => setDecision(id, "rejected")}
            onUndo={(id) => setDecision(id, "pending")}
            onAcceptAll={() => setAll("accepted")}
            onRejectAll={() => setAll("rejected")}
          />

          {/* Sticky action bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/90 backdrop-blur lg:left-[240px]">
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
        <OptimizeSetupPanel
          category={category}
          onCategoryChange={setCategory}
          sections={sections}
          onSectionsChange={setSections}
          onOptimize={() => setConfirmOpen(true)}
          disabled={optimize.isPending}
        />
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
    </div>
  );
}
