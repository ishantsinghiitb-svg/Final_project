import type { ComponentType } from "react";
import { X } from "lucide-react";
import { DashButton } from "@/components/dashboard/DashButton";

type Props = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  question: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
};

/**
 * WorkflowPrompt
 *
 * A workflow-decision card rendered inside a sonner `toast.custom` (see
 * features/interviews/sync.tsx) — not a modal, doesn't block the page, but
 * reads as an important suggestion rather than a passing notification.
 * Reuses this app's existing dialog visual language (gradient accent strip,
 * DashButton hierarchy) so it feels native rather than like a new pattern.
 */
export function WorkflowPrompt({
  icon: Icon,
  title,
  question,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: Props) {
  return (
    <div className="relative w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)]">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

      <div className="p-5">
        <button
          onClick={onSecondary}
          aria-label="Close"
          className="absolute right-3 top-4 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] transition-colors hover:bg-black/[0.05]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[oklch(0.5_0.02_265)]">
              {title}
            </p>
            <p className="mt-1 font-display text-base font-semibold leading-snug text-[oklch(0.2_0.02_265)]">
              {question}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.5_0.02_265)]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <DashButton variant="outline" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </DashButton>
          <DashButton variant="primary" size="sm" onClick={onPrimary}>
            {primaryLabel}
          </DashButton>
        </div>
      </div>
    </div>
  );
}
