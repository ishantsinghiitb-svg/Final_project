import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useUpdateNotes } from "@/features/applications/hooks";
import type { Application } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  application: Application;
};

/**
 * ApplicationNotes
 *
 * Explicit Save/Cancel editing — no auto-save. Blocks in-app navigation and
 * the browser tab close/refresh while there are unsaved edits.
 */
export function ApplicationNotes({ application }: Props) {
  const original = application.notes ?? "";
  const [value, setValue] = useState(original);
  const updateNotes = useUpdateNotes(application.id);
  const hasChanges = value !== original;

  // Only resync from the server value when viewing a different application —
  // never mid-edit, so an in-flight save/cancel is never clobbered.
  useEffect(() => {
    setValue(application.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id]);

  useBlocker({
    shouldBlockFn: () => {
      if (!hasChanges) return false;
      return !window.confirm("You have unsaved notes. Leave without saving?");
    },
    enableBeforeUnload: true,
  });

  const handleSave = () => {
    if (!hasChanges || updateNotes.isPending) return;
    updateNotes.mutate(value, {
      onSuccess: () => toast.success("Notes saved."),
      onError: () => toast.error("Failed to save notes."),
    });
  };

  const handleCancel = () => {
    setValue(original);
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder="No notes yet. Start typing to add one…"
        className="w-full resize-y rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] px-3 py-2.5 text-sm leading-relaxed text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
          {hasChanges ? (
            <span className="text-[#F59E0B]">Unsaved changes</span>
          ) : application.notes_updated_at ? (
            <>
              <Check className="h-3 w-3 text-[#16A34A]" />
              Saved {formatDistanceToNow(parseISO(application.notes_updated_at), { addSuffix: true })}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancel}
            disabled={!hasChanges || updateNotes.isPending}
            className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateNotes.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors",
              hasChanges && !updateNotes.isPending
                ? "bg-gradient-to-br from-[#2563EB] to-[#7C3AED] hover:-translate-y-px shadow-[0_2px_8px_-2px_rgba(37,99,235,0.5)]"
                : "bg-black/10 cursor-not-allowed",
            )}
          >
            {updateNotes.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
