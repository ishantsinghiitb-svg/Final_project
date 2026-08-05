import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";
import type { GmailMessageCategory } from "@/features/gmail/types";

// ── Recruiter Inbox views (Module 9A) ──
//
// A second, orthogonal axis to the status filter (pending/accepted/…).
// Status answers "have I dealt with this?"; a view answers "what kind of
// thing is it?" — which is how someone actually triages a job search
// ("show me interviews", "what's due this week"). Applied client-side over
// the already-fetched list: the status filter is the one that narrows the
// query, and re-querying per view would add round-trips for a list that is
// small per user by construction.
//
// Each view carries its own empty-state copy, so an empty Interview view
// says "No interview invitations found" rather than a generic shrug.

export type InboxView =
  | "all"
  | "needs_action"
  | "interview"
  | "assessment"
  | "offer"
  | "reply"
  | "application"
  | "rejected"
  | "today"
  | "week";

type ViewDef = {
  value: InboxView;
  label: string;
  emptyTitle: string;
  emptyBody: string;
  /** Categories this view admits — omitted for the non-category views. */
  categories?: GmailMessageCategory[];
};

export const VIEWS: ViewDef[] = [
  {
    value: "all",
    label: "All",
    emptyTitle: "Nothing needs attention right now",
    emptyBody:
      "New recruiter emails will show up here as reviewable suggestions after your next sync.",
  },
  {
    value: "needs_action",
    label: "Needs Action",
    emptyTitle: "You're all caught up",
    emptyBody: "Every suggestion has been reviewed. New ones will appear after the next sync.",
  },
  {
    value: "interview",
    label: "Interviews",
    emptyTitle: "No interview invitations found",
    emptyBody: "Interview invites, confirmations and reschedules will appear here.",
    categories: [
      "interview_invitation",
      "interview_scheduled",
      "interview_rescheduled",
      "interview_reminder",
    ],
  },
  {
    value: "assessment",
    label: "Assessments",
    emptyTitle: "No assessments found",
    emptyBody: "Online assessments and take-home assignments will appear here.",
    categories: ["oa_invitation", "online_assessment", "assignment"],
  },
  {
    value: "offer",
    label: "Offers",
    emptyTitle: "No offers yet",
    emptyBody: "Offer letters, acceptances and joining formalities will appear here.",
    categories: [
      "offer",
      "offer_accepted",
      "offer_declined",
      "background_verification",
      "reference_check",
      "joining_formalities",
    ],
  },
  {
    value: "reply",
    label: "Replies",
    emptyTitle: "No recruiter replies",
    emptyBody: "Direct replies from recruiters will appear here.",
    categories: ["recruiter_reply", "follow_up_required", "general_recruiter_communication"],
  },
  {
    value: "application",
    label: "Applications",
    emptyTitle: "No application updates",
    emptyBody: "Confirmations and status changes on your applications will appear here.",
    categories: [
      "application_submitted",
      "application_confirmation",
      "recruiter_viewed",
      "application_update",
    ],
  },
  {
    value: "rejected",
    label: "Rejected",
    emptyTitle: "No rejections",
    emptyBody: "Rejections and waitlists will be recorded here so your pipeline stays accurate.",
    categories: ["rejection", "waitlist"],
  },
  {
    value: "today",
    label: "Today",
    emptyTitle: "Nothing new today",
    emptyBody: "Emails received today will appear here.",
  },
  {
    value: "week",
    label: "This Week",
    emptyTitle: "Nothing new this week",
    emptyBody: "Emails received in the last 7 days will appear here.",
  },
];

function receivedTime(item: GmailSuggestionListItem): number {
  const t = new Date(item.receivedAt ?? item.created_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Gmail read-state filter — a third axis alongside status and category view.
 *
 * Strictly a VIEW filter. Every recruiter email is still fetched, classified
 * and stored regardless of read state; this only decides what's on screen, so
 * nothing is ever lost because it was opened in Gmail first. Switching to
 * "All" always brings everything back.
 */
export type ReadFilter = "unread" | "read" | "all";

export const READ_FILTERS: { value: ReadFilter; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "all", label: "All" },
];

export function applyReadFilter(
  items: GmailSuggestionListItem[],
  filter: ReadFilter,
): GmailSuggestionListItem[] {
  if (filter === "all") return items;
  if (filter === "unread") return items.filter((i) => i.isUnread);
  return items.filter((i) => !i.isUnread);
}

/** Narrows a suggestion list to the selected view. Pure — safe inside `useMemo`. */
export function applyView(
  items: GmailSuggestionListItem[],
  view: InboxView,
): GmailSuggestionListItem[] {
  if (view === "all") return items;
  if (view === "needs_action") return items.filter((i) => i.status === "pending");

  if (view === "today" || view === "week") {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const cutoff = view === "today" ? startOfToday : startOfToday - 6 * 86_400_000;
    return items.filter((i) => receivedTime(i) >= cutoff);
  }

  const def = VIEWS.find((v) => v.value === view);
  if (!def?.categories) return items;
  const allowed = new Set(def.categories);
  return items.filter((i) => allowed.has(i.category));
}
