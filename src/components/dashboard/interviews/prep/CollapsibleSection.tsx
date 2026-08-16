import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

type Props = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Short summary shown next to the title, e.g. a count badge. */
  meta?: ReactNode;
  /** Progressive disclosure (refinement #1): collapsed by default unless the caller has a reason to show it open. */
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * CollapsibleSection
 *
 * The one disclosure primitive every Interview Preparation workspace panel
 * uses (Module 7B) — local to this feature, not shared with other AI
 * modules. Keeps the workspace scannable: a title and a one-line summary are
 * always visible, the detail is a click away.
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  meta,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <DashCard padded={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
          {title}
        </span>
        {meta && <span className="text-xs text-[oklch(0.55_0.02_265)]">{meta}</span>}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-[oklch(0.55_0.02_265)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="space-y-3 border-t border-black/5 px-5 py-4">{children}</div>}
    </DashCard>
  );
}
