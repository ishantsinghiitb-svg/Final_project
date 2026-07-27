import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IMPROVEMENT_PRIORITIES,
  type ImprovementPriority,
} from "@/features/ai/schemas/improvement";

// ── ActionPlanList (presentation-only, shared across reports) ──
//
// The prioritized checklist every AI report leads with. Reports feel like an
// improvement PLAN a user works top-down: actions grouped into priority tiers
// (Top priority → High ROI → Quick wins → Nice to have), each "What → Why →
// How → Example → expand for detail". Generic and analysis-free — Match / ATS
// map their OWN already-computed fields into `ActionItem[]` locally; this
// component only groups (by the priority the model assigned) and renders them
// collapsibly. It never invents a finding, a score, or a recommendation. Items
// without a priority fall back to a single flat list (legacy cached analyses).

export type ActionItem = {
  id: string;
  /** The action headline — the "What should I do?". */
  title: string;
  /** Short type/theme tag (e.g. "Add", "Keyword", "Positioning"). Optional. */
  tag?: string;
  /** Priority tier — drives the grouped headers. Absent → flat list. */
  priority?: ImprovementPriority;
  /** Why it matters — shown collapsed as the one-line subtitle. */
  why?: string;
  /** How to do it — shown when expanded. */
  how?: string;
  /** A concrete example — shown when expanded, when present. */
  example?: string;
  /** Expected benefit — shown when expanded, when present. */
  benefit?: string;
};

const TIER_META: Record<ImprovementPriority, { label: string; dot: string }> = {
  critical: { label: "Top priority", dot: "bg-[#E11D48]" },
  high: { label: "High ROI", dot: "bg-[#F59E0B]" },
  quick_win: { label: "Quick wins", dot: "bg-[#2563EB]" },
  nice_to_have: { label: "Nice to have", dot: "bg-[#16A34A]" },
};

function ActionRow({ item, index }: { item: ActionItem; index: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(item.how || item.example || item.benefit);

  return (
    <div className="rounded-xl border border-black/5 bg-white">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-3 px-3 py-2.5 text-left",
          hasDetail && "cursor-pointer",
        )}
      >
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2563EB]/10 text-[10px] font-semibold text-[#2563EB]">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{item.title}</span>
            {item.tag && (
              <span className="shrink-0 rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.5_0.02_265)]">
                {item.tag}
              </span>
            )}
          </span>
          {item.why && (
            <span className="mt-0.5 block text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
              {item.why}
            </span>
          )}
        </span>
        {hasDetail && (
          <ChevronDown
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.6_0.02_265)] transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && hasDetail && (
        <div className="space-y-1.5 border-t border-black/5 px-3 py-2.5 pl-11">
          {item.how && (
            <p className="text-xs leading-relaxed text-[oklch(0.4_0.02_265)]">
              <span className="font-semibold text-[oklch(0.3_0.02_265)]">How: </span>
              {item.how}
            </p>
          )}
          {item.benefit && (
            <p className="text-xs leading-relaxed text-[oklch(0.4_0.02_265)]">
              <span className="font-semibold text-[oklch(0.3_0.02_265)]">Benefit: </span>
              {item.benefit}
            </p>
          )}
          {item.example && (
            <p className="rounded-lg bg-black/[0.02] px-2.5 py-2 text-xs italic leading-relaxed text-[oklch(0.45_0.02_265)]">
              {item.example}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionPlanList({
  items,
  title = "Improvement plan",
  emptyLabel,
}: {
  items: ActionItem[];
  title?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-sm text-[oklch(0.5_0.02_265)]">{emptyLabel}</p> : null;
  }

  const header = (
    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
      <Target className="h-3.5 w-3.5 text-[#7C3AED]" />
      {title} <span className="text-[oklch(0.6_0.02_265)]">({items.length})</span>
    </p>
  );

  // Group into priority tiers when the model assigned priorities. Numbering runs
  // continuously across tiers so it reads as one top-down checklist.
  const hasPriority = items.some((i) => i.priority);
  if (!hasPriority) {
    return (
      <section>
        {header}
        <div className="mt-2.5 space-y-1.5">
          {items.map((item, i) => (
            <ActionRow key={item.id} item={item} index={i} />
          ))}
        </div>
      </section>
    );
  }

  let offset = 0;
  const groups = IMPROVEMENT_PRIORITIES.map((tier) => {
    const group = items.filter((i) => (i.priority ?? "high") === tier);
    const start = offset;
    offset += group.length;
    return { tier, group, start };
  }).filter((g) => g.group.length > 0);

  return (
    <section>
      {header}
      <div className="mt-3 space-y-4">
        {groups.map(({ tier, group, start }) => (
          <div key={tier}>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-[oklch(0.45_0.02_265)]">
              <span className={cn("h-2 w-2 rounded-full", TIER_META[tier].dot)} />
              {TIER_META[tier].label}
              <span className="text-[oklch(0.6_0.02_265)]">({group.length})</span>
            </p>
            <div className="mt-2 space-y-1.5">
              {group.map((item, i) => (
                <ActionRow key={item.id} item={item} index={start + i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
