import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import { resumeService } from "@/services/ResumeService";
import { resumeKeys } from "@/features/resumes/hooks";
import { optimizerClient, type OptimizeParams } from "@/services/optimizer/OptimizerClient";
import type { Json } from "@/types/database";
import type {
  OptimizationChange,
  OptimizationRecord,
  OptimizationResult,
  SavedResumeVersion,
  SuggestionDecision,
} from "./types";

// ── Resume Optimizer hooks (Module 6D) ──
//
// The optimize mutation reuses the AI credit query key so the credit balance
// refreshes everywhere after a run (parallel to useAnalyzeMatch / useAnalyzeAts).
// Saving a version reuses the resumes query keys so a new version shows up in
// the resume detail without a manual refetch.

export const optimizerKeys = {
  all: ["optimizer"] as const,
  versions: (resumeId: string) => [...optimizerKeys.all, "versions", resumeId] as const,
};

export type OptimizeArgs = OptimizeParams;

/**
 * Run an optimization. The caller must show the credit-confirmation dialog
 * BEFORE invoking this — the mutation only executes, it never confirms.
 */
export function useOptimizeResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: OptimizeArgs) => optimizerClient.optimize(args),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
      // The run is now in the audit log, so the AI Hub timeline is a row stale.
      void queryClient.invalidateQueries({ queryKey: aiKeys.activity(user?.id ?? "") });
    },
  });
}

/** Versions saved for a resume, newest first (the "switch between versions" surface). */
export function useResumeVersionsList(resumeId: string | undefined) {
  return useQuery({
    queryKey: optimizerKeys.versions(resumeId ?? ""),
    queryFn: () => resumeService.getVersions(resumeId!),
    enabled: Boolean(resumeId),
    staleTime: 30 * 1_000,
  });
}

export type SaveVersionArgs = {
  resumeId: string;
  name: string;
  content: string;
  result: OptimizationResult;
  /** Per-suggestion decisions at save time — persisted as durable history. */
  decisions: Record<string, SuggestionDecision>;
};

/** Build the durable, reopen-months-later change record (accepted + rejected). */
function buildOptimizationRecord(
  result: OptimizationResult,
  decisions: Record<string, SuggestionDecision>,
): OptimizationRecord {
  const changes: OptimizationChange[] = result.suggestions
    .filter((s) => decisions[s.id] === "accepted" || decisions[s.id] === "rejected")
    .map((s) => ({
      decision: decisions[s.id] as "accepted" | "rejected",
      kind: s.kind,
      section: s.section,
      target: s.target,
      action: s.action,
      current: s.current,
      suggested: s.suggested,
      reason: s.reason,
      how: s.how,
      benefit: s.benefit,
      example: s.example,
      changeType: s.changeType,
    }));
  return {
    category: result.category,
    categoryLabel: result.categoryLabel,
    savedAt: new Date().toISOString(),
    auditSummary: result.auditSummary,
    changes,
  };
}

/**
 * Save the reviewed, accepted optimization as a NEW resume version (never an
 * overwrite). Returns the created version so the caller can offer download.
 */
export function useSaveOptimizedVersion() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveVersionArgs): Promise<SavedResumeVersion> => {
      // Store the resolved, human-readable label (e.g. "GenAI Engineer" for a
      // custom target) — versions are read-only history, never looked up by id.
      const version = await resumeService.saveVersion(args.resumeId, {
        content: args.content,
        name: args.name,
        source: "optimizer",
        category: args.result.categoryLabel,
        analysisId: args.result.id,
        optimization: buildOptimizationRecord(args.result, args.decisions) as unknown as Json,
      });
      return {
        id: version.id,
        resumeId: version.resume_id,
        versionNumber: version.version_number,
        name: version.name ?? args.name,
        createdAt: version.created_at,
      };
    },
    onSuccess: (_v, args) => {
      void queryClient.invalidateQueries({ queryKey: optimizerKeys.versions(args.resumeId) });
      void queryClient.invalidateQueries({ queryKey: resumeKeys.byUser(user?.id ?? "") });
    },
  });
}
