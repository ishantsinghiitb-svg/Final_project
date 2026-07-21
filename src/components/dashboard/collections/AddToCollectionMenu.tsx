import { useEffect, useRef, useState } from "react";
import { Check, FolderKanban, FolderPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useCollections,
  useJobCollectionIds,
  useAddJobToCollection,
  useRemoveJobFromCollection,
  useCreateCollection,
} from "@/features/collections/hooks";
import { COLLECTION_COLOR_META } from "@/features/collections/constants";
import type { GlobalJob } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  job: GlobalJob;
  className?: string;
  /** When provided, the trigger renders as an icon+label pill (matching sibling
   *  header buttons like Save/Share) instead of the compact square icon button
   *  used in list rows and cards. */
  label?: string;
};

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * AddToCollectionMenu
 *
 * A job does NOT need to be saved first — this mounts on the Jobs page, Job
 * Details, Saved Jobs, Collection Details, and Application Details alike,
 * letting a job be filed into any number of collections directly. Visually
 * matches the dashboard's other popover menus (StatusSelector, PrioritySelector,
 * ArchivedApplicationsPanel): rounded-xl panel, the same tinted-row selected
 * state, the same shadow.
 *
 * Checking/unchecking a collection only stages a local selection — nothing is
 * written until "Add" is clicked (mirroring ApplicationNotes' explicit
 * Save/Cancel pattern), at which point only the CHANGED memberships are
 * committed via the existing optimistic useAddJobToCollection /
 * useRemoveJobFromCollection mutations.
 */
export function AddToCollectionMenu({ job, className, label }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: collections = [], isLoading } = useCollections();
  const { data: memberIds = [], isLoading: membershipLoading } = useJobCollectionIds(job.id);
  const addJob = useAddJobToCollection();
  const removeJob = useRemoveJobFromCollection();
  const createCollection = useCreateCollection();

  // Staged selection — `pending` is what the checkboxes show; `committed` is
  // what's actually persisted. Both are (re)seeded from the server only the
  // moment the popover becomes ready (open AND membership loaded), never on a
  // background refetch while the user is mid-edit — see the ready-transition
  // guard below.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState<Set<string>>(new Set());
  const wasReadyRef = useRef(false);

  useEffect(() => {
    const ready = open && !membershipLoading;
    if (ready && !wasReadyRef.current) {
      setPending(new Set(memberIds));
      setCommitted(new Set(memberIds));
    }
    wasReadyRef.current = ready;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membershipLoading]);

  const hasChanges = !setsEqual(pending, committed);

  const toggle = (collectionId: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const handleCancel = () => {
    setPending(new Set(committed));
    setOpen(false);
  };

  const handleAdd = async () => {
    const toAdd = [...pending].filter((id) => !committed.has(id));
    const toRemove = [...committed].filter((id) => !pending.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    setSubmitting(true);
    try {
      await Promise.all([
        ...toAdd.map((collectionId) => addJob.mutateAsync({ collectionId, jobId: job.id })),
        ...toRemove.map((collectionId) => removeJob.mutateAsync({ collectionId, jobId: job.id })),
      ]);
      setCommitted(new Set(pending));
      toast.success("Collections updated.");
      setOpen(false);
    } catch {
      toast.error("Failed to update collections. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name || createCollection.isPending) return;

    createCollection.mutate(
      { name },
      {
        onSuccess: (created) => {
          addJob.mutate(
            { collectionId: created.id, jobId: job.id },
            {
              onSuccess: () => {
                // Already persisted via its own mutation — reflect it in both
                // the staged and committed sets so it isn't re-submitted (or
                // undone by Cancel) when the Add/Cancel footer is used.
                setPending((prev) => new Set(prev).add(created.id));
                setCommitted((prev) => new Set(prev).add(created.id));
              },
            },
          );
          setNewName("");
          setCreating(false);
          toast.success(`Created "${created.name}" and added this job.`);
        },
        onError: () => toast.error("Failed to create collection."),
      },
    );
  };

  const memberCount = memberIds.length;

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : handleCancel())}>
      <PopoverTrigger asChild>
        {label ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]",
              className,
            )}
          >
            <FolderPlus className={cn("h-4 w-4", memberCount > 0 && "text-[#2563EB]")} />
            {label}
          </button>
        ) : (
          <button
            type="button"
            aria-label={memberCount > 0 ? `In ${memberCount} collection(s)` : "Add to collection"}
            title="Add to collection"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]",
              className,
            )}
          >
            <FolderPlus className={cn("h-4 w-4", memberCount > 0 && "text-[#2563EB]")} />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 overflow-hidden rounded-xl border border-black/5 bg-white p-0 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]"
      >
        <div className="border-b border-black/5 px-3.5 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
            Collections
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
          </div>
        ) : collections.length === 0 && !creating ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
            <FolderKanban className="h-5 w-5 text-[oklch(0.7_0.02_265)]" />
            <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No collections yet</p>
            <p className="text-xs text-[oklch(0.55_0.02_265)]">Create one below to get started.</p>
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1">
            {collections.map((c) => {
              const colorMeta = COLLECTION_COLOR_META[c.color ?? "default"] ?? COLLECTION_COLOR_META.default;
              const checked = pending.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors",
                      checked
                        ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                        : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                        checked ? "border-[#2563EB] bg-[#2563EB] text-white" : "border-black/20 bg-white",
                      )}
                      aria-hidden
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", colorMeta.dot)} aria-hidden />
                    <span className="truncate">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-black/5 p-1.5">
          {creating ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Collection name"
                className="h-8 flex-1 rounded-lg border border-black/5 bg-white px-2.5 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] outline-none transition-colors focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createCollection.isPending}
                aria-label="Create collection"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2563EB] text-white transition-colors disabled:opacity-50"
              >
                {createCollection.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB]/5"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Collection
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/5 bg-[oklch(0.97_0.01_265)] px-3.5 py-2.5">
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleAdd()}
            disabled={!hasChanges || submitting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors",
              hasChanges && !submitting
                ? "bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-[0_2px_8px_-2px_rgba(37,99,235,0.5)] hover:-translate-y-px"
                : "cursor-not-allowed bg-black/10",
            )}
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
