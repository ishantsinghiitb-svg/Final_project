import type { InterviewStatus } from "@/types";
import type {
  InterviewSort,
  InterviewSortOption,
  InterviewWhenFilter,
} from "@/features/interviews/types";

// ── Interview Round ───────────────────────────────────────────────────────────
// Feeds the Round field's <datalist> — any other typed value is just as valid
// (see Interview.type in src/types/index.ts).

export const INTERVIEW_ROUND_PRESETS = [
  "Recruiter Screen",
  "Hiring Manager",
  "Technical",
  "Behavioral",
  "Product",
  "Final Round",
] as const;

type ChipTone = "default" | "blue" | "purple" | "green" | "amber" | "rose";

const ROUND_TONES: Record<string, ChipTone> = {
  "Recruiter Screen": "blue",
  "Hiring Manager": "purple",
  Technical: "purple",
  Behavioral: "amber",
  Product: "green",
  "Final Round": "rose",
};

/** Tone for the Round Chip — falls back to "default" for custom round names. */
export function roundTone(round: string): ChipTone {
  return ROUND_TONES[round] ?? "default";
}

// ── Status metadata ──────────────────────────────────────────────────────────
// One meta record covers every InterviewStatus value; which subset is
// actually assignable to a given interview depends on LINKED_STATUSES vs
// STANDALONE_STATUSES below, enforced by InterviewService.updateStatus.

export type InterviewStatusMeta = { label: string; tone: ChipTone };

export const INTERVIEW_STATUS_META: Record<InterviewStatus, InterviewStatusMeta> = {
  scheduled: { label: "Scheduled", tone: "blue" },
  completed: { label: "Completed", tone: "default" },
  passed: { label: "Passed", tone: "green" },
  rejected: { label: "Rejected", tone: "rose" },
};

/** Outcome (Passed/Rejected) stays on the Application for linked interviews. */
export const LINKED_STATUSES: InterviewStatus[] = ["scheduled", "completed"];

export const STANDALONE_STATUSES: InterviewStatus[] = [
  "scheduled",
  "completed",
  "passed",
  "rejected",
];

// ── "When" filter ─────────────────────────────────────────────────────────

export const WHEN_FILTER_LABELS: Record<InterviewWhenFilter, string> = {
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
};

export const WHEN_FILTER_OPTIONS: InterviewWhenFilter[] = ["today", "upcoming", "completed"];

// ── Sort options ─────────────────────────────────────────────────────────────

export const SORT_OPTIONS: Record<InterviewSortOption, InterviewSort> = {
  earliest: { field: "scheduled_at", direction: "asc" },
  latest: { field: "scheduled_at", direction: "desc" },
};

export const SORT_LABELS: Record<InterviewSortOption, string> = {
  earliest: "Earliest First",
  latest: "Latest First",
};

export const DEFAULT_INTERVIEW_SORT_OPTION: InterviewSortOption = "earliest";

export const DEFAULT_INTERVIEW_SORT: InterviewSort = SORT_OPTIONS.earliest;
