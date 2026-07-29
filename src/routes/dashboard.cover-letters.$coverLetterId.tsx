import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Copy,
  FileText,
  Loader2,
  PenLine,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Chip, DashCard, EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { CoverLetterEditor } from "@/components/dashboard/cover-letters/CoverLetterEditor";
import { VersionsPanel } from "@/components/dashboard/cover-letters/VersionsPanel";
import { AIActionsPanel } from "@/components/dashboard/cover-letters/AIActionsPanel";
import { GenerationSettingsPanel } from "@/components/dashboard/cover-letters/GenerationSettingsPanel";
import { StatisticsPanel } from "@/components/dashboard/cover-letters/StatisticsPanel";
import {
  DialogDangerButton,
  DialogSecondaryButton,
  NamePromptDialog,
  StudioDialog,
} from "@/components/dashboard/cover-letters/StudioDialog";
import {
  useCoverLetter,
  useCoverLetterVersions,
  useDeleteCoverLetter,
  useDuplicateCoverLetter,
  useExplainCoverLetter,
  useRenameCoverLetter,
  useRenameCoverLetterVersion,
  useRunCoverLetterAction,
  useSaveCoverLetterVersion,
  useSetCoverLetterStatus,
  useSetCurrentCoverLetterVersion,
  useUpdateCoverLetterSettings,
} from "@/features/cover-letters/hooks";
import {
  AI_ACTION_LABELS,
  COVER_LETTER_AI_ACTIONS,
  COVER_LETTER_STATUSES,
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  VERSION_SOURCES,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterStatus,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { computeStats, formatGenerationMeta } from "@/features/cover-letters/stats";
import {
  copyToClipboard,
  downloadCoverLetter,
  type CoverLetterExportFormat,
} from "@/features/cover-letters/export";
import {
  clearCoverLetterDraft,
  loadCoverLetterDraft,
  saveCoverLetterDraft,
} from "@/features/cover-letters/draft";
import { useUndoRedo } from "@/features/cover-letters/useUndoRedo";
import { useAICredits } from "@/features/ai/hooks";
import { aiErrorCopy, creditsReassurance, friendlyAIError } from "@/features/ai/errorMessages";
import { AIPage, AIPageHeader } from "@/components/dashboard/ai/AIPage";
import { useResumes } from "@/features/resumes/hooks";
import type { CoverLetterExplanation } from "@/features/cover-letters/types";
import type { CoverLetterVersion } from "@/types";

// ── Cover Letter Studio (Module 6E) ──
//
// Three columns, matching the spec: versions/history on the left, the editor in
// the centre, AI actions + settings + statistics on the right. It sits inside
// the dashboard's standard <main> padding — no custom max-width and no extra
// horizontal inset — so its margins line up exactly with Job Details and the
// resume pages.
//
// The editor buffer is the single source of truth while the user works. It is
// mirrored to localStorage on every keystroke (so a refresh never loses work)
// and only written to the database when the user saves, when an AI action
// produces a new version, or when a version is restored.

export const Route = createFileRoute("/dashboard/cover-letters/$coverLetterId")({
  head: () => ({
    meta: [{ title: "Cover Letter Studio — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: CoverLetterStudioPage,
});

function CoverLetterStudioPage() {
  const { coverLetterId } = Route.useParams();
  const navigate = useNavigate();

  const { data: letter, isLoading, isError } = useCoverLetter(coverLetterId);
  const { data: versions = [], isLoading: versionsLoading } = useCoverLetterVersions(coverLetterId);
  const { data: credits } = useAICredits();
  const { data: resumes = [] } = useResumes();

  const runAction = useRunCoverLetterAction();
  const saveVersion = useSaveCoverLetterVersion();
  const renameLetter = useRenameCoverLetter();
  const renameVersion = useRenameCoverLetterVersion();
  const duplicateLetter = useDuplicateCoverLetter();
  const deleteLetter = useDeleteCoverLetter();
  const setStatus = useSetCoverLetterStatus();
  const setCurrentVersion = useSetCurrentCoverLetterVersion();
  const updateSettings = useUpdateCoverLetterSettings();
  const explainLetter = useExplainCoverLetter();

  const editor = useUndoRedo("");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState("");
  const [runningAction, setRunningAction] = useState<CoverLetterAIAction | null>(null);

  const [tone, setTone] = useState<CoverLetterTone>(DEFAULT_TONE);
  const [length, setLength] = useState<CoverLetterLength>(DEFAULT_LENGTH);
  const [instructions, setInstructions] = useState("");

  const [renamingLetter, setRenamingLetter] = useState(false);
  const [duplicatingLetter, setDuplicatingLetter] = useState(false);
  const [deletingLetter, setDeletingLetter] = useState(false);
  const [labellingVersion, setLabellingVersion] = useState<CoverLetterVersion | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ content: string; savedAt: string } | null>(
    null,
  );
  const [explanation, setExplanation] = useState<CoverLetterExplanation | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  /** The exact text the current `explanation` describes — used to detect staleness. */
  const [explainedContent, setExplainedContent] = useState<string | null>(null);

  // ── Load the document into the editor exactly once per document ──
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!letter || loadedIdRef.current === letter.id) return;
    loadedIdRef.current = letter.id;

    const stored = letter.content ?? "";
    editor.reset(stored);
    setSavedContent(stored);
    setActiveVersionId(letter.current_version_id ?? null);
    setTone((letter.tone as CoverLetterTone) ?? DEFAULT_TONE);
    setLength((letter.length as CoverLetterLength) ?? DEFAULT_LENGTH);
    setInstructions(letter.custom_instructions ?? "");

    // A local draft newer than the saved text means the user was interrupted
    // mid-edit. Offer it rather than silently choosing for them.
    const draft = loadCoverLetterDraft(letter.id);
    if (draft && draft.content !== stored) {
      setPendingDraft({ content: draft.content, savedAt: draft.savedAt });
    }
  }, [letter, editor]);

  // ── Mirror the buffer into localStorage (never a DB write) ──
  const content = editor.value;
  const dirty = content !== savedContent;

  useEffect(() => {
    if (!letter || loadedIdRef.current !== letter.id) return;
    // While a recovered draft is still awaiting the user's decision, leave it in
    // storage: the buffer currently matches the SAVED text, and clearing here
    // would destroy the very edits we're offering to restore.
    if (pendingDraft) return;
    if (!dirty) {
      clearCoverLetterDraft(letter.id);
      return;
    }
    saveCoverLetterDraft(letter.id, {
      content,
      savedAt: new Date().toISOString(),
      baseVersionId: activeVersionId,
    });
  }, [letter, content, dirty, activeVersionId, pendingDraft]);

  // Warn before leaving with unsaved edits — the browser's own guard is the
  // only one that fires for a tab close.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const stats = useMemo(() => computeStats(content), [content]);
  const resumeName = letter?.resume_id
    ? resumes.find((r) => r.id === letter.resume_id)?.name
    : null;
  const status = (letter?.status as CoverLetterStatus) ?? COVER_LETTER_STATUSES.DRAFT;
  const aiBusy = runAction.isPending;

  // "AI generated" describes the TEXT in the editor, not the document: a letter
  // the user has since rewritten by hand is no longer AI-written, and saying so
  // would be misleading.
  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;
  const aiGenerated =
    !dirty &&
    (activeVersion?.source === VERSION_SOURCES.GENERATE ||
      activeVersion?.source === VERSION_SOURCES.AI_ACTION);

  // Editing session model: refinement actions are free once Generate has
  // opened a session on this document (see CoverLetterAIService).
  const sessionActive = Boolean(letter?.ai_session_id);
  const actionsAvailable = Boolean(letter?.resume_id) && Boolean(letter?.job_id);

  // A saved explanation describes a SPECIFIC version of the text — clear it the
  // moment the active version changes so it never claims to explain stale text.
  useEffect(() => {
    setExplanation(null);
    setExplainError(null);
    setExplainedContent(null);
  }, [activeVersionId]);

  const explanationStale = explanation != null && content !== explainedContent;

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!letter || !dirty) return;
    saveVersion.mutate(
      { coverLetterId: letter.id, content, source: VERSION_SOURCES.MANUAL, tone, length },
      {
        onSuccess: (result) => {
          setSavedContent(content);
          setActiveVersionId(result.version.id);
          clearCoverLetterDraft(letter.id);
          toast.success(`Saved as version ${result.version.version_number}.`);
        },
        onError: () => toast.error("Could not save this version."),
      },
    );
  }, [letter, dirty, content, tone, length, saveVersion]);

  function handleRunAction(
    action: CoverLetterAIAction,
    options?: { targetTone?: CoverLetterTone; targetLength?: CoverLetterLength },
  ) {
    if (!letter?.resume_id || !letter.job_id) {
      toast.error("This letter is missing its resume or job, so AI actions aren't available.");
      return;
    }
    setRunningAction(action);
    runAction.mutate(
      {
        coverLetterId: letter.id,
        action,
        content,
        resumeId: letter.resume_id,
        jobId: letter.job_id,
        tone,
        length,
        customInstructions: instructions.trim() || undefined,
        targetTone: options?.targetTone,
        targetLength: options?.targetLength,
      },
      {
        onSuccess: (result) => {
          setRunningAction(null);
          if (!result.ok) {
            const copy = aiErrorCopy(result.code);
            toast.error(copy.title, {
              description: [copy.body, creditsReassurance(result.creditsRefunded)]
                .filter(Boolean)
                .join(" "),
            });
            return;
          }
          // The AI result is saved server-side as a new version, so the editor
          // and the saved baseline move together — an AI edit is never "unsaved".
          editor.set(result.generation.content, { coalesce: false });
          setSavedContent(result.generation.content);
          setActiveVersionId(result.versionId ?? null);
          setTone(result.generation.tone);
          setLength(result.generation.length);
          if (letter) clearCoverLetterDraft(letter.id);
          toast.success(result.generation.note || `${AI_ACTION_LABELS[action]} applied.`, {
            description: formatGenerationMeta(result.generation),
          });
        },
        // A thrown error carries no structured code and its message can be raw
        // transport text, so it gets the generic mapped copy — never `err.message`.
        onError: () => {
          setRunningAction(null);
          const copy = aiErrorCopy(undefined);
          toast.error(copy.title, { description: copy.body });
        },
      },
    );
  }

  function handleExplain() {
    if (!letter?.resume_id || !letter.job_id) return;
    setExplainError(null);
    explainLetter.mutate(
      {
        coverLetterId: letter.id,
        content,
        resumeId: letter.resume_id,
        jobId: letter.job_id,
        tone,
        length,
        customInstructions: instructions.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            setExplainError(friendlyAIError(res.code));
            return;
          }
          setExplanation(res.explanation);
          setExplainedContent(content);
        },
        // No structured code on a thrown error, and `err.message` can be raw
        // transport text — fall back to the generic mapped copy.
        onError: () => setExplainError(friendlyAIError(undefined)),
      },
    );
  }

  function handleSelectVersion(version: CoverLetterVersion) {
    if (!letter) return;
    if (dirty) {
      toast.error("Save or undo your edits before switching versions.");
      return;
    }
    // Show it immediately, then persist the pointer so reopening the Studio
    // later lands on the version the user actually left it on.
    editor.set(version.content, { coalesce: false });
    setSavedContent(version.content);
    setActiveVersionId(version.id);
    setCurrentVersion.mutate(
      { coverLetterId: letter.id, version },
      {
        onError: () => toast.error("Switched locally, but couldn't save which version is active."),
      },
    );
  }

  function handleRestoreVersion(version: CoverLetterVersion) {
    if (!letter) return;
    saveVersion.mutate(
      {
        coverLetterId: letter.id,
        content: version.content,
        source: VERSION_SOURCES.RESTORE,
        label: `Restored from v${version.version_number}`,
      },
      {
        onSuccess: (result) => {
          editor.set(version.content, { coalesce: false });
          setSavedContent(version.content);
          setActiveVersionId(result.version.id);
          clearCoverLetterDraft(letter.id);
          toast.success(`Restored version ${version.version_number} as a new version.`);
        },
        onError: () => toast.error("Could not restore that version."),
      },
    );
  }

  function handleDuplicateVersion(version: CoverLetterVersion) {
    if (!letter) return;
    saveVersion.mutate(
      {
        coverLetterId: letter.id,
        content: version.content,
        source: VERSION_SOURCES.DUPLICATE,
        label: `Copy of v${version.version_number}`,
      },
      {
        onSuccess: (result) => {
          editor.set(version.content, { coalesce: false });
          setSavedContent(version.content);
          setActiveVersionId(result.version.id);
          toast.success("Version duplicated.");
        },
        onError: () => toast.error("Could not duplicate that version."),
      },
    );
  }

  async function handleCopy() {
    const ok = await copyToClipboard(content);
    if (ok) toast.success("Copied to clipboard.");
    else toast.error("Your browser blocked the clipboard. Select the text and copy manually.");
  }

  async function handleExport(format: CoverLetterExportFormat) {
    if (!letter) return;
    try {
      await downloadCoverLetter(content, letter.name, format);
      // Downloading is what turns a letter into something the user has actually
      // used, so it advances the status — unless they already marked it Final
      // (a deliberate choice that a download shouldn't undo) or it's already
      // recorded as downloaded.
      if (status !== COVER_LETTER_STATUSES.FINAL && status !== COVER_LETTER_STATUSES.DOWNLOADED) {
        setStatus.mutate({
          coverLetterId: letter.id,
          status: COVER_LETTER_STATUSES.DOWNLOADED,
        });
      }
      toast.success(`Downloaded as ${format.toUpperCase()}.`);
    } catch {
      toast.error("Could not build that file. Try another format.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening the Studio…
      </div>
    );
  }

  if (isError || !letter) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Cover letter not found"
        body="It may have been deleted. Head back to your library to pick another one."
        cta={
          <Link
            to="/dashboard/cover-letters"
            className="text-sm font-medium text-[#2563EB] hover:underline"
          >
            Back to cover letters
          </Link>
        }
      />
    );
  }

  return (
    // Shared AI frame (Module 6G) at workspace width — same margins, rhythm and
    // header treatment as the other AI pages, but wide enough for three panes.
    <AIPage width="workspace">
      <AIPageHeader
        backTo="/dashboard/cover-letters"
        backLabel="Cover letters"
        icon={FileText}
        title={letter.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {letter.company_name && (
              <Chip>
                <Building2 className="mr-1 inline h-3 w-3" />
                {letter.company_name}
              </Chip>
            )}
            {letter.role_title && <Chip tone="blue">{letter.role_title}</Chip>}
            {resumeName && (
              <Chip>
                <FileText className="mr-1 inline h-3 w-3" />
                {resumeName}
              </Chip>
            )}
          </span>
        }
        actions={
          <>
            <DashButton size="sm" variant="outline" onClick={() => setRenamingLetter(true)}>
              <PenLine className="h-3.5 w-3.5" /> Rename
            </DashButton>
            <DashButton size="sm" variant="outline" onClick={() => setDuplicatingLetter(true)}>
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </DashButton>
            <DashButton
              size="sm"
              variant={status === COVER_LETTER_STATUSES.FINAL ? "outline" : "primary"}
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  coverLetterId: letter.id,
                  status:
                    status === COVER_LETTER_STATUSES.FINAL
                      ? COVER_LETTER_STATUSES.DRAFT
                      : COVER_LETTER_STATUSES.FINAL,
                })
              }
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {status === COVER_LETTER_STATUSES.FINAL ? "Mark as draft" : "Mark as final"}
            </DashButton>
            <DashButton size="sm" variant="ghost" onClick={() => setDeletingLetter(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DashButton>
          </>
        }
      />

      {/* ── Unsaved-draft notice ── */}
      {pendingDraft && (
        <DashCard className="border-[#F59E0B]/25 bg-[#F59E0B]/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[oklch(0.35_0.02_265)]">
              You have unsaved edits from a previous session on this device.
            </p>
            <div className="flex items-center gap-2">
              <DashButton
                size="sm"
                onClick={() => {
                  editor.set(pendingDraft.content, { coalesce: false });
                  setPendingDraft(null);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restore edits
              </DashButton>
              <DashButton
                size="sm"
                variant="outline"
                onClick={() => {
                  clearCoverLetterDraft(letter.id);
                  setPendingDraft(null);
                }}
              >
                Discard
              </DashButton>
            </div>
          </div>
        </DashCard>
      )}

      {/* ── Workspace: versions | editor | AI ── */}
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="order-2 space-y-4 xl:order-1">
          <VersionsPanel
            versions={versions}
            loading={versionsLoading}
            activeVersionId={activeVersionId}
            dirty={dirty}
            busyVersionId={saveVersion.isPending ? activeVersionId : null}
            onSelect={handleSelectVersion}
            onRestore={handleRestoreVersion}
            onDuplicate={handleDuplicateVersion}
            onLabel={setLabellingVersion}
          />
        </div>

        <div className={cn("order-1 min-w-0 xl:order-2")}>
          <CoverLetterEditor
            value={content}
            onChange={(next) => editor.set(next)}
            onUndo={editor.undo}
            onRedo={editor.redo}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            dirty={dirty}
            saving={saveVersion.isPending}
            aiBusy={aiBusy}
            aiBusyLabel={
              runningAction ? `${AI_ACTION_LABELS[runningAction]}…` : "Working on your letter…"
            }
            aiNarrate={runningAction === COVER_LETTER_AI_ACTIONS.REGENERATE_ALL}
            onSave={handleSave}
            onCopy={handleCopy}
            onExport={handleExport}
          />
        </div>

        <div className="order-3 space-y-4">
          <AIActionsPanel
            disabled={aiBusy || saveVersion.isPending || !actionsAvailable}
            sessionActive={sessionActive}
            runningAction={runningAction}
            creditsRemaining={credits?.creditsRemaining ?? 0}
            currentTone={tone}
            currentLength={length}
            onRun={handleRunAction}
            explanation={{
              loading: explainLetter.isPending,
              explanation,
              stale: explanationStale,
              error: explainError,
            }}
            onExplain={handleExplain}
          />
          <GenerationSettingsPanel
            tone={tone}
            length={length}
            customInstructions={instructions}
            disabled={aiBusy}
            saving={updateSettings.isPending}
            onChange={(next) => {
              setTone(next.tone);
              setLength(next.length);
              setInstructions(next.customInstructions);
            }}
            onSave={() =>
              updateSettings.mutate(
                {
                  coverLetterId: letter.id,
                  tone,
                  length,
                  customInstructions: instructions.trim() || null,
                },
                {
                  onSuccess: () => toast.success("Settings saved."),
                  onError: () => toast.error("Could not save those settings."),
                },
              )
            }
          />
          <StatisticsPanel
            stats={stats}
            tone={tone}
            length={length}
            status={status}
            aiGenerated={aiGenerated}
            lastEditedAt={letter.last_edited_at ?? letter.updated_at}
          />
        </div>
      </div>

      {/* ── Dialogs ── */}
      <NamePromptDialog
        open={renamingLetter}
        icon={PenLine}
        title="Rename cover letter"
        label="Letter name"
        defaultValue={letter.name}
        confirmLabel="Save name"
        busy={renameLetter.isPending}
        onClose={() => setRenamingLetter(false)}
        onConfirm={(name) =>
          renameLetter.mutate(
            { coverLetterId: letter.id, name },
            {
              onSuccess: () => {
                toast.success("Renamed.");
                setRenamingLetter(false);
              },
              onError: () => toast.error("Could not rename the letter."),
            },
          )
        }
      />

      <NamePromptDialog
        open={Boolean(labellingVersion)}
        icon={Tag}
        title="Name this version"
        description="A short label makes a version easy to recognise later."
        label="Version name"
        defaultValue={
          labellingVersion?.label ?? `Version ${labellingVersion?.version_number ?? ""}`
        }
        confirmLabel="Save name"
        busy={renameVersion.isPending}
        onClose={() => setLabellingVersion(null)}
        onConfirm={(label) => {
          if (!labellingVersion) return;
          renameVersion.mutate(
            { coverLetterId: letter.id, versionId: labellingVersion.id, label },
            {
              onSuccess: () => {
                toast.success("Version renamed.");
                setLabellingVersion(null);
              },
              onError: () => toast.error("Could not rename that version."),
            },
          );
        }}
      />

      <NamePromptDialog
        open={duplicatingLetter}
        icon={Copy}
        title="Duplicate cover letter"
        description="The copy starts at Version 1 with the currently saved text."
        label="New letter name"
        defaultValue={`${letter.name} (copy)`}
        confirmLabel="Create copy"
        busy={duplicateLetter.isPending}
        onClose={() => setDuplicatingLetter(false)}
        onConfirm={(name) =>
          duplicateLetter.mutate(
            { source: letter, name },
            {
              onSuccess: (created) => {
                setDuplicatingLetter(false);
                toast.success("Copy created.");
                void navigate({
                  to: "/dashboard/cover-letters/$coverLetterId",
                  params: { coverLetterId: created.id },
                });
              },
              onError: () => toast.error("Could not duplicate the letter."),
            },
          )
        }
      />

      <StudioDialog
        open={deletingLetter}
        icon={Trash2}
        title="Delete this cover letter?"
        description={
          <>
            <span className="font-medium text-[oklch(0.25_0.02_265)]">{letter.name}</span> and all
            of its versions will be permanently removed. This can't be undone.
          </>
        }
        busy={deleteLetter.isPending}
        onClose={() => setDeletingLetter(false)}
        footer={
          <div className="flex flex-col gap-2">
            <DialogDangerButton
              busy={deleteLetter.isPending}
              onClick={() =>
                deleteLetter.mutate(letter.id, {
                  onSuccess: () => {
                    clearCoverLetterDraft(letter.id);
                    toast.success("Cover letter deleted.");
                    void navigate({ to: "/dashboard/cover-letters" });
                  },
                  onError: () => toast.error("Could not delete the letter."),
                })
              }
            >
              Delete permanently
            </DialogDangerButton>
            <DialogSecondaryButton
              onClick={() => setDeletingLetter(false)}
              disabled={deleteLetter.isPending}
            >
              Cancel
            </DialogSecondaryButton>
          </div>
        }
      />
    </AIPage>
  );
}
