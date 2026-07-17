import { useState } from "react";
import { ChevronDown, Flag, X } from "lucide-react";
import { ALL_PRIORITIES, PRIORITY_META } from "@/features/applications/constants";
import type { ApplicationPriority } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  value: ApplicationPriority | null | undefined;
  onChange: (priority: ApplicationPriority | null) => void;
  isPending?: boolean;
};

/** Editable priority badge — mirrors the header's StatusSelector pattern. */
export function PrioritySelector({ value, onChange, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const meta = value ? PRIORITY_META[value] : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-2 text-sm font-medium transition-colors hover:border-black/10",
          isPending && "opacity-60 cursor-not-allowed",
        )}
      >
        {meta ? (
          <>
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
            <span className={meta.text}>{meta.label}</span>
          </>
        ) : (
          <>
            <Flag className="h-3.5 w-3.5 text-[oklch(0.55_0.02_265)]" />
            <span className="text-[oklch(0.5_0.02_265)]">Priority</span>
          </>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 text-[oklch(0.5_0.02_265)] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
          {ALL_PRIORITIES.map((p) => {
            const pm = PRIORITY_META[p];
            return (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                  p === value
                    ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                    : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", pm.dot)} />
                {pm.label}
              </button>
            );
          })}
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="flex w-full items-center gap-2.5 border-t border-black/5 px-3 py-2.5 text-sm text-[oklch(0.5_0.02_265)] hover:bg-black/[0.03] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear priority
            </button>
          )}
        </div>
      )}
    </div>
  );
}
