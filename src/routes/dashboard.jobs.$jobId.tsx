import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ArrowUpRight,
  Share2,
  MapPin,
  Briefcase,
  Banknote,
  Clock,
  Globe,
  Wifi,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Tag,
  Building2,
  Users,
  Zap,
  Megaphone,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashCard,
  Chip,
  CompanyMark,
  SectionTitle,
} from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  useJob,
  useJobSkills,
  useSimilarJobs,
  useSavedJobIds,
  useSaveJob,
  useUnsaveJob,
} from "@/features/jobs/hooks";
import {
  formatSalary,
  formatPostedAt,
  formatPostedAtFull,
  logoToneForCompany,
} from "@/features/jobs/utils";
import type { GlobalJob } from "@/types";
import {
  TrackApplicationModal,
  AlreadyTrackingModal,
  useTrackApplication,
} from "@/components/dashboard/applications/ApplyPromptDialog";

// ── Route definition ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/dashboard/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job Details — NextOffer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JobDetailPage,
});

// ── Share button ──────────────────────────────────────────────────────────────
function ShareButton({ jobId, role, company }: { jobId: string; role: string; company: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/dashboard/jobs/${jobId}`;
    const shareData = { title: `${role} at ${company}`, url };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or API unavailable — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [jobId, role, company]);

  return (
    <button
      onClick={() => void handleShare()}
      aria-label="Share job"
      className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" /> Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" /> Share
        </>
      )}
    </button>
  );
}

// ── Similar job card ──────────────────────────────────────────────────────────
function SimilarJobCard({ job }: { job: GlobalJob }) {
  const tone = logoToneForCompany(job.company_name);
  const salary = formatSalary(job);
  const posted = formatPostedAt(job.posted_at);

  return (
    <Link
      to="/dashboard/jobs/$jobId"
      params={{ jobId: job.id }}
      className="block rounded-xl border border-black/5 bg-white p-4 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start gap-3">
        <CompanyMark company={job.company_name} tone={tone} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold font-display truncate group-hover:text-[#2563EB] transition-colors">
            {job.role}
          </p>
          <p className="text-xs text-[oklch(0.5_0.02_265)] truncate">{job.company_name}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {job.work_mode && (
          <Chip tone={job.work_mode === "Remote" ? "green" : job.work_mode === "Hybrid" ? "blue" : "default"}>
            {job.work_mode}
          </Chip>
        )}
        {job.experience_level && (
          <Chip tone="default">{job.experience_level}</Chip>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        {salary && (
          <span className="flex items-center gap-0.5 text-xs text-[oklch(0.5_0.02_265)]">
            <Banknote className="h-3 w-3" /> {salary}
          </span>
        )}
        {posted && (
          <span className="flex items-center gap-0.5 text-xs text-[oklch(0.55_0.02_265)]">
            <Clock className="h-3 w-3" /> {posted}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function JobDetailPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();

  const { data: job, isLoading, isError, error } = useJob(jobId);
  const { data: skills = [] } = useJobSkills(jobId);
  const { data: similarJobs = [] } = useSimilarJobs(jobId, job);
  const { data: savedIds = [] } = useSavedJobIds();
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();

  const isSaved = Boolean(job && savedIds.includes(job.id));

  const handleToggleSave = useCallback(() => {
    if (!job) return;
    if (isSaved) unsaveJob.mutate({ jobId: job.id });
    else saveJob.mutate({ jobId: job.id });
  }, [job, isSaved, saveJob, unsaveJob]);

  // ── Track application flow (deterministic modal) ──────────────────────────
  const {
    isOpen: trackModalOpen,
    handleApplyClick,
    handleTrackAndContinue,
    handleContinueWithoutTracking,
    handleCancel: handleTrackCancel,
    isPending: trackIsPending,
    alreadyTrackedApplication,
    handleViewApplication,
    handleOpenJobPage,
    handleRemoveTracking,
    handleCloseAlreadyTracking,
    isRemovingTracking,
  } = useTrackApplication(job);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading job details…
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Failed to load job</p>
        <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <button
          onClick={() => navigate({ to: "/dashboard/jobs" })}
          className="mt-2 text-xs text-[#2563EB] hover:underline"
        >
          ← Back to Jobs
        </button>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!job) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="font-display text-sm font-semibold">Job not found</p>
        <Link to="/dashboard/jobs" className="mt-2 text-xs text-[#2563EB] hover:underline">
          ← Back to Jobs
        </Link>
      </div>
    );
  }

  const salary = formatSalary(job);
  const tone = logoToneForCompany(job.company_name);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate({ to: "/dashboard/jobs" })}
        className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.2_0.02_265)] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </button>

      {/* Track application modal */}
      {job && (
        <TrackApplicationModal
          job={job}
          open={trackModalOpen}
          isPending={trackIsPending}
          onTrackAndContinue={handleTrackAndContinue}
          onContinueWithoutTracking={handleContinueWithoutTracking}
          onCancel={handleTrackCancel}
        />
      )}

      {/* Already tracking dialog */}
      {alreadyTrackedApplication && (
        <AlreadyTrackingModal
          application={alreadyTrackedApplication}
          open={Boolean(alreadyTrackedApplication)}
          isPending={isRemovingTracking}
          onViewApplication={handleViewApplication}
          onOpenJobPage={handleOpenJobPage}
          onRemoveTracking={handleRemoveTracking}
          onClose={handleCloseAlreadyTracking}
        />
      )}
      {/* ── Header card ────────────────────────────────────────────────── */}
      <DashCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Company mark + title */}
          <div className="flex items-start gap-4">
            <CompanyMark company={job.company_name} tone={tone} size={56} />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
                {job.role}
              </h1>
              <p className="mt-0.5 text-sm text-[oklch(0.5_0.02_265)]">{job.company_name}</p>

              {/* Meta chips */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {job.remote && <Chip tone="green">Remote</Chip>}
                {job.work_mode && (
                  <Chip
                    tone={
                      job.work_mode === "Remote"
                        ? "green"
                        : job.work_mode === "Hybrid"
                          ? "blue"
                          : "default"
                    }
                  >
                    {job.work_mode}
                  </Chip>
                )}
                {job.employment_type && <Chip tone="default">{job.employment_type}</Chip>}
                {job.experience_level && <Chip tone="purple">{job.experience_level}</Chip>}
                {job.easy_apply && (
                  <Chip tone="blue">
                    <Zap className="h-3 w-3" /> Easy Apply
                  </Chip>
                )}
                {job.promoted && (
                  <Chip tone="amber">
                    <Megaphone className="h-3 w-3" /> Promoted
                  </Chip>
                )}
                {job.reposted && (
                  <Chip tone="default">
                    <RotateCcw className="h-3 w-3" /> Reposted
                  </Chip>
                )}
                {job.responses_managed && (
                  <Chip tone="default">
                    <ExternalLink className="h-3 w-3" /> Responses managed off LinkedIn
                  </Chip>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <ShareButton jobId={job.id} role={job.role} company={job.company_name} />

            <button
              onClick={handleToggleSave}
              aria-label={isSaved ? "Unsave job" : "Save job"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="h-4 w-4 text-[#2563EB]" />
                  Saved
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" />
                  Save
                </>
              )}
            </button>

            {job.url && (
              <button
                onClick={handleApplyClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] transition-all"
              >
                Apply Now <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Detail grid ────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {job.location && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Location
                </p>
                <p className="mt-0.5 text-sm font-medium">{job.location}</p>
              </div>
            </div>
          )}

          {salary && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Salary
                </p>
                <p className="mt-0.5 text-sm font-medium">{salary}</p>
              </div>
            </div>
          )}

          {job.employment_type && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Type
                </p>
                <p className="mt-0.5 text-sm font-medium capitalize">{job.employment_type}</p>
              </div>
            </div>
          )}

          {job.work_mode && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[#0EA5E9]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Work mode
                </p>
                <p className="mt-0.5 text-sm font-medium capitalize">{job.work_mode}</p>
              </div>
            </div>
          )}

          {job.experience_level && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Experience
                </p>
                <p className="mt-0.5 text-sm font-medium capitalize">{job.experience_level}</p>
              </div>
            </div>
          )}

          {(job.posted_ago || job.posted_at) && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Posted
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {job.posted_ago ?? formatPostedAtFull(job.posted_at)}
                </p>
              </div>
            </div>
          )}

          {typeof job.applicant_count === "number" && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Applicants
                </p>
                <p className="mt-0.5 text-sm font-medium">{job.applicant_count}</p>
              </div>
            </div>
          )}

          {job.source && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
                  Source
                </p>
                <p className="mt-0.5 text-sm font-medium">{job.source}</p>
              </div>
            </div>
          )}
        </div>
      </DashCard>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* ── Left: Description + Skills ──────────────────────────────── */}
        <div className="space-y-6">
          {/* Job description */}
          {(job.description_html || job.description) && (
            <DashCard>
              <SectionTitle>Job Description</SectionTitle>
              {job.description_html ? (
                // Sanitized to a structural-tag allowlist at parse time (see
                // extension/src/core/parsers/linkedin/sanitize.ts) — the only
                // write path is the SECURITY DEFINER upsert RPC, never raw
                // user input, so this is safe to render directly.
                <div
                  className="mt-4 max-w-none text-sm leading-relaxed text-[oklch(0.3_0.02_265)] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: job.description_html }}
                />
              ) : (
                <div className="mt-4 max-w-none text-[oklch(0.3_0.02_265)]">
                  {/* Manual-source jobs with no captured HTML — render as pre-formatted lines */}
                  {job.description!.split("\n").map((line, i) => (
                    <p
                      key={i}
                      className={line.trim() === "" ? "h-3" : "mb-2 text-sm leading-relaxed"}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </DashCard>
          )}

          {/* Required skills */}
          {skills.length > 0 && (
            <DashCard>
              <SectionTitle>Required Skills</SectionTitle>
              <div className="mt-4 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-[oklch(0.97_0.01_265)] px-3 py-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)]"
                  >
                    <Tag className="h-3 w-3" />
                    {skill.name}
                  </span>
                ))}
              </div>
            </DashCard>
          )}
        </div>

        {/* ── Right: Apply CTA + Copy URL ────────────────────────────── */}
        <div className="space-y-4">
          <DashCard>
            <p className="font-display text-sm font-semibold">Ready to apply?</p>
            <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)] leading-relaxed">
              Apply directly on the company's website or save this job to track it later.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {job.url ? (
                <button
                  onClick={handleApplyClick}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.5)] hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] transition-all"
                >
                  Apply Now
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ) : (
                <p className="text-xs text-[oklch(0.5_0.02_265)] italic">
                  No direct link available.
                </p>
              )}

              <button
                onClick={handleToggleSave}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white py-2.5 text-sm font-medium text-[oklch(0.25_0.02_265)] hover:bg-black/[0.03] transition-colors"
              >
                {isSaved ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 text-[#2563EB]" /> Saved
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" /> Save Job
                  </>
                )}
              </button>
            </div>
          </DashCard>

          {/* Share card */}
          <DashCard>
            <p className="font-display text-sm font-semibold">Share this job</p>
            <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
              Copy the link to share with your network.
            </p>
            <div className="mt-3">
              <CopyUrlButton jobId={job.id} />
            </div>
          </DashCard>
        </div>
      </div>

      {/* ── Similar jobs ─────────────────────────────────────────────── */}
      {similarJobs.length > 0 && (
        <div>
          <SectionTitle>Similar Jobs</SectionTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {similarJobs.slice(0, 6).map((sj) => (
              <SimilarJobCard key={sj.id} job={sj} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Copy URL helper ───────────────────────────────────────────────────────────
function CopyUrlButton({ jobId }: { jobId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = `${window.location.origin}/dashboard/jobs/${jobId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [jobId]);

  return (
    <button
      onClick={() => void handleCopy()}
      className="flex w-full items-center gap-2 rounded-lg border border-black/5 bg-[oklch(0.97_0.01_265)] px-3 py-2 text-left text-xs text-[oklch(0.5_0.02_265)] hover:bg-black/[0.04] transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate flex-1">{`…/jobs/${jobId.slice(0, 8)}…`}</span>
      <span className="shrink-0 font-medium text-[#2563EB]">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
