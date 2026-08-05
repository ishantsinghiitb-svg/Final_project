import { useState } from "react";
import { ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { DashCard, Chip, CompanyMark } from "@/components/dashboard/primitives";
import { logoToneForCompany } from "@/features/jobs/utils";
import { SuggestionCard } from "@/components/dashboard/gmail/SuggestionCard";
import { relativeDay } from "@/features/gmail/summary";
import type { SuggestionGroup } from "@/features/gmail/grouping";
import type { GmailMessageCategory } from "@/features/gmail/types";
import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";

// ── SuggestionGroupCard (Module 9A) ──
//
// One opportunity = one card. The header carries the identity (company ·
// role) and the story so far as a compact stage trail; the body carries the
// individual actionable suggestions. Expanding reveals the full email
// timeline for that opportunity, so the progression is legible without
// leaving the page or opening Gmail.

// Colour by pipeline stage rather than per category, so the trail reads as a
// progression: blue = applied, purple = in conversation, amber = work to do,
// green = won, rose = lost, grey = informational.
const CATEGORY_TONE: Record<GmailMessageCategory, string> = {
  application_submitted: "bg-[#2563EB]",
  application_confirmation: "bg-[#2563EB]",
  recruiter_viewed: "bg-[#2563EB]",
  recruiter_reply: "bg-[#7C3AED]",
  application_update: "bg-[oklch(0.6_0.02_265)]",
  oa_invitation: "bg-[#F59E0B]",
  online_assessment: "bg-[#F59E0B]",
  assignment: "bg-[#F59E0B]",
  interview_invitation: "bg-[#7C3AED]",
  interview_scheduled: "bg-[#7C3AED]",
  interview_rescheduled: "bg-[#7C3AED]",
  interview_reminder: "bg-[#7C3AED]",
  offer: "bg-[#16A34A]",
  offer_accepted: "bg-[#16A34A]",
  offer_declined: "bg-[#E11D48]",
  waitlist: "bg-[#F59E0B]",
  rejection: "bg-[#E11D48]",
  background_verification: "bg-[#16A34A]",
  reference_check: "bg-[#16A34A]",
  joining_formalities: "bg-[#16A34A]",
  follow_up_required: "bg-[#0891B2]",
  general_recruiter_communication: "bg-[oklch(0.6_0.02_265)]",
  unknown: "bg-[oklch(0.7_0.02_265)]",
};

type Props = {
  group: SuggestionGroup;
  googleEmail: string | null;
  selectedIds: Set<string>;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectGroup: (ids: string[]) => void;
  onReview: (item: GmailSuggestionListItem) => void;
  onDismiss: (id: string) => void;
};

export function SuggestionGroupCard({
  group,
  googleEmail,
  selectedIds,
  busyId,
  onToggleSelect,
  onToggleSelectGroup,
  onReview,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const actionCount = group.pending.length;
  const hasTimeline = group.timeline.length > 1;

  // Group-level selection covers this opportunity's pending suggestions only,
  // mirroring the per-row rule (resolved rows aren't selectable).
  const pendingIds = group.pending.map((i) => i.id);
  const groupAllSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));
  const groupSomeSelected = pendingIds.some((id) => selectedIds.has(id)) && !groupAllSelected;

  return (
    <DashCard padded={false}>
      <div className="flex items-start gap-3 border-b border-black/5 px-4 py-3">
        {pendingIds.length > 0 && (
          <input
            type="checkbox"
            checked={groupAllSelected}
            ref={(el) => {
              // Set on the DOM node — `indeterminate` has no JSX prop, and
              // without it a partly-selected group looks unselected.
              if (el) el.indeterminate = groupSomeSelected;
            }}
            onChange={() => onToggleSelectGroup(pendingIds)}
            aria-label={`Select all ${actionCount} suggestions for ${group.company ?? "this opportunity"}`}
            className="mt-2.5 h-3.5 w-3.5 shrink-0 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
          />
        )}

        {/* Reuses the same company mark the Applications/Interviews surfaces
            use, so a company looks identical everywhere in the product. Falls
            back to tinted initials when there's no logo — Gmail-derived
            groups have no linked global_job to carry one. */}
        {group.company ? (
          <CompanyMark company={group.company} tone={logoToneForCompany(group.company)} size={36} />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[oklch(0.96_0.015_265)] text-[oklch(0.45_0.02_265)]">
            <Building2 className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
              {group.company ?? "Unknown company"}
            </p>
            {group.role && (
              <span className="text-sm text-[oklch(0.45_0.02_265)]">{group.role}</span>
            )}
            {actionCount > 0 && (
              <Chip tone="blue">
                {actionCount} action{actionCount === 1 ? "" : "s"}
              </Chip>
            )}
          </div>

          {/* Stage trail — the story so far, at a glance. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {group.timeline.map((entry, i) => (
              <span key={`${entry.category}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[oklch(0.7_0.02_265)]">→</span>}
                <span className="inline-flex items-center gap-1 text-xs text-[oklch(0.5_0.02_265)]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${CATEGORY_TONE[entry.category]}`}
                    aria-hidden
                  />
                  {entry.headline}
                </span>
              </span>
            ))}
          </div>
        </div>

        {hasTimeline && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#2563EB] hover:bg-black/[0.03]"
          >
            {expanded ? (
              <>
                Hide timeline <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Timeline <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      {expanded && (
        <ol className="relative space-y-3 border-b border-black/5 bg-black/[0.015] px-6 py-4 pl-9 before:absolute before:bottom-4 before:left-[26px] before:top-4 before:w-px before:bg-black/10">
          {group.timeline.map((entry, i) => (
            <li key={`${entry.category}-detail-${i}`} className="relative">
              <span
                className={`absolute -left-[15px] top-1 h-2 w-2 rounded-full ring-2 ring-white ${CATEGORY_TONE[entry.category]}`}
                aria-hidden
              />
              <p className="text-xs font-medium text-[oklch(0.25_0.02_265)]">{entry.headline}</p>
              {entry.receivedAt && (
                <p className="text-[11px] text-[oklch(0.55_0.02_265)]">
                  {relativeDay(entry.receivedAt)}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {group.items.map((item) => (
        <SuggestionCard
          key={item.id}
          suggestion={item}
          googleEmail={googleEmail}
          selected={selectedIds.has(item.id)}
          onToggleSelect={() => onToggleSelect(item.id)}
          onReview={() => onReview(item)}
          onDismiss={() => onDismiss(item.id)}
          busy={busyId === item.id}
        />
      ))}
    </DashCard>
  );
}
