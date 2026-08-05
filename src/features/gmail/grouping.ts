import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";
import type { GmailMessageCategory } from "@/features/gmail/types";
import { readSuggestionSummary } from "@/features/gmail/summary";

// ── Thread / opportunity grouping (Module 9A) ──
//
// "One application, one card." The Inbox previously rendered one row per
// suggestion under a flat company heading, so a single opportunity that
// progressed Applied → Reply → Interview → Assessment → Offer produced five
// unrelated-looking cards and the user had to reassemble the story
// themselves. Grouping collapses that into one card carrying the whole arc,
// with the individual actions still available inside it.
//
// The grouping key is chosen strongest-identity-first:
//   1. `target_application_id` — an explicit link to the same application is
//      unambiguous, and survives the company/role text differing between
//      emails (an ATS confirmation and a recruiter's personal follow-up
//      routinely word things differently).
//   2. company + role — catches the pre-application case, where nothing is
//      linked yet but two emails clearly concern the same opportunity.
//      Company alone would be wrong: two open roles at one employer are two
//      applications, not one.
//   3. Gmail's own thread id — a genuine reply chain, when we couldn't
//      resolve entities well enough for (2).
//   4. The suggestion id — a singleton group, so nothing is ever dropped.

export type SuggestionGroup = {
  key: string;
  company: string | null;
  role: string | null;
  /** Every suggestion in the group, newest email first. */
  items: GmailSuggestionListItem[];
  /** Only the actionable ones — drives the group's action bar and counts. */
  pending: GmailSuggestionListItem[];
  /** Distinct email categories in chronological order — the timeline. */
  timeline: { category: GmailMessageCategory; receivedAt: string | null; headline: string }[];
  /** Most recent activity in the group, for sorting groups against each other. */
  lastActivityAt: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function groupKey(item: GmailSuggestionListItem): string {
  if (item.target_application_id) return `app:${item.target_application_id}`;

  const summary = readSuggestionSummary(item);
  const company = normalize(item.company_name ?? summary?.company);
  const role = normalize(summary?.role);
  if (company && role) return `cr:${company}|${role}`;

  if (item.threadId) return `thread:${item.threadId}`;
  return `one:${item.id}`;
}

function timeOf(item: GmailSuggestionListItem): number {
  const raw = item.receivedAt ?? item.created_at;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Collapses a flat suggestion list into opportunity-level groups, newest
 * activity first. Pure — safe to call inside a `useMemo`.
 */
export function groupSuggestions(items: GmailSuggestionListItem[]): SuggestionGroup[] {
  const buckets = new Map<string, GmailSuggestionListItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    const existing = buckets.get(key);
    if (existing) existing.push(item);
    else buckets.set(key, [item]);
  }

  const groups: SuggestionGroup[] = [];
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => timeOf(b) - timeOf(a));

    // Prefer the values from the most recent email that actually has them —
    // an early ATS confirmation often lacks the role a later human email
    // states outright.
    let company: string | null = null;
    let role: string | null = null;
    for (const item of sorted) {
      const summary = readSuggestionSummary(item);
      company ??= item.company_name ?? summary?.company ?? null;
      role ??= summary?.role ?? null;
      if (company && role) break;
    }

    // One timeline entry per distinct email (several suggestions can share a
    // source message — an assessment invite yields both a status update and
    // a deadline reminder, which is one event, not two).
    const seenMessages = new Set<string>();
    const timeline: SuggestionGroup["timeline"] = [];
    for (const item of [...sorted].reverse()) {
      if (seenMessages.has(item.gmail_message_id)) continue;
      seenMessages.add(item.gmail_message_id);
      timeline.push({
        category: item.category,
        receivedAt: item.receivedAt,
        headline: readSuggestionSummary(item)?.headline ?? item.category.replace(/_/g, " "),
      });
    }

    groups.push({
      key,
      company,
      role,
      items: sorted,
      pending: sorted.filter((i) => i.status === "pending"),
      timeline,
      lastActivityAt: sorted[0]?.receivedAt ?? sorted[0]?.created_at ?? null,
    });
  }

  return groups.sort((a, b) => {
    const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bt - at;
  });
}
