// ── AI activity presentation model (Module 6G) ──
//
// Turns a raw `ai_runs` row into the one shape the AI Hub renders. All of the
// "what does this row say and where does it go" logic lives here rather than
// in the component, so the four capabilities stay describable in one place and
// a fifth one is a single entry away.
//
// Copy rules enforced here:
//   • no capability jargon — "Cover letter", not "cover_letter"
//   • no ids, hashes, models, versions or token counts
//   • cost is stated as what the user spent, and "reused" is stated as a
//     benefit ("no credit used"), never as "cache hit"

import { Sparkles, ShieldCheck, Wand2, Mail } from "lucide-react";
import {
  AI_CAPABILITIES,
  type AICapability,
  type ShippedAICapability,
} from "@/features/ai/constants";
import type { AIActivityLabels, AIActivityRow } from "@/repositories/AIActivityRepository";

/**
 * Where a row's button goes. A discriminated union rather than a plain path
 * string so every destination stays checked against the generated route tree —
 * a renamed route breaks the build here instead of producing a dead button in
 * the Hub. The row component maps each `kind` to a typed `<Link>`.
 */
export type AIActivityAction =
  | {
      kind: "job";
      label: string;
      jobId: string;
      /** Deep-link params consumed by /dashboard/jobs/$jobId's validateSearch. */
      search: JobDeepLinkSearch;
    }
  | { kind: "optimize"; label: string; resumeId: string }
  | { kind: "coverLetter"; label: string; coverLetterId: string };

/**
 * The job-detail deep link. `resume` reopens the analysis against the resume
 * the run actually used; `analyze`/`ats` + `force` reopen the credit
 * confirmation for that feature — never the request itself, so regenerating
 * from the Hub still costs a deliberate confirmation.
 */
export type JobDeepLinkSearch = {
  resume?: string;
  analyze?: boolean;
  ats?: boolean;
  force?: boolean;
};

export type AIActivityItem = {
  id: string;
  capability: HubCapability;
  /** Icon for the capability. */
  icon: React.ComponentType<{ className?: string }>;
  /** e.g. "Resume match" */
  capabilityLabel: string;
  /** The thing it was run against: "Backend Engineer · Acme" or a resume name. */
  subject: string;
  /** Resume the run used, by name. Null when the resume has since been deleted. */
  resumeName: string | null;
  createdAt: string;
  failed: boolean;
  errorCode: string | null;
  /** True when served from an identical earlier run — cost the user nothing. */
  reused: boolean;
  creditsCharged: number;
  /**
   * True when the resume's FILE has been re-parsed since this ran, so the AI
   * read different text than the resume holds today. See
   * AIActivityLabels.resumes for why this uses parsed_at and not updated_at.
   */
  resumeChangedSince: boolean;
  /** Reopen the result where it lives. Null when the target no longer exists. */
  open: AIActivityAction | null;
  /** Run it again. Null when re-running needs choices the Hub shouldn't guess. */
  regenerate: AIActivityAction | null;
};

/**
 * The capabilities the Hub knows how to display, with their row presentation.
 *
 * Typed against `ShippedAICapability`, which pins the invariant from both
 * sides (Module 6 freeze): an experimental capability such as `interview_prep`
 * CANNOT be given a row here, and a capability that gets promoted to shipped
 * cannot be forgotten here — either mistake is a compile error rather than a
 * missing or dead row discovered in the UI.
 */
const HUB_META = {
  [AI_CAPABILITIES.RESUME_MATCH]: { icon: Sparkles, label: "Resume match" },
  [AI_CAPABILITIES.ATS_SCORE]: { icon: ShieldCheck, label: "ATS check" },
  [AI_CAPABILITIES.RESUME_OPTIMIZER]: { icon: Wand2, label: "Resume optimizer" },
  [AI_CAPABILITIES.COVER_LETTER]: { icon: Mail, label: "Cover letter" },
} as const satisfies Record<
  ShippedAICapability,
  { icon: React.ComponentType<{ className?: string }>; label: string }
>;

export type HubCapability = keyof typeof HUB_META;

export const HUB_CAPABILITIES = Object.keys(HUB_META) as HubCapability[];

function isHubCapability(capability: AICapability): capability is HubCapability {
  return capability in HUB_META;
}

export function hubCapabilityLabel(capability: HubCapability): string {
  return HUB_META[capability].label;
}

function jobAction(
  label: string,
  jobId: string,
  resumeId: string | null,
  regenerate?: "match" | "ats",
): AIActivityAction {
  const search: JobDeepLinkSearch = {};
  if (resumeId) search.resume = resumeId;
  if (regenerate === "match") {
    search.analyze = true;
    search.force = true;
  }
  if (regenerate === "ats") {
    search.ats = true;
    search.force = true;
  }
  return { kind: "job", label, jobId, search };
}

/**
 * Build the timeline row for one run. Returns null for capabilities the Hub
 * doesn't surface.
 */
export function toActivityItem(
  run: AIActivityRow,
  labels: AIActivityLabels,
): AIActivityItem | null {
  if (!isHubCapability(run.capability)) return null;
  const capability = run.capability;

  const resume = run.resumeId ? labels.resumes[run.resumeId] : undefined;
  const job = run.jobId ? labels.jobs[run.jobId] : undefined;

  const subject = job
    ? `${job.role} · ${job.company}`
    : run.jobId
      ? "Job no longer available"
      : (resume?.name ?? "Resume no longer available");

  const resumeChangedSince = Boolean(
    resume?.parsedAt && new Date(resume.parsedAt).getTime() > new Date(run.createdAt).getTime(),
  );

  let open: AIActivityAction | null = null;
  let regenerate: AIActivityAction | null = null;

  switch (capability) {
    case AI_CAPABILITIES.RESUME_MATCH:
      if (job && run.jobId) {
        open = jobAction("Open match", run.jobId, run.resumeId);
        regenerate = jobAction("Run again", run.jobId, run.resumeId, "match");
      }
      break;

    case AI_CAPABILITIES.ATS_SCORE:
      if (job && run.jobId) {
        open = jobAction("Open ATS check", run.jobId, run.resumeId);
        regenerate = jobAction("Run again", run.jobId, run.resumeId, "ats");
      }
      break;

    case AI_CAPABILITIES.RESUME_OPTIMIZER:
      if (resume && run.resumeId) {
        open = { kind: "optimize", label: "Open optimizer", resumeId: run.resumeId };
        // No one-click regenerate: optimizing requires picking a career
        // category and sections, and silently reusing the previous choice
        // would spend a credit on assumptions the user never confirmed.
      }
      break;

    case AI_CAPABILITIES.COVER_LETTER: {
      const letterId =
        run.resumeId && run.jobId ? labels.coverLetters[`${run.resumeId}|${run.jobId}`] : undefined;
      if (letterId) {
        open = { kind: "coverLetter", label: "Open letter", coverLetterId: letterId };
        // Regenerating a letter is an in-editor action (it rotates the editing
        // session and can discard edits), so the Hub sends the user there
        // rather than firing it from a list row.
      }
      break;
    }
  }

  return {
    id: run.id,
    capability,
    icon: HUB_META[capability].icon,
    capabilityLabel: HUB_META[capability].label,
    subject,
    resumeName: resume?.name ?? null,
    createdAt: run.createdAt,
    failed: run.status === "error",
    errorCode: run.errorCode,
    reused: run.cacheHit,
    creditsCharged: run.creditsCharged,
    resumeChangedSince,
    open,
    regenerate,
  };
}
