import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  FileText,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/dashboard/primitives";
import { useResumes } from "@/features/resumes/hooks";
import { useJobs, useSavedJobs } from "@/features/jobs/hooks";
import {
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { AIThinkingPanel } from "@/components/dashboard/ai/AIThinking";
import type { GlobalJob, Resume } from "@/types";
import { DialogPrimaryButton, DialogSecondaryButton, StudioDialog } from "./StudioDialog";
import { CustomInstructionsField, LengthField, ToneField } from "./GenerationSettingsFields";

// ── Generate Cover Letter dialog (Module 6E) ──
//
// The workflow's front door: Resume → Job → Options → Generate. Two steps so
// neither screen is crowded, and so the credit cost is stated on the same
// screen as the button that spends it. The dialog never generates by itself —
// it hands a complete request to the caller, which owns the mutation.
//
// When opened from a job page the job is fixed and step 1 only picks a resume.

export type GenerateRequest = {
  resumeId: string;
  jobId: string;
  companyName: string | null;
  roleTitle: string | null;
  name: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

type Props = {
  open: boolean;
  /** Pre-selected job (job-detail entry point). When set, the job step is skipped. */
  fixedJob?: GlobalJob | null;
  isPending: boolean;
  creditsRemaining: number;
  onGenerate: (request: GenerateRequest) => void;
  onClose: () => void;
};

type Step = "select" | "options";

function defaultLetterName(job: { company_name?: string; role?: string } | null): string {
  const company = job?.company_name?.trim();
  const role = job?.role?.trim();
  if (company && role) return `${role} — ${company}`;
  if (company) return `Cover letter — ${company}`;
  if (role) return `Cover letter — ${role}`;
  return "Cover letter";
}

export function GenerateCoverLetterDialog({
  open,
  fixedJob,
  isPending,
  creditsRemaining,
  onGenerate,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<CoverLetterTone>(DEFAULT_TONE);
  const [length, setLength] = useState<CoverLetterLength>(DEFAULT_LENGTH);
  const [instructions, setInstructions] = useState("");
  const [name, setName] = useState("");

  const { data: resumes = [], isLoading: resumesLoading } = useResumes();
  const { data: savedJobs } = useSavedJobs({ page: 1, pageSize: 50 });
  // Only search the global feed once the user actually types — the saved list
  // covers the common case without an extra query on open.
  const { data: searchResults, isFetching: searching } = useJobs({ q: query.trim() }, undefined, {
    page: 1,
    pageSize: 25,
  });

  const [nameTouched, setNameTouched] = useState(false);

  // Reset every time the dialog OPENS so a previous run never leaks into a new
  // one. Deliberately keyed on `open` alone — depending on the resume/job lists
  // would wipe the user's selections whenever those queries refetch.
  useEffect(() => {
    if (!open) return;
    setStep("select");
    setQuery("");
    setTone(DEFAULT_TONE);
    setLength(DEFAULT_LENGTH);
    setInstructions("");
    setNameTouched(false);
    setResumeId(null);
    setJobId(fixedJob?.id ?? null);
    setName(defaultLetterName(fixedJob ?? null));
  }, [open, fixedJob]);

  // Seed the resume once the list arrives: the user's default, else the first
  // ready one. Only fills an empty selection — never overrides a manual pick.
  useEffect(() => {
    if (!open || resumeId) return;
    const ready = resumes.filter((r) => r.parse_status === "ready");
    const seed = ready.find((r) => r.is_default)?.id ?? ready[0]?.id ?? null;
    if (seed) setResumeId(seed);
  }, [open, resumeId, resumes]);

  const jobOptions: GlobalJob[] = useMemo(() => {
    if (fixedJob) return [fixedJob];
    if (query.trim()) return searchResults?.data ?? [];
    return savedJobs?.data ?? [];
  }, [fixedJob, query, searchResults, savedJobs]);

  const selectedJob = useMemo(
    () => fixedJob ?? jobOptions.find((j) => j.id === jobId) ?? null,
    [fixedJob, jobOptions, jobId],
  );

  // Keep the suggested letter name in step with the chosen job, until the user
  // types their own — after that it is theirs and we stop touching it.
  useEffect(() => {
    if (nameTouched || !selectedJob) return;
    setName(defaultLetterName(selectedJob));
  }, [nameTouched, selectedJob]);

  const readyResumes = resumes.filter((r) => r.parse_status === "ready");
  const pendingResumes = resumes.filter((r) => r.parse_status !== "ready");
  const canContinue = Boolean(resumeId) && Boolean(jobId);
  const outOfCredits = creditsRemaining <= 0;

  function submit() {
    if (!resumeId || !jobId) return;
    onGenerate({
      resumeId,
      jobId,
      companyName: selectedJob?.company_name ?? null,
      roleTitle: selectedJob?.role ?? null,
      name: name.trim() || defaultLetterName(selectedJob),
      tone,
      length,
      customInstructions: instructions.trim() || undefined,
    });
  }

  return (
    <StudioDialog
      open={open}
      size="lg"
      icon={step === "select" ? FileText : Sparkles}
      busy={isPending}
      onClose={onClose}
      title={
        isPending
          ? "Writing your cover letter"
          : step === "select"
            ? "New cover letter"
            : "Choose how it should sound"
      }
      description={
        isPending
          ? undefined
          : step === "select"
            ? "Pick the resume to write from and the job to write for."
            : "These settings shape the first draft. You can change any of it afterwards."
      }
      footer={
        // While the request is in flight the dialog is the loading surface (see
        // the body below), so it shows no footer at all — a disabled Generate
        // button and a Back button would both be dead controls.
        isPending ? null : step === "select" ? (
          <DialogPrimaryButton onClick={() => setStep("options")} disabled={!canContinue}>
            Continue <ArrowRight className="h-4 w-4" />
          </DialogPrimaryButton>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-[oklch(0.45_0.02_265)]">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
                Generating uses <span className="font-semibold">1 AI credit</span>
              </span>
              <span className={cn("tabular-nums", outOfCredits && "font-semibold text-[#E11D48]")}>
                {creditsRemaining} left
              </span>
            </div>
            <DialogPrimaryButton
              onClick={submit}
              disabled={!canContinue || outOfCredits}
              busy={isPending}
              busyLabel="Writing your letter…"
            >
              <Sparkles className="h-4 w-4" /> Generate cover letter
            </DialogPrimaryButton>
            <DialogSecondaryButton onClick={() => setStep("select")} disabled={isPending}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </DialogSecondaryButton>
          </div>
        )
      }
    >
      {isPending ? (
        <div className="mt-5">
          <AIThinkingPanel
            capability={AI_CAPABILITIES.COVER_LETTER}
            className="border-0 bg-transparent p-0"
          />
          <p className="mt-4 text-xs text-[oklch(0.5_0.02_265)]">
            You'll land in the editor as soon as the draft is ready. Nothing is final — every line
            stays yours to change.
          </p>
        </div>
      ) : step === "select" ? (
        <div className="mt-5 space-y-5">
          {/* ── Resume ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
              Resume
            </p>
            {resumesLoading ? (
              <p className="mt-2 text-sm text-[oklch(0.5_0.02_265)]">Loading your resumes…</p>
            ) : readyResumes.length === 0 ? (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                <p className="text-sm text-[oklch(0.45_0.02_265)]">
                  {pendingResumes.length > 0
                    ? "Your resume is still being processed. Once parsing finishes you can write a letter from it."
                    : "Upload a resume first — the letter is written from what's in it."}
                </p>
              </div>
            ) : (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {readyResumes.map((resume: Resume) => {
                  const active = resume.id === resumeId;
                  return (
                    <button
                      key={resume.id}
                      type="button"
                      onClick={() => setResumeId(resume.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                        active
                          ? "border-[#2563EB]/40 bg-[#2563EB]/[0.04] ring-1 ring-[#2563EB]/15"
                          : "border-black/8 bg-white hover:border-black/15 hover:bg-black/[0.02]",
                      )}
                    >
                      <div
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                          active
                            ? "bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/20 text-[#2563EB]"
                            : "bg-black/[0.04] text-[oklch(0.5_0.02_265)]",
                        )}
                      >
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[oklch(0.25_0.02_265)]">
                          {resume.name}
                        </p>
                        {resume.is_default && (
                          <p className="text-[11px] text-[oklch(0.5_0.02_265)]">Default</p>
                        )}
                      </div>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#2563EB]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Job ── */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
                Job
              </p>
              {!fixedJob && (
                <span className="text-[11px] text-[oklch(0.55_0.02_265)]">
                  {query.trim() ? "Search results" : "Your saved jobs"}
                </span>
              )}
            </div>

            {fixedJob ? (
              <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/[0.04] p-2.5 ring-1 ring-[#2563EB]/15">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/20 text-[#2563EB]">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[oklch(0.25_0.02_265)]">
                    {fixedJob.role}
                  </p>
                  <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
                    {fixedJob.company_name}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(0.6_0.02_265)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search all jobs by role or company…"
                    className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[oklch(0.65_0.02_265)] focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>

                <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                  {jobOptions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-3 text-sm text-[oklch(0.5_0.02_265)]">
                      {query.trim()
                        ? searching
                          ? "Searching…"
                          : "No jobs matched that search."
                        : "You have no saved jobs yet — search above to find one."}
                    </p>
                  ) : (
                    jobOptions.map((job) => {
                      const active = job.id === jobId;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setJobId(job.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                            active
                              ? "border-[#2563EB]/40 bg-[#2563EB]/[0.04] ring-1 ring-[#2563EB]/15"
                              : "border-black/8 bg-white hover:border-black/15 hover:bg-black/[0.02]",
                          )}
                        >
                          <div
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                              active
                                ? "bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/20 text-[#2563EB]"
                                : "bg-black/[0.04] text-[oklch(0.5_0.02_265)]",
                            )}
                          >
                            <Briefcase className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[oklch(0.25_0.02_265)]">
                              {job.role}
                            </p>
                            <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
                              {job.company_name}
                              {job.location ? ` · ${job.location}` : ""}
                            </p>
                          </div>
                          {active && <Check className="h-4 w-4 shrink-0 text-[#2563EB]" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="blue">{selectedJob?.role ?? "Job"}</Chip>
            <Chip>{selectedJob?.company_name ?? "—"}</Chip>
            <Chip>{resumes.find((r) => r.id === resumeId)?.name ?? "Resume"}</Chip>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
              Letter name
            </p>
            <div className="relative mt-2">
              <PenLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[oklch(0.6_0.02_265)]" />
              <input
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                disabled={isPending}
                className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15 disabled:opacity-50"
              />
            </div>
          </div>

          <ToneField value={tone} onChange={setTone} disabled={isPending} />
          <LengthField value={length} onChange={setLength} disabled={isPending} />
          <CustomInstructionsField
            value={instructions}
            onChange={setInstructions}
            disabled={isPending}
          />

          {outOfCredits && (
            <div className="flex items-start gap-2 rounded-xl border border-[#E11D48]/20 bg-[#E11D48]/[0.04] p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D48]" />
              <p className="text-sm text-[oklch(0.4_0.02_265)]">
                You're out of AI credits. Upgrade to keep generating letters.
              </p>
            </div>
          )}
        </div>
      )}
    </StudioDialog>
  );
}
