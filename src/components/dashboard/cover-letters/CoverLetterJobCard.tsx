import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { useAICredits } from "@/features/ai/hooks";
import { aiErrorCopy, creditsReassurance } from "@/features/ai/errorMessages";
import { useCoverLettersForJob, useCreateCoverLetter } from "@/features/cover-letters/hooks";
import {
  STATUS_LABELS,
  STATUS_TONES,
  type CoverLetterStatus,
} from "@/features/cover-letters/constants";
import { formatGenerationMeta, formatRelativeTime } from "@/features/cover-letters/stats";
import type { GlobalJob } from "@/types";
import { GenerateCoverLetterDialog, type GenerateRequest } from "./GenerateCoverLetterDialog";

// ── Cover letter card (Module 6E · job detail entry point) ──
//
// The spec's workflow starts at a job: from here the user opens the Studio with
// this job already selected. If letters already exist for the job they are
// listed, because writing a second one for the same role is usually a mistake —
// the user meant to reopen the first.

export function CoverLetterJobCard({ job }: { job: GlobalJob }) {
  const navigate = useNavigate();
  const { data: letters = [] } = useCoverLettersForJob(job.id);
  const { data: credits } = useAICredits();
  const createLetter = useCreateCoverLetter();
  const [open, setOpen] = useState(false);

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
        setOpen(false);
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
    <>
      <DashCard>
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
              Cover letter
            </p>
            <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
              Written from your resume for this role
            </p>
          </div>
        </div>

        {letters.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {letters.slice(0, 3).map((letter) => (
              <li key={letter.id}>
                <Link
                  to="/dashboard/cover-letters/$coverLetterId"
                  params={{ coverLetterId: letter.id }}
                  className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-2.5 py-2 transition-colors hover:border-black/15 hover:bg-black/[0.02]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-[oklch(0.25_0.02_265)]">
                      {letter.name}
                    </span>
                    <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">
                      Edited {formatRelativeTime(letter.last_edited_at ?? letter.updated_at)}
                    </span>
                  </span>
                  <Chip tone={STATUS_TONES[(letter.status as CoverLetterStatus) ?? "draft"]}>
                    {STATUS_LABELS[(letter.status as CoverLetterStatus) ?? "draft"]}
                  </Chip>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[oklch(0.6_0.02_265)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <DashButton
          size="sm"
          className="mt-3 w-full"
          variant={letters.length > 0 ? "outline" : "primary"}
          onClick={() => setOpen(true)}
        >
          {letters.length > 0 ? (
            <>
              <Plus className="h-3.5 w-3.5" /> Write another
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" /> Write cover letter
            </>
          )}
        </DashButton>

        <p className="mt-2 text-center text-[11px] text-[oklch(0.55_0.02_265)]">Uses 1 AI credit</p>
      </DashCard>

      <GenerateCoverLetterDialog
        open={open}
        fixedJob={job}
        isPending={createLetter.isPending}
        creditsRemaining={credits?.creditsRemaining ?? 0}
        onGenerate={handleGenerate}
        onClose={() => !createLetter.isPending && setOpen(false)}
      />
    </>
  );
}
