import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Copy, FileText, Loader2, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { CoverLetterHistoryList } from "@/components/dashboard/cover-letters/CoverLetterHistoryList";
import {
  GenerateCoverLetterDialog,
  type GenerateRequest,
} from "@/components/dashboard/cover-letters/GenerateCoverLetterDialog";
import {
  DialogDangerButton,
  DialogSecondaryButton,
  NamePromptDialog,
  StudioDialog,
} from "@/components/dashboard/cover-letters/StudioDialog";
import {
  useCoverLetters,
  useCreateCoverLetter,
  useDeleteCoverLetter,
  useDuplicateCoverLetter,
  useRenameCoverLetter,
} from "@/features/cover-letters/hooks";
import { STATUS_LABELS, type CoverLetterStatus } from "@/features/cover-letters/constants";
import { formatGenerationMeta } from "@/features/cover-letters/stats";
import { useResumes } from "@/features/resumes/hooks";
import { useAICredits } from "@/features/ai/hooks";
import { aiErrorCopy, creditsReassurance } from "@/features/ai/errorMessages";
import { AIPage } from "@/components/dashboard/ai/AIPage";
import type { CoverLetter } from "@/types";

// ── Cover Letters library (Module 6E) ──
//
// The History surface: every letter the user has generated, persisted in the
// database and searchable months later. Creating one starts the workflow —
// Resume → Job → options → Generate — and lands the user in the Studio.

export const Route = createFileRoute("/dashboard/cover-letters/")({
  head: () => ({
    meta: [{ title: "Cover letters — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: CoverLettersPage,
});

const STATUS_FILTERS: (CoverLetterStatus | "all")[] = ["all", "draft", "final", "downloaded"];

function CoverLettersPage() {
  const navigate = useNavigate();
  const { data: letters = [], isLoading, isError } = useCoverLetters();
  const { data: resumes = [] } = useResumes();
  const { data: credits } = useAICredits();

  const createLetter = useCreateCoverLetter();
  const renameLetter = useRenameCoverLetter();
  const duplicateLetter = useDuplicateCoverLetter();
  const deleteLetter = useDeleteCoverLetter();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [renaming, setRenaming] = useState<CoverLetter | null>(null);
  const [duplicating, setDuplicating] = useState<CoverLetter | null>(null);
  const [deleting, setDeleting] = useState<CoverLetter | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CoverLetterStatus | "all">("all");

  const resumeNames = useMemo(
    () => Object.fromEntries(resumes.map((r) => [r.id, r.name])),
    [resumes],
  );

  // Studio letters only. Uploaded cover-letter FILES (Module 3B) live with the
  // application they were attached to and have no editable content here.
  const studioLetters = useMemo(() => letters.filter((l) => l.source === "studio"), [letters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return studioLetters.filter((letter) => {
      if (status !== "all" && (letter.status ?? "draft") !== status) return false;
      if (!q) return true;
      return [letter.name, letter.company_name, letter.role_title]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [studioLetters, query, status]);

  function handleGenerate(request: GenerateRequest) {
    createLetter.mutate(request, {
      onSuccess: (result) => {
        if (!result.ok) {
          const copy = aiErrorCopy(result.code);
          toast.error(copy.title, {
            description: [copy.body, creditsReassurance(result.creditsRefunded)]
              .filter(Boolean)
              .join(" "),
          });
          return;
        }
        setGenerateOpen(false);
        toast.success("Cover letter ready", {
          description: formatGenerationMeta(result.generation),
        });
        void navigate({
          to: "/dashboard/cover-letters/$coverLetterId",
          params: { coverLetterId: result.coverLetter.id },
        });
      },
      // A thrown error carries no structured code and its message can be raw
      // transport text, so it gets the generic mapped copy — never `err.message`.
      onError: () => {
        const copy = aiErrorCopy(undefined);
        toast.error(copy.title, { description: copy.body });
      },
    });
  }

  return (
    // Shared AI frame (Module 6G) — same measure as the AI Hub, the Studio and
    // the Optimizer, so the four AI surfaces read as one product.
    <AIPage width="full">
      <StickyPageHeader>
        <PageHeader
          eyebrow="AI Studio"
          title="Cover letters"
          subtitle="Generate, edit and export recruiter-ready cover letters."
          actions={
            <DashButton onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4" /> New cover letter
            </DashButton>
          }
        />

        {studioLetters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(0.6_0.02_265)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by letter, company or role…"
                className="w-full rounded-lg border border-black/5 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[oklch(0.65_0.02_265)] focus:border-[#2563EB]/40"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-black/5 bg-white p-0.5">
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option}
                  onClick={() => setStatus(option)}
                  className={
                    option === status
                      ? "rounded-md bg-[oklch(0.95_0.02_265)] px-2.5 py-1.5 text-xs font-medium text-[#2563EB]"
                      : "rounded-md px-2.5 py-1.5 text-xs text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                  }
                >
                  {option === "all" ? "All" : STATUS_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        )}
      </StickyPageHeader>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your cover letters…
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load your cover letters"
          body="Something went wrong fetching them. Refresh the page to try again."
        />
      ) : studioLetters.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No cover letters yet"
          body="Pick a resume and a job, choose how it should sound, and get a first draft you can edit freely."
          cta={
            <DashButton onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4" /> New cover letter
            </DashButton>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No letters match"
          body="Try a different search term or clear the status filter."
        />
      ) : (
        <CoverLetterHistoryList
          letters={filtered}
          resumeNames={resumeNames}
          onRename={setRenaming}
          onDuplicate={setDuplicating}
          onDelete={setDeleting}
        />
      )}

      <GenerateCoverLetterDialog
        open={generateOpen}
        isPending={createLetter.isPending}
        creditsRemaining={credits?.creditsRemaining ?? 0}
        onGenerate={handleGenerate}
        onClose={() => !createLetter.isPending && setGenerateOpen(false)}
      />

      <NamePromptDialog
        open={Boolean(renaming)}
        icon={PenLine}
        title="Rename cover letter"
        label="Letter name"
        defaultValue={renaming?.name ?? ""}
        confirmLabel="Save name"
        busy={renameLetter.isPending}
        onClose={() => setRenaming(null)}
        onConfirm={(name) => {
          if (!renaming) return;
          renameLetter.mutate(
            { coverLetterId: renaming.id, name },
            {
              onSuccess: () => {
                toast.success("Renamed.");
                setRenaming(null);
              },
              onError: () => toast.error("Could not rename the letter."),
            },
          );
        }}
      />

      <NamePromptDialog
        open={Boolean(duplicating)}
        icon={Copy}
        title="Duplicate cover letter"
        description="The copy starts at Version 1 with the current text. The original is untouched."
        label="New letter name"
        defaultValue={duplicating ? `${duplicating.name} (copy)` : ""}
        confirmLabel="Create copy"
        busy={duplicateLetter.isPending}
        onClose={() => setDuplicating(null)}
        onConfirm={(name) => {
          if (!duplicating) return;
          duplicateLetter.mutate(
            { source: duplicating, name },
            {
              onSuccess: (created) => {
                setDuplicating(null);
                toast.success("Copy created.");
                void navigate({
                  to: "/dashboard/cover-letters/$coverLetterId",
                  params: { coverLetterId: created.id },
                });
              },
              onError: () => toast.error("Could not duplicate the letter."),
            },
          );
        }}
      />

      <StudioDialog
        open={Boolean(deleting)}
        icon={Trash2}
        title="Delete this cover letter?"
        description={
          <>
            <span className="font-medium text-[oklch(0.25_0.02_265)]">{deleting?.name}</span> and
            all of its versions will be permanently removed. This can't be undone.
          </>
        }
        busy={deleteLetter.isPending}
        onClose={() => setDeleting(null)}
        footer={
          <div className="flex flex-col gap-2">
            <DialogDangerButton
              busy={deleteLetter.isPending}
              onClick={() => {
                if (!deleting) return;
                deleteLetter.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success("Cover letter deleted.");
                    setDeleting(null);
                  },
                  onError: () => toast.error("Could not delete the letter."),
                });
              }}
            >
              Delete permanently
            </DialogDangerButton>
            <DialogSecondaryButton
              onClick={() => setDeleting(null)}
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
