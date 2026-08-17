import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Inbox as InboxIcon, Search, Mail, RefreshCw, Loader2 } from "lucide-react";
import {
  DashCard,
  PageHeader,
  StickyPageHeader,
  EmptyState,
} from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";
import { SuggestionGroupCard } from "@/components/dashboard/gmail/SuggestionGroupCard";
import { ReviewPanel } from "@/components/dashboard/gmail/ReviewPanel";
import { ReviewSuggestionDialog } from "@/components/dashboard/gmail/ReviewSuggestionDialog";
import {
  useSuggestions,
  useResolveSuggestion,
  useResolveSuggestions,
} from "@/features/gmail/hooks";
import { useGoogleConnection, useSyncGoogleNow } from "@/features/google/hooks";
import { combinedSyncOutcomeMessage } from "@/features/google/syncOutcome";
import { groupSuggestions } from "@/features/gmail/grouping";
import { VIEWS, applyView, splitByReadState, type InboxView } from "@/features/gmail/views";
import type { SuggestionType } from "@/features/gmail/types";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

// ── Recruiter Inbox (Module 9A, simplified in the Module 9 UX pass) ──
//
// Gmail-only — Calendar-sourced suggestions live on the Interviews page
// instead (see usePendingCalendarSuggestions / PendingCalendarSuggestions).
// The list here is always PENDING (dismissed/added items simply disappear —
// there is no "view history" affordance left in this UI; that state still
// lives in the DB and on the relevant application's timeline, it's just not
// browsable as a queue anymore).

export const Route = createFileRoute("/dashboard/inbox")({
  head: () => ({
    meta: [{ title: "Recruiter Inbox — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: InboxPage,
});

const TYPE_SUMMARY_LABEL: Record<SuggestionType, string> = {
  create_application: "new application",
  update_application: "status update",
  create_interview: "interview",
  add_reminder: "reminder",
  import_attachment: "attachment",
};

function summarize(pending: SuggestionListItem[]): string[] {
  if (pending.length === 0) return [];
  const counts = new Map<SuggestionType, number>();
  for (const item of pending) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);

  const parts = [`${pending.length} item${pending.length === 1 ? "" : "s"} need attention`];
  for (const [type, count] of counts) {
    parts.push(`${count} ${TYPE_SUMMARY_LABEL[type]}${count === 1 ? "" : "s"}`);
  }
  return parts;
}

/** Read-state filter options for the Inbox toggle. */
type ReadState = "unread" | "read" | "all";

const READ_STATES: { value: ReadState; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "all", label: "All" },
];

function InboxPage() {
  const { data: connection } = useGoogleConnection();
  const [view, setView] = useState<InboxView>("needs_action");
  // Explicit read-state filter. Previously the page always rendered Unread as
  // a section with Read stacked underneath in a collapsed disclosure, so the
  // two states were mixed in one scroll with no way to say "show me only the
  // read ones". This is a deliberate switch instead.
  const [readState, setReadState] = useState<ReadState>("unread");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<SuggestionListItem | null>(null);
  const [editing, setEditing] = useState<SuggestionListItem | null>(null);
  // Per-row busy state, so accepting one card doesn't disable every card's
  // buttons (a single shared `resolveOne.isPending` would).
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: suggestions = [], isLoading } = useSuggestions("pending", search);
  const { syncNow, isPending: syncing } = useSyncGoogleNow();

  const resolveOne = useResolveSuggestion();
  const resolveBulk = useResolveSuggestions();

  const inView = useMemo(() => applyView(suggestions, view), [suggestions, view]);
  const { unread, read } = useMemo(() => splitByReadState(inView), [inView]);
  // `visible` is what the user can actually see and therefore what bulk
  // selection is allowed to act on.
  const visible = useMemo(
    () => (readState === "unread" ? unread : readState === "read" ? read : inView),
    [readState, unread, read, inView],
  );
  const visibleGroups = useMemo(() => groupSuggestions(visible), [visible]);
  const summaryParts = useMemo(() => summarize(suggestions), [suggestions]);
  const isConnected = Boolean(connection) && connection?.gmail_status !== "disconnected";

  // Bulk selection spans both sections — a row stays selectable whether or
  // not the Read section happens to be expanded, so "Select all" can't
  // silently mean "all of the half you can currently see".
  const selectableIds = useMemo(() => visible.map((i) => i.id), [visible]);

  // The selection is intersected with what's currently visible rather than
  // pruned on every filter change. Selecting rows, switching view, then
  // hitting "Accept Selected" must never act on rows the user can no longer
  // see — deriving it makes that impossible by construction instead of
  // depending on a cleanup effect firing in the right order.
  const effectiveSelected = useMemo(
    () => new Set(selectableIds.filter((id) => selected.has(id))),
    [selectableIds, selected],
  );

  const allSelected = selectableIds.length > 0 && effectiveSelected.size === selectableIds.length;
  const someSelected = effectiveSelected.size > 0 && !allSelected;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Master toggle — selects every suggestion in the current view, or clears them. */
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const id of selectableIds) next.delete(id);
      else for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  /** Per-opportunity toggle, from a group card's header. */
  function toggleSelectGroup(ids: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const everySelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (everySelected) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }

  function handleDismiss(id: string) {
    setBusyId(id);
    resolveOne.mutate(
      { suggestionId: id, decision: { action: "dismiss" } },
      {
        onError: () => toast.error("Failed to dismiss this suggestion."),
        onSettled: () => setBusyId(null),
      },
    );
  }

  /**
   * One-click accept straight from the card, using the suggestion's stored
   * payload as-is. When a required field genuinely can't be defaulted (an
   * interview with no date), the service returns ok:false with the reason and
   * we open the Review dialog on that suggestion instead of just showing an
   * error — the user lands exactly where they can fix it.
   */
  function handleAccept(item: SuggestionListItem) {
    setBusyId(item.id);
    resolveOne.mutate(
      { suggestionId: item.id, decision: { action: "accept" } },
      {
        onSuccess: (result) => {
          if (result.ok) toast.success("Added to your applications.");
          else {
            toast.error(result.message);
            setReviewing(item);
          }
        },
        onError: () => toast.error("Failed to apply this suggestion."),
        onSettled: () => setBusyId(null),
      },
    );
  }

  /** The SAME unified sync every "Sync Now" button in the app calls — always syncs both Gmail and Calendar, even though this page only ever displays Gmail results. */
  async function handleSyncNow() {
    const { gmailResult, calendarResult } = await syncNow();
    const toastMsg = combinedSyncOutcomeMessage(gmailResult, calendarResult);
    if (toastMsg.tone === "success") toast.success(toastMsg.message);
    else toast.error(toastMsg.message);
  }

  async function handleBulk(action: "accept" | "dismiss") {
    const ids = [...effectiveSelected];
    if (ids.length === 0) return;
    const verb = action === "accept" ? "added" : "dismissed";

    // mutateAsync rejects if the batch itself blows up. Without this catch the
    // rejection was unhandled: no toast, no cleared selection, and no clue
    // that anything had gone wrong.
    try {
      const results = await resolveBulk.mutateAsync({ suggestionIds: ids, action });
      const failed = results.filter((r) => !r.ok);

      if (failed.length === 0) {
        toast.success(
          `${action === "accept" ? "Added" : "Dismissed"} ${ids.length} suggestion${ids.length === 1 ? "" : "s"}.`,
        );
        setSelected(new Set());
        return;
      }

      // Surface WHY, not just a count — the reasons are per-item and
      // actionable ("An interview date and time are required"), and a bare
      // "3 of 12 failed" leaves the user with no way to fix it.
      const reasons = [...new Set(failed.map((f) => f.message).filter(Boolean))];
      toast.error(
        `${failed.length} of ${ids.length} couldn't be ${verb}.${
          reasons.length > 0 ? ` ${reasons.slice(0, 2).join(" ")}` : ""
        }`,
        { duration: 6000 },
      );
      // Keep only the failures selected, so a retry or a follow-up review
      // targets exactly what still needs attention.
      setSelected(new Set(failed.map((f) => f.suggestionId)));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Couldn't ${action} the selected suggestions.`,
      );
    }
  }

  if (!isConnected) {
    return (
      <>
        <StickyPageHeader>
          <PageHeader eyebrow="Recruiter Inbox" title="Connect Gmail to get started." />
        </StickyPageHeader>
        <EmptyState
          icon={Mail}
          title="Gmail isn't connected yet"
          body="Connect Gmail from Settings to detect recruiter emails and turn them into reviewable suggestions. Nothing is ever created without your approval."
          cta={<DashButtonLink to="/dashboard/settings">Go to Settings</DashButtonLink>}
        />
      </>
    );
  }

  const activeView = VIEWS.find((v) => v.value === view);

  return (
    <>
      <StickyPageHeader>
        {/* No explanatory subtitle — the count card right below already says
            what's here, and each card's own action buttons say what to do
            about it. Wordier framing used to sit between the user and both
            of those. */}
        <PageHeader eyebrow="Recruiter Inbox" title="Review what Gmail found." />

        {summaryParts.length > 0 && (
          <DashCard className="!p-3">
            <p className="text-sm">
              <span className="font-medium text-[oklch(0.2_0.02_265)]">{summaryParts[0]}</span>
              {summaryParts.length > 1 && (
                <span className="text-[oklch(0.5_0.02_265)]">
                  {" "}
                  — {summaryParts.slice(1).join(", ")}
                </span>
              )}
            </p>
          </DashCard>
        )}

        {/* Category views */}
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => setView(v.value)}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                view === v.value
                  ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                  : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Unread / Read / All — an explicit state the user chooses, rather
              than read mail being silently appended below unread mail. */}
          <div className="inline-flex h-9 items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs font-medium">
            {READ_STATES.map((rs) => (
              <button
                key={rs.value}
                onClick={() => setReadState(rs.value)}
                aria-pressed={readState === rs.value}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  readState === rs.value
                    ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                    : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }`}
              >
                {rs.label}
                <span className="ml-1.5 tabular-nums text-[oklch(0.6_0.02_265)]">
                  {rs.value === "unread"
                    ? unread.length
                    : rs.value === "read"
                      ? read.length
                      : inView.length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3">
            <Search className="h-3.5 w-3.5 text-[oklch(0.55_0.02_265)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, role, recruiter…"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-[oklch(0.6_0.02_265)]"
            />
          </div>
          {selectableIds.length > 0 && (
            <label className="flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-xs text-[oklch(0.45_0.02_265)]">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  // Indeterminate isn't expressible as a prop — it has to be
                  // set on the DOM node, so a partial selection reads as
                  // partial rather than as "none selected".
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
              />
              {allSelected ? "Clear all" : `Select all (${selectableIds.length})`}
            </label>
          )}

          {effectiveSelected.size > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-[oklch(0.5_0.02_265)]">
                {effectiveSelected.size} selected
              </span>
              <button
                onClick={() => handleBulk("accept")}
                disabled={resolveBulk.isPending}
                className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Add Selected
              </button>
              <button
                onClick={() => handleBulk("dismiss")}
                disabled={resolveBulk.isPending}
                className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
              >
                Dismiss Selected
              </button>
            </div>
          ) : (
            <button
              onClick={() => void handleSyncNow()}
              disabled={syncing}
              title="Syncs every connected Google product together — the same action everywhere in OfferLyst."
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          )}
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <DashCard>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">Loading…</p>
        </DashCard>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={
            search.trim()
              ? `No results for “${search.trim()}”`
              : (activeView?.emptyTitle ?? "Nothing here yet")
          }
          body={
            search.trim()
              ? "Try a different company, role or recruiter name."
              : (activeView?.emptyBody ??
                "New recruiter emails will show up here as reviewable suggestions after your next sync.")
          }
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <SuggestionGroupCard
              key={group.key}
              group={group}
              googleEmail={connection?.google_email ?? null}
              selectedIds={effectiveSelected}
              busyId={busyId}
              onToggleSelect={toggleSelect}
              onToggleSelectGroup={toggleSelectGroup}
              onReview={setReviewing}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Review opens the rich panel; "Edit…" inside it hands off to the
          existing field-level dialog, which stays the single place that
          builds an edited payload. */}
      {reviewing && !editing && (
        <ReviewPanel
          suggestion={reviewing}
          googleEmail={connection?.google_email ?? null}
          busy={busyId === reviewing.id}
          onClose={() => setReviewing(null)}
          onEdit={() => setEditing(reviewing)}
          onAccept={() => {
            const target = reviewing;
            setReviewing(null);
            handleAccept(target);
          }}
          onDismiss={() => {
            const target = reviewing;
            setReviewing(null);
            handleDismiss(target.id);
          }}
        />
      )}

      {editing && (
        <ReviewSuggestionDialog
          suggestion={editing}
          onClose={() => {
            setEditing(null);
            setReviewing(null);
          }}
        />
      )}
    </>
  );
}
