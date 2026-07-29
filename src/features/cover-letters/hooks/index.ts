import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import type { AIFailure } from "@/features/ai/types";
import { coverLetterService } from "@/services/CoverLetterService";
import { coverLetterAIClient } from "@/services/coverLetters/CoverLetterAIClient";
import type { CoverLetter, CoverLetterVersion } from "@/types";
import {
  COVER_LETTER_AI_ACTIONS,
  VERSION_SOURCES,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterStatus,
  type CoverLetterTone,
} from "../constants";
import type { CoverLetterAIResult, CoverLetterExplanation, CoverLetterGeneration } from "../types";

// ── Cover Letter Studio hooks (Module 6E) ──
//
// Every AI mutation invalidates the shared AI credit key so the balance
// refreshes everywhere after a run (parallel to useAnalyzeMatch / useAnalyzeAts
// / useOptimizeResume). Non-AI mutations never touch it — editing, saving,
// renaming, duplicating and exporting cost nothing.

export const coverLetterKeys = {
  all: ["cover-letters"] as const,
  byUser: (userId: string) => [...coverLetterKeys.all, "by-user", userId] as const,
  detail: (id: string) => [...coverLetterKeys.all, "detail", id] as const,
  versions: (id: string) => [...coverLetterKeys.all, "versions", id] as const,
  byJob: (userId: string, jobId: string) =>
    [...coverLetterKeys.all, "by-job", userId, jobId] as const,
};

/** Lists the current user's cover letters — powers the History page and the Cover Letter Association picker. */
export function useCoverLetters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: coverLetterKeys.byUser(user?.id ?? ""),
    queryFn: () => coverLetterService.getCoverLetters(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

/** A single Studio document. */
export function useCoverLetter(id: string | undefined) {
  return useQuery({
    queryKey: coverLetterKeys.detail(id ?? ""),
    queryFn: () => coverLetterService.getCoverLetter(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1_000,
  });
}

/** A document's versions, newest first — the version switcher. */
export function useCoverLetterVersions(id: string | undefined) {
  return useQuery({
    queryKey: coverLetterKeys.versions(id ?? ""),
    queryFn: () => coverLetterService.getVersions(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1_000,
  });
}

/** Letters already written for a job — the job-detail entry point. */
export function useCoverLettersForJob(jobId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: coverLetterKeys.byJob(user?.id ?? "", jobId ?? ""),
    queryFn: () => coverLetterService.getCoverLettersForJob(user!.id, jobId!),
    enabled: Boolean(user) && Boolean(jobId),
    staleTime: 30 * 1_000,
  });
}

export function useUploadCoverLetter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => {
      if (!user) throw new Error("Not authenticated");
      return coverLetterService.uploadCoverLetter(user.id, name, file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.all });
    },
  });
}

// ── Generation ────────────────────────────────────────────────────────────

export type CreateCoverLetterArgs = {
  name: string;
  resumeId: string;
  jobId: string;
  companyName: string | null;
  roleTitle: string | null;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

export type CreateCoverLetterResult =
  { ok: true; coverLetter: CoverLetter; generation: CoverLetterGeneration } | AIFailure;

/**
 * Generate a letter AND create the Studio document that holds it, in one step.
 * The caller must show the credit-confirmation dialog BEFORE invoking this —
 * the mutation only executes, it never confirms.
 *
 * The document is created only after a successful generation, so a failed or
 * credit-blocked run never leaves an empty letter behind in the user's history.
 */
export function useCreateCoverLetter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateCoverLetterArgs): Promise<CreateCoverLetterResult> => {
      if (!user) throw new Error("Not authenticated");

      const res = await coverLetterAIClient.generate({
        resumeId: args.resumeId,
        jobId: args.jobId,
        tone: args.tone,
        length: args.length,
        customInstructions: args.customInstructions,
      });
      if (!res.ok) {
        return {
          ok: false,
          code: res.code,
          message: res.message,
          creditsRefunded: res.creditsRefunded,
        };
      }

      const { coverLetter } = await coverLetterService.createFromGeneration(user.id, {
        name: args.name,
        content: res.generation.content,
        jobId: args.jobId,
        resumeId: args.resumeId,
        companyName: args.companyName,
        roleTitle: args.roleTitle,
        tone: res.generation.tone,
        length: res.generation.length,
        customInstructions: args.customInstructions,
        analysisId: res.generation.analysisId,
        model: res.generation.model,
        promptVersion: res.generation.promptVersion,
        analysisVersion: res.generation.analysisVersion,
        // A first generation always opens a session (see CoverLetterAIService) —
        // this is the id the document's free refinement actions will check against.
        sessionId: res.generation.sessionId ?? crypto.randomUUID(),
      });

      return { ok: true, coverLetter, generation: res.generation };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.all });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
      // The run is now in the audit log, so the AI Hub timeline is a row stale.
      void queryClient.invalidateQueries({ queryKey: aiKeys.activity(user?.id ?? "") });
    },
  });
}

export type RunAIActionArgs = {
  coverLetterId: string;
  action: CoverLetterAIAction;
  /** The letter as it stands in the editor right now. */
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  targetTone?: CoverLetterTone;
  targetLength?: CoverLetterLength;
};

/**
 * Run one AI action and persist the result as a new version. Each action is an
 * independent provider call and costs one credit. The result is saved
 * immediately — an AI edit the user paid for is never left unsaved.
 */
export function useRunCoverLetterAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: RunAIActionArgs,
    ): Promise<CoverLetterAIResult & { versionId?: string }> => {
      if (!user) throw new Error("Not authenticated");

      const res = await coverLetterAIClient.runAction({
        coverLetterId: args.coverLetterId,
        action: args.action,
        content: args.content,
        resumeId: args.resumeId,
        jobId: args.jobId,
        tone: args.tone,
        length: args.length,
        customInstructions: args.customInstructions,
        targetTone: args.targetTone,
        targetLength: args.targetLength,
      });
      if (!res.ok) return res;

      const { version } = await coverLetterService.saveVersion(user.id, args.coverLetterId, {
        content: res.generation.content,
        source:
          args.action === COVER_LETTER_AI_ACTIONS.REGENERATE_ALL
            ? VERSION_SOURCES.GENERATE
            : VERSION_SOURCES.AI_ACTION,
        aiAction: args.action,
        tone: res.generation.tone,
        length: res.generation.length,
        customInstructions: args.customInstructions ?? null,
        analysisId: res.generation.analysisId,
        model: res.generation.model,
        promptVersion: res.generation.promptVersion,
        analysisVersion: res.generation.analysisVersion,
      });

      return { ...res, versionId: version.id };
    },
    onSuccess: (_res, args) => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.detail(args.coverLetterId) });
      void queryClient.invalidateQueries({
        queryKey: coverLetterKeys.versions(args.coverLetterId),
      });
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.byUser(user?.id ?? "") });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
      // Only a charged action (Regenerate entire letter) adds a Hub row; the
      // free refinements are filtered out of the timeline by design. Refreshing
      // on both is simpler than tracking which action ran, and costs one cheap
      // read of an already-cached list.
      void queryClient.invalidateQueries({ queryKey: aiKeys.activity(user?.id ?? "") });
    },
  });
}

export type ExplainCoverLetterArgs = {
  coverLetterId: string;
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

export type ExplainCoverLetterMutationResult =
  { ok: true; explanation: CoverLetterExplanation } | AIFailure;

/**
 * Explain the tone/structure/highlights of the current letter. Free whenever
 * the document has an active editing session — never charges or refunds a
 * credit, so unlike the other AI mutations this doesn't invalidate the
 * credits query.
 */
export function useExplainCoverLetter() {
  return useMutation({
    mutationFn: (args: ExplainCoverLetterArgs): Promise<ExplainCoverLetterMutationResult> =>
      coverLetterAIClient.explain(args),
  });
}

// ── Non-AI mutations (0 credits) ──────────────────────────────────────────

function useDocumentMutation<TArgs extends { coverLetterId: string }, TResult>(
  fn: (args: TArgs, userId: string) => Promise<TResult>,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => {
      if (!user) throw new Error("Not authenticated");
      return fn(args, user.id);
    },
    onSuccess: (_res, args) => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.detail(args.coverLetterId) });
      void queryClient.invalidateQueries({
        queryKey: coverLetterKeys.versions(args.coverLetterId),
      });
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.byUser(user?.id ?? "") });
    },
  });
}

/** Save the editor's current text as a new version (manual edit, restore or duplicate). */
export function useSaveCoverLetterVersion() {
  return useDocumentMutation<
    {
      coverLetterId: string;
      content: string;
      source?: string;
      label?: string | null;
      tone?: CoverLetterTone;
      length?: CoverLetterLength;
    },
    { version: CoverLetterVersion }
  >(async (args, userId) =>
    coverLetterService.saveVersion(userId, args.coverLetterId, {
      content: args.content,
      source: args.source ?? VERSION_SOURCES.MANUAL,
      label: args.label ?? null,
      tone: args.tone ?? null,
      length: args.length ?? null,
    }),
  );
}

/**
 * Switch the document to an existing version. A pointer move, not a new version
 * — nothing new was authored, so nothing is appended to history.
 */
export function useSetCurrentCoverLetterVersion() {
  return useDocumentMutation<{ coverLetterId: string; version: CoverLetterVersion }, CoverLetter>(
    (args) => coverLetterService.setCurrentVersion(args.coverLetterId, args.version),
  );
}

/** Rename the document. */
export function useRenameCoverLetter() {
  return useDocumentMutation<{ coverLetterId: string; name: string }, CoverLetter>((args) =>
    coverLetterService.rename(args.coverLetterId, args.name),
  );
}

/** Label a version. */
export function useRenameCoverLetterVersion() {
  return useDocumentMutation<
    { coverLetterId: string; versionId: string; label: string | null },
    CoverLetterVersion
  >((args) => coverLetterService.renameVersion(args.versionId, args.label));
}

/** Move the document between Draft / Final / Downloaded. */
export function useSetCoverLetterStatus() {
  return useDocumentMutation<{ coverLetterId: string; status: CoverLetterStatus }, CoverLetter>(
    (args) => coverLetterService.setStatus(args.coverLetterId, args.status),
  );
}

/** Persist tone / length / custom instructions without touching the letter text. */
export function useUpdateCoverLetterSettings() {
  return useDocumentMutation<
    {
      coverLetterId: string;
      tone?: CoverLetterTone;
      length?: CoverLetterLength;
      customInstructions?: string | null;
    },
    CoverLetter
  >((args) =>
    coverLetterService.updateSettings(args.coverLetterId, {
      tone: args.tone,
      length: args.length,
      customInstructions: args.customInstructions,
    }),
  );
}

/** Duplicate a whole document — the copy starts fresh at Version 1. */
export function useDuplicateCoverLetter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, name }: { source: CoverLetter; name: string }) => {
      if (!user) throw new Error("Not authenticated");
      return coverLetterService.duplicateDocument(user.id, source, name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.all });
    },
  });
}

export function useDeleteCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => coverLetterService.deleteCoverLetter(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.all });
    },
  });
}
