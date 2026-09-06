import { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { DashButton } from "@/components/dashboard/DashButton";

// ── SaveVersionDialog (Module 6D) ──
//
// Saving NEVER overwrites the resume — it creates a new version. The user names
// it (pre-filled, editable). Shows how many changes will be applied so the save
// is unambiguous.

type Props = {
  open: boolean;
  defaultName: string;
  acceptedCount: number;
  isPending: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
};

export function SaveVersionDialog({
  open,
  defaultName,
  acceptedCount,
  isPending,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(defaultName);

  // Re-seed the name each time the dialog opens (default may depend on the run).
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  if (!open) return null;

  const trimmed = name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-version-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={isPending ? undefined : onCancel}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-5">
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-3.5 top-4 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
            <Save className="h-4 w-4" />
          </div>

          <h2
            id="save-version-title"
            className="mt-3 font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Save as a new version
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Applying <span className="font-medium">{acceptedCount}</span> change
            {acceptedCount === 1 ? "" : "s"}. Your original resume stays untouched.
          </p>

          <label
            htmlFor="version-name"
            className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]"
          >
            Resume name
          </label>
          <input
            id="version-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) onSave(trimmed);
            }}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[oklch(0.25_0.02_265)] outline-none transition-colors focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
          />

          <div className="mt-4 flex flex-col gap-2">
            <DashButton onClick={() => trimmed && onSave(trimmed)} disabled={isPending || !trimmed}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Create version"
              )}
            </DashButton>
            <DashButton variant="outline" onClick={onCancel} disabled={isPending}>
              Cancel
            </DashButton>
          </div>
        </div>
      </div>
    </div>
  );
}
