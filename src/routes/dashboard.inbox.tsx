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
  useGmailConnection,
  useGmailSuggestions,
  useResolveGmailSuggestion,
  useResolveGmailSuggestions,
  useSyncGmailNow,
} from "@/features/gmail/hooks";
import { groupSuggestions } from "@/features/gmail/grouping";
import {
  VIEWS,
  applyView,
  READ_FILTERS,
  applyReadFilter,
  type InboxView,
  type ReadFilter,
} from "@/features/gmail/views";
import type { GmailSuggestionFilter, GmailSuggestionType } from "@/features/gmail/types";
import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";

export const Route = createFileRoute("/dashboard/inbox")({
  head: () => ({
    meta: [{ title: "Recruiter Inbox — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: InboxPage,
});

const STATUS_FILTERS: { value: GmailSuggestionFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  // The stored status value stays "accepted" — only the label changes, to
  // match the "Add Application" wording on the action itself.
  { value: "accepted", label: "Added" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const TYPE_SUMMARY_LABEL: Record<GmailSuggestionType, string> = {
  create_application: "new application",
  update_application: "status update",
  create_interview: "interview",
  add_reminder: "reminder",
  import_attachment: "attachment",
};

function summarize(pending: GmailSuggestionListItem[]): string[] {
  if (pending.length === 0) return [];
  const counts = new Map<GmailSuggestionType, number>();
  for (const item of pending) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);

  const parts = [`${pending.length} item${pending.length === 1 ? "" : "s"} need attention`];
  for (const [type, count] of counts) {
    parts.push(`${count} ${TYPE_SUMMARY_LABEL[type]}${count === 1 ? "" : "s"}`);
  }
  return parts;
}

function InboxPage() {
  const { data: connection } = useGmailConnection();
  const [status, setStatus] = useState<GmailSuggestionFilter>("pending");
  const [view, setView] = useState<InboxView>("all");
  // Defaults to Unread so the Inbox opens as a short actionable list rather
  // than a full archive. Purely a VIEW filter — "All" always brings back
  // every stored recruiter email, so nothing is lost by having read it in
  // Gmail first (see applyReadFilter).
  const [readFilter, setReadFilter] = useState<ReadFilter>("unread");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<GmailSuggestionListItem | null>(null);
  const [editing, setEditing] = useState<GmailSuggestionListItem | null>(null);
  // Per-row busy state, so accepting one card doesn't disable every card's
  // buttons (a single shared `resolveOne.isPending` would).
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: suggestions = [], isLoading } = useGmailSuggestions(status, search);
  // Independent of the current filter/search — the summary always reflects
  // the whole actionable queue, not whatever view is currently selected.
  const { data: pendingForSummary = [] } = useGmailSuggestions("pending", "");

  const resolveOne = useResolveGmailSuggestion();
  const resolveBulk = useResolveGmailSuggestions();
  // Same trigger as Settings' "Sync Now" — GmailSyncService.syncUser, no
  // separate Inbox-specific sync path. Living here too means the user never
  // has to leave the Inbox just to pull in new mail.
  const syncNow = useSyncGmailNow();

  const visible = useMemo(
    () => applyReadFilter(applyView(suggestions, view), readFilter),
    [suggestions, view, readFilter],
  );
  const groups = useMemo(() => groupSuggestions(visible), [visible]);
  const summaryParts = useMemo(() => summarize(pendingForSummary), [pendingForSummary]);
  const isConnected = Boolean(connection) && connection?.status !== "disconnected";

  // Only pending suggestions are actionable (accepted/dismissed rows don't
  // render a checkbox), so every selection operation is scoped to them.
  const selectableIds = useMemo(
    () => visible.filter((i) => i.status === "pending").map((i) => i.id),
    [visible],
  );

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

  /** Master toggle — selects every pending suggestion in the current view, or clears them. */
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
  function handleAccept(item: GmailSuggestionListItem) {
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

  /** Identical outcome handling to Settings' "Sync Now" — same server function, same toast copy. */
  async function handleSyncNow() {
    const result = await syncNow.mutateAsync();
    if (result.status === "synced") {
      toast.success(
        result.suggestionsCreated > 0
          ? `Sync complete — ${result.suggestionsCreated} new update${result.suggestionsCreated === 1 ? "" : "s"} to review.`
          : "Sync complete — nothing new.",
      );
    } else if (result.status === "skipped" && result.reason === "needs_reauth") {
      toast.error("Gmail access was revoked — please reconnect.");
    } else if (result.status === "skipped" && result.reason === "already_syncing") {
      toast.error("A sync is already in progress.");
    } else if (result.status === "error") {
      toast.error(result.message);
    }
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
          body="Connect Gmail from Settings to automatically detect recruiter emails and turn them into reviewable suggestions — nothing is ever created without your approval."
          cta={<DashButtonLink to="/dashboard/settings">Go to Settings</DashButtonLink>}
        />
      </>
    );
  }

  const activeView = VIEWS.find((v) => v.value === view);

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Recruiter Inbox"
          title="Review what Gmail found."
          subtitle="Every suggestion explains why it's here. Nothing is created or changed until you say so."
        />

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

        {/* Category / time views */}
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
          {/* Gmail read state — a view filter only; "All" restores everything. */}
          <div className="flex gap-1 rounded-xl border border-black/5 bg-white p-0.5">
            {READ_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setReadFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  readFilter === f.value
                    ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                    : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-xl border border-black/5 bg-white p-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs ${
                  status === f.value
                    ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                    : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }`}
              >
                {f.label}
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
              disabled={syncNow.isPending}
              title="Pull in new Gmail messages now — same action as Settings' Sync Now"
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
            >
              {syncNow.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncNow.isPending ? "Syncing…" : "Sync Now"}
            </button>
          )}
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <DashCard>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">Loading…</p>
        </DashCard>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={
            search.trim()
              ? `No results for “${search.trim()}”`
              : readFilter === "unread"
                ? "No unread recruiter email"
                : (activeView?.emptyTitle ?? "Nothing here yet")
          }
          body={
            search.trim()
              ? "Try a different company, role or recruiter name."
              : readFilter === "unread"
                ? // Critical to say this: the Inbox defaults to Unread, so an
                  // empty screen here does NOT mean nothing was found. Without
                  // this the user would reasonably conclude detection failed.
                  "You're showing unread mail only — switch to All to see everything NextOffer has found, including emails you've already opened in Gmail."
                : (activeView?.emptyBody ??
                  "New recruiter emails will show up here as reviewable suggestions after your next sync.")
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
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
