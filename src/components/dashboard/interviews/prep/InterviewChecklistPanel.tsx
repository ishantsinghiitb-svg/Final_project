import { CheckSquare } from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { CHECKLIST_CATEGORY_LABELS } from "@/features/interview-prep/constants";
import type { ChecklistCategory, InterviewPrepContent } from "@/features/interview-prep/types";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: ChecklistCategory[] = ["logistics", "research", "practice", "materials"];

type Props = {
  checklist: InterviewPrepContent["checklist"];
  checked: string[];
  onToggle: (id: string) => void;
};

/**
 * §7 Interview Checklist — always shown in full (short, actionable, low cost
 * to display, unlike the longer generated sections). Checked state is plain
 * user-tracked progress, never AI, never a credit.
 */
export function InterviewChecklistPanel({ checklist, checked, onToggle }: Props) {
  if (checklist.length === 0) return null;
  const checkedSet = new Set(checked);

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: checklist.filter((c) => c.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <DashCard>
      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <CheckSquare className="h-4 w-4 text-[#7C3AED]" /> Interview Checklist
        </span>
      </SectionTitle>
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.category}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
              {CHECKLIST_CATEGORY_LABELS[group.category]}
            </p>
            <div className="mt-1.5 space-y-1">
              {group.items.map((item) => {
                const isChecked = checkedSet.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-black/[0.02]"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(item.id)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
                    />
                    <span
                      className={cn(
                        "text-sm text-[oklch(0.3_0.02_265)]",
                        isChecked && "text-[oklch(0.6_0.02_265)] line-through",
                      )}
                    >
                      {item.item}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DashCard>
  );
}
