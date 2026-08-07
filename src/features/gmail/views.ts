import type { SuggestionListItem } from "@/repositories/SuggestionRepository";
import type { GmailMessageCategory } from "@/features/gmail/types";

// ── Recruiter Inbox views (Module 9A, simplified in the Module 9 UX pass) ──
//
// The Inbox fetches PENDING, GMAIL-SOURCED suggestions only (status and
// source scope are both fixed at the query level now — see
// dashboard.inbox.tsx and SuggestionRepository.findSuggestionsByUser) — so a
// "view" here answers just one question: "what kind of thing is it?"
// ("Needs Action" is every item in the list by construction now that status
// is fixed to pending; it's kept as the default landing tab rather than
// removed, since every other tab is a category narrowing of it). Applied
// client-side over the already-fetched list, same as before.
//
// Deliberately removed in this pass (per the simplification): "All" (there's
// nothing to see beyond "Needs Action" once status is fixed), "Today"/"This
// Week" (date filtering wasn't earning its place in the tab bar), and the
// Calendar source filter (the Inbox no longer shows calendar-sourced
// suggestions at all — those live on the Interviews page instead).

export type InboxView =
  "needs_action" | "interview" | "assessment" | "offer" | "reply" | "application" | "rejected";

type ViewDef = {
  value: InboxView;
  label: string;
  emptyTitle: string;
  emptyBody: string;
  /** Categories this view admits — omitted for "needs_action" (matches everything). */
  categories?: GmailMessageCategory[];
};

export const VIEWS: ViewDef[] = [
  {
    value: "needs_action",
    label: "Needs Action",
    emptyTitle: "You're all caught up",
    emptyBody:
      "New recruiter emails will show up here as reviewable suggestions after your next sync.",
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
    value: "reply",
    label: "Replies",
    emptyTitle: "No recruiter replies",
    emptyBody: "Direct replies from recruiters will appear here.",
    categories: ["recruiter_reply", "follow_up_required", "general_recruiter_communication"],
  },
  {
    value: "rejected",
    label: "Rejected",
    emptyTitle: "No rejections",
    emptyBody: "Rejections and waitlists will be recorded here so your pipeline stays accurate.",
    categories: ["rejection", "waitlist"],
  },
];

/** Narrows a suggestion list to the selected view. Pure — safe inside `useMemo`. */
export function applyView(items: SuggestionListItem[], view: InboxView): SuggestionListItem[] {
  // Defensively still filters by status here (not just a pass-through) —
  // the Inbox's own query is always pending-only now, but this function
  // stays independently correct for any other caller/order of composition.
  if (view === "needs_action") return items.filter((i) => i.status === "pending");

  const def = VIEWS.find((v) => v.value === view);
  if (!def?.categories) return items;
  const allowed = new Set(def.categories);
  return items.filter((i) => i.category !== null && allowed.has(i.category));
}

/**
 * Splits the list into the Inbox's two sections instead of filtering one of
 * them away. This replaced a single "Unread" toggle: with the toggle on
 * (the default) read mail was invisible and uncounted, so an inbox that had
 * actually found plenty of recruiter email could look empty; with it off,
 * unread mail lost its distinct identity entirely. Two sections with their
 * own counts show both facts at once.
 *
 * Read/unread state is Gmail's own (`isUnread`, captured at sync time) —
 * this only decides which section a row lands in, and never filters
 * anything out of the page.
 */
export function splitByReadState(items: SuggestionListItem[]): {
  unread: SuggestionListItem[];
  read: SuggestionListItem[];
} {
  const unread: SuggestionListItem[] = [];
  const read: SuggestionListItem[] = [];
  for (const item of items) (item.isUnread ? unread : read).push(item);
  return { unread, read };
}
