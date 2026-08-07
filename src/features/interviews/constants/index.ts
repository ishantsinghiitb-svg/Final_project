import type { Interview, InterviewSource, InterviewStatus } from "@/types";
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

export type ChipTone = "default" | "blue" | "purple" | "green" | "amber" | "rose";

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

// ── Source filter (Module 9B) ────────────────────────────────────────────────

export const SOURCE_FILTER_LABELS: Record<InterviewSource, string> = {
  manual: "Manual",
  gmail: "Gmail",
  calendar: "Calendar",
  both: "Gmail + Calendar",
};

export const SOURCE_FILTER_OPTIONS: InterviewSource[] = ["manual", "gmail", "calendar", "both"];

// Manual is intentionally excluded — unbadged is the norm; a chip on every
// interview would be noise on a page whose whole point is the interview
// itself, not its provenance. Gmail/Calendar/Both each get a chip since
// "where did this come from" is genuinely useful here.
export const SOURCE_CHIP_META: Partial<Record<InterviewSource, { label: string; tone: ChipTone }>> =
  {
    gmail: { label: "Gmail", tone: "amber" },
    calendar: { label: "Calendar", tone: "blue" },
    both: { label: "Gmail + Calendar", tone: "purple" },
  };

// ── "Keep" — acknowledge a cancelled calendar event (Module 9 UX pass) ──────
// When the linked calendar event is cancelled, the interview stays (never
// auto-deleted) but keeps showing a "Removed from calendar" indicator
// forever unless the user explicitly acknowledges it. "Keep" unlinks the
// interview from that now-gone event — this is the ONLY lever available
// without new schema: is_calendar_event_stale is computed purely from
// `calendar_event_id ? staleEventIds.has(id) : false` (see
// InterviewRepository.attachDerivedFields), so nulling the FK clears the
// indicator immediately. `source` is downgraded alongside it so the source
// chip doesn't keep implying an active calendar link that no longer exists.

function downgradeSourceAfterUnlink(source: InterviewSource): InterviewSource {
  if (source === "both") return "gmail";
  if (source === "calendar") return "manual";
  return source;
}

export function buildKeepInterviewPatch(interview: Pick<Interview, "source">): {
  calendar_event_id: null;
  source: InterviewSource;
} {
  return { calendar_event_id: null, source: downgradeSourceAfterUnlink(interview.source) };
}

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
