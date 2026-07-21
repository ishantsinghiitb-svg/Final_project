import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { COLLECTION_COLOR_META, COLLECTION_COLOR_OPTIONS, DEFAULT_COLLECTION_COLOR } from "@/features/collections/constants";
import type { CollectionColor } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string | null;
  initialColor?: CollectionColor | null;
  isPending: boolean;
  onSubmit: (fields: { name: string; description?: string; color: CollectionColor }) => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";

const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

/**
 * CollectionFormDialog
 *
 * Shared Create + Rename modal (Module 5B) — which mutation it drives is the
 * caller's decision (via `onSubmit`); this component only owns the form.
 * Follows the same hand-rolled modal shell as AddApplicationDialog /
 * ArchivedApplicationsPanel (fixed overlay, gradient top bar, slide-in) so it
 * matches the rest of the dashboard's dialogs.
 */
export function CollectionFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initialName = "",
  initialDescription,
  initialColor,
  isPending,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [color, setColor] = useState<CollectionColor>(initialColor ?? DEFAULT_COLLECTION_COLOR);

  // Resync from the caller's initial values whenever the dialog (re)opens —
  // e.g. opening "Edit" on a different collection right after another.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription ?? "");
      setColor(initialColor ?? DEFAULT_COLLECTION_COLOR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const isValid = name.trim().length > 0;

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isPending) return;
    onSubmit({ name: name.trim(), description: description.trim() || undefined, color });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-form-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="max-h-[85vh] overflow-y-auto p-6">
          <button
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 id="collection-form-title" className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
            {title}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className={labelClass} htmlFor="collection-name">
                Name
              </label>
              <input
                id="collection-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dream Companies"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="collection-description">
                Description <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <textarea
                id="collection-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What ties these jobs together…"
                className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              />
            </div>

            <div>
              <p className={labelClass}>Color</p>
              <div className="flex items-center gap-2">
                {COLLECTION_COLOR_OPTIONS.map((c) => {
                  const meta = COLLECTION_COLOR_META[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={meta.label}
                      aria-pressed={color === c}
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110",
                        color === c && "ring-2 ring-offset-2 ring-[#2563EB]/50",
                      )}
                    >
                      <span className={cn("h-5 w-5 rounded-full", meta.dot)} />
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!isValid || isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
