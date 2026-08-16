import {
  Briefcase,
  ArrowRightLeft,
  CalendarClock,
  BellPlus,
  Paperclip,
  Loader2,
  Reply,
  CircleAlert,
} from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import { gmailReplyLink } from "@/features/gmail/utils";
import { readSuggestionSummary, confidenceTier } from "@/features/gmail/summary";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";
import type { SuggestionType } from "@/features/gmail/types";

// ── SuggestionCard (Module 9A/9B) ──
//
// A task row, not an email preview. Everything on it is something the user
// acts on: what kind of thing this is, who it's from, what it's about, what
// they must do, and the three ways to respond.
//
// Deliberately NOT shown here — each was removed because it added height
// without changing a decision:
//   - recruiter name + relative date: identity detail, not a decision input
//   - the raw email subject: the AI summary already says what it says, better
//   - "Open Original Email": one of three competing links on a row that
//     should have one primary action. It lives in the Review panel, where
//     someone who wants the raw email is already looking for it.
//   - the "Detected because" confidence breakdown: useful for debugging the
//     classifier, noise for someone triaging their job search. The evidence
//     is still generated and stored on the suggestion; it just isn't rendered.
// All of that remains one click away in the Review panel.
//
// The summary is clamped to two lines so every card has a predictable height
// and the list stays scannable at a glance.

const TYPE_META: Record<
  SuggestionType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  create_application: { label: "New Application", icon: Briefcase, tint: "text-[#2563EB]" },
  update_application: { label: "Status Update", icon: ArrowRightLeft, tint: "text-[#F59E0B]" },
  create_interview: { label: "Interview", icon: CalendarClock, tint: "text-[#7C3AED]" },
  add_reminder: { label: "Reminder", icon: BellPlus, tint: "text-[#0891B2]" },
  import_attachment: { label: "Attachment", icon: Paperclip, tint: "text-[oklch(0.5_0.02_265)]" },
};

// Gmail is the original, unbadged look (no chip) — Calendar and "Both"
// (independently corroborated by an email AND a calendar event, see
// SuggestionRepository) get a distinct tone so the source is visible at a
// glance without adding noise to the common Gmail-only case.
const SOURCE_META: Partial<
  Record<SuggestionListItem["source"], { label: string; tone: "purple" | "blue" }>
> = {
  calendar: { label: "Calendar", tone: "blue" },
  both: { label: "Gmail + Calendar", tone: "purple" },
};

type Props = {
  suggestion: SuggestionListItem;
  googleEmail: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onReview: () => void;
  onDismiss: () => void;
  busy: boolean;
  /** Bulk-select only makes sense where there's a bulk action bar to act on it (the Inbox) — the Interviews page's calendar-suggestions panel has neither, so it hides the checkbox entirely rather than rendering a dead control. */
  selectable?: boolean;
};

export function SuggestionCard({
  suggestion,
  googleEmail,
  selected,
  onToggleSelect,
  onReview,
  onDismiss,
  busy,
  selectable = true,
}: Props) {
  const meta = TYPE_META[suggestion.type];
  const Icon = meta.icon;
  const summary = readSuggestionSummary(suggestion);
  const tier = confidenceTier(suggestion.confidence);
  const isPending = suggestion.status === "pending";
  const sourceMeta = SOURCE_META[suggestion.source];

  // The headline prefers the email's own classification ("Interview
  // Invitation") over the mechanical suggestion type ("Interview") — it's
  // what the user recognises from their inbox.
  const headline = summary?.headline ?? meta.label;
  const company = summary?.company ?? suggestion.company_name;
  const role = summary?.role ?? null;
  const reason = summary?.reason ?? suggestion.explanation;
  const action = summary?.action ?? null;
  const replyUrl =
    googleEmail && suggestion.externalMessageId
      ? gmailReplyLink(googleEmail, suggestion.externalMessageId)
      : null;

  return (
    <div className="flex items-start gap-3 border-b border-black/5 px-4 py-3 last:border-0">
      {isPending && selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
          aria-label={`Select ${headline} suggestion`}
        />
      )}
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[oklch(0.96_0.015_265)] ${meta.tint}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Category + confidence — the "what kind of thing is this" line. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-display text-sm font-semibold text-[oklch(0.18_0.02_265)]">
            {headline}
          </p>
          <Chip tone={tier.tone}>{tier.display}</Chip>
          {sourceMeta && <Chip tone={sourceMeta.tone}>{sourceMeta.label}</Chip>}
          {!isPending && (
            <Chip tone={suggestion.status === "accepted" ? "green" : "default"}>
              {suggestion.status === "accepted"
                ? "Added"
                : suggestion.status === "dismissed"
                  ? "Dismissed"
                  : suggestion.status}
            </Chip>
          )}
        </div>

        {/* Company · Role — the strongest identity line, weighted heaviest. */}
        {(company || role) && (
          <p className="mt-0.5 truncate text-[13px] text-[oklch(0.32_0.02_265)]">
            {company && <span className="font-semibold">{company}</span>}
            {company && role && <span className="text-[oklch(0.65_0.02_265)]"> · </span>}
            {role && <span>{role}</span>}
          </p>
        )}

        {/* AI summary, capped at two lines for a predictable row height. */}
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[oklch(0.45_0.02_265)]">
          {reason}
        </p>

        {/* Omitted entirely for informational mail, so its presence is itself
            the signal that something is needed. The literal "Action required:"
            prefix used to lead this line on every actionable card, which made
            the list read as a wall of repeated labels; the amber marker now
            carries that meaning and the sentence carries the instruction. */}
        {action && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-[#B45309]">
            <CircleAlert className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{action}</span>
          </p>
        )}
      </div>

      {/* Reply / Review / Dismiss. Reply is primary because the common case
          for a real recruiter email is answering it; adding it to the pipeline
          lives inside the Review panel, where the user can check the extracted
          fields before committing. Reply opens the thread in Gmail rather than
          composing in-app — that needs the gmail.send scope, which is
          deliberately not requested. */}
      {isPending && (
        <div className="flex shrink-0 items-center gap-1.5">
          {replyUrl ? (
            <a
              href={replyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Reply className="h-3 w-3" />
              Reply
            </a>
          ) : null}
          <button
            onClick={onReview}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Review
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
