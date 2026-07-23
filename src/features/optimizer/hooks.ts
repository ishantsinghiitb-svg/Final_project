import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import { resumeService } from "@/services/ResumeService";
import { resumeKeys } from "@/features/resumes/hooks";
import { optimizerClient } from "@/services/optimizer/OptimizerClient";
import type { CareerCategoryId, OptimizeSectionId } from "./constants";
import type { OptimizationResult, SavedResumeVersion } from "./types";

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

export type OptimizeArgs = {
  resumeId: string;
  category: CareerCategoryId;
  sections: OptimizeSectionId[];
  forceRefresh?: boolean;
};

/**
 * Run an optimization. The caller must show the credit-confirmation dialog
 * BEFORE invoking this — the mutation only executes, it never confirms.
 */
export function useOptimizeResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: OptimizeArgs) =>
      optimizerClient.optimize(args.resumeId, args.category, args.sections, args.forceRefresh),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
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
  category: CareerCategoryId;
  result: OptimizationResult;
};

/**
 * Save the reviewed, accepted optimization as a NEW resume version (never an
 * overwrite). Returns the created version so the caller can offer download.
 */
export function useSaveOptimizedVersion() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveVersionArgs): Promise<SavedResumeVersion> => {
      const version = await resumeService.saveVersion(args.resumeId, {
        content: args.content,
        name: args.name,
        source: "optimizer",
        category: args.category,
        analysisId: args.result.id,
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
