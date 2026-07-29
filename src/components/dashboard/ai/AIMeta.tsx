import type { ReactNode } from "react";
import { Clock, FileText, Briefcase, Zap, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGeneratedAt } from "@/features/ai/format";

// ── AI provenance strip (Module 6G) ──
//
// "Where did this result come from?" — answered the same way on every AI
// surface. Before 6G each feature spelled this out differently (or not at
// all), so a user couldn't tell whether the number in front of them was fresh,
// which resume produced it, or whether it predated their last edit.
//
// Wording rules, applied throughout:
//   • "Reused your earlier result", never "cache hit"
//   • the resume/job by NAME, never by id or hash
//   • "Your resume changed since this ran", never "stale" or "invalidated"

function MetaItem({
  icon: Icon,
  children,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={title}>
      <Icon className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * The provenance line under an AI result: when it ran, which resume and job it
 * used, and whether it was reused rather than freshly generated.
 *
 * Every field is optional — a surface passes only what it actually knows, and
 * the strip renders nothing at all if it knows nothing.
 */
export function AIMetaStrip({
  generatedAt,
  resumeName,
  jobLabel,
  reused,
  className,
}: {
  generatedAt?: string | null;
  resumeName?: string | null;
  /** e.g. "Backend Engineer · Acme". Omit for job-independent features. */
  jobLabel?: string | null;
  /** True when this result was served from an earlier identical run. */
  reused?: boolean;
  className?: string;
}) {
  const when = generatedAt ? formatGeneratedAt(generatedAt) : null;
  if (!when && !resumeName && !jobLabel && !reused) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[oklch(0.5_0.02_265)]",
        className,
      )}
    >
      {when && <MetaItem icon={Clock}>{when}</MetaItem>}
      {resumeName && (
        <MetaItem icon={FileText} title={`Resume used: ${resumeName}`}>
          {resumeName}
        </MetaItem>
      )}
      {jobLabel && (
        <MetaItem icon={Briefcase} title={`Job used: ${jobLabel}`}>
          {jobLabel}
        </MetaItem>
      )}
      {reused && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[#22C55E]/12 px-1.5 py-0.5 font-medium text-[#16A34A]"
          title="This result was reused from an identical earlier run, so it cost no credit."
        >
          <Zap className="h-3 w-3" /> Reused · no credit
        </span>
      )}
    </div>
  );
}

/**
 * Shown when the inputs moved on after a result was generated — the one thing
 * that makes an AI number quietly wrong. Offers the re-run inline so the user
 * doesn't have to hunt for it.
 *
 * `changed` names the input where the caller actually knows it. Match and ATS
 * pass "either": their server-side staleness check compares one combined input
 * hash, so it can tell THAT something changed but not WHICH — and inventing a
 * specific culprit would be a guess the user might act on.
 */
export function AIOutdatedNotice({
  changed = "either",
  onRegenerate,
  regenerateLabel = "Update result",
  busy = false,
  className,
}: {
  changed?: "resume" | "job" | "both" | "either";
  onRegenerate?: () => void;
  regenerateLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  const what = {
    resume: "Your resume has changed",
    job: "This job posting has changed",
    both: "Your resume and this job have both changed",
    either: "Your resume or this job has changed",
  }[changed];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.06] px-3.5 py-2.5",
        className,
      )}
    >
      <RotateCcw className="h-4 w-4 shrink-0 text-[#B45309]" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-[oklch(0.35_0.02_265)]">
        {what} since this ran, so the result below may be out of date.
      </p>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="shrink-0 rounded-lg border border-[#B45309]/25 bg-white px-2.5 py-1.5 text-xs font-medium text-[#B45309] transition-colors hover:bg-[#F59E0B]/10 disabled:opacity-60"
        >
          {regenerateLabel}
        </button>
      )}
    </div>
  );
}
