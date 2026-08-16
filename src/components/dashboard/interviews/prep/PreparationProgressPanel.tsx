import { CalendarClock, CheckSquare, MessageSquareText } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

function daysUntil(scheduledAt: string): { label: string; tone: "past" | "soon" | "normal" } {
  const now = new Date();
  const target = new Date(scheduledAt);
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Already happened", tone: "past" };
  if (diffDays === 0) return { label: "Today", tone: "soon" };
  if (diffDays === 1) return { label: "Tomorrow", tone: "soon" };
  return { label: `In ${diffDays} days`, tone: diffDays <= 3 ? "soon" : "normal" };
}

function Stat({
  icon: Icon,
  label,
  value,
  fraction,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  fraction?: number;
  tone?: "soon";
}) {
  return (
    <div className="flex-1 min-w-[140px]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "soon" ? "text-[#B45309]" : "text-[oklch(0.2_0.02_265)]",
        )}
      >
        {value}
      </p>
      {fraction !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] transition-all"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

type Props = {
  scheduledAt: string;
  checklistTotal: number;
  checklistChecked: number;
  questionsTotal: number;
  questionsAnswered: number;
};

/**
 * §8 Preparation Progress — entirely computed from checklist state and how
 * many questions have an answer. Never AI-generated; the one section meant
 * to orient the user immediately, so it renders in full at the top of the
 * workspace (see refinement #1's progressive-disclosure note).
 */
export function PreparationProgressPanel({
  scheduledAt,
  checklistTotal,
  checklistChecked,
  questionsTotal,
  questionsAnswered,
}: Props) {
  const time = daysUntil(scheduledAt);

  return (
    <DashCard className="flex flex-wrap gap-5">
      <Stat
        icon={CalendarClock}
        label="Interview"
        value={time.label}
        tone={time.tone === "soon" ? "soon" : undefined}
      />
      <Stat
        icon={MessageSquareText}
        label="Questions answered"
        value={questionsTotal > 0 ? `${questionsAnswered} / ${questionsTotal}` : "—"}
        fraction={questionsTotal > 0 ? questionsAnswered / questionsTotal : undefined}
      />
      <Stat
        icon={CheckSquare}
        label="Checklist complete"
        value={checklistTotal > 0 ? `${checklistChecked} / ${checklistTotal}` : "—"}
        fraction={checklistTotal > 0 ? checklistChecked / checklistTotal : undefined}
      />
    </DashCard>
  );
}
