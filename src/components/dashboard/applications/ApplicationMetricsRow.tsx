import { useMemo } from "react";
import { Briefcase, Users, Award, Target } from "lucide-react";
import type { Application } from "@/types";
import { DashCard } from "@/components/dashboard/primitives";

type Props = {
  applications: Application[];
};

/**
 * ApplicationMetricsRow
 *
 * Summary cards above the Applications board — always reflects the full
 * active (non-archived) pipeline, independent of the board/list search and
 * filter selections below it.
 */
export function ApplicationMetricsRow({ applications }: Props) {
  const metrics = useMemo(() => {
    const total = applications.length;
    const interviews = applications.filter((a) => a.status === "interview").length;
    const offersReceived = applications.filter(
      (a) => a.status === "offer" || a.status === "accepted",
    ).length;
    const accepted = applications.filter((a) => a.status === "accepted").length;
    // Acceptance Rate = Accepted / Total applications × 100 (0% with no applications).
    // Deliberately independent of the Offer stage — see the Offers card above.
    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return { total, interviews, offersReceived, acceptanceRate };
  }, [applications]);

  const cards = [
    {
      label: "Total Applications",
      value: metrics.total,
      icon: Briefcase,
      tone: "text-[#2563EB]",
    },
    {
      label: "Interviews",
      value: metrics.interviews,
      icon: Users,
      tone: "text-[#7C3AED]",
    },
    {
      label: "Offers",
      value: metrics.offersReceived,
      icon: Award,
      tone: "text-[#16A34A]",
    },
    {
      label: "Acceptance Rate",
      value: `${metrics.acceptanceRate}%`,
      icon: Target,
      tone: "text-[#F59E0B]",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <DashCard key={c.label}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">{c.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{c.value}</p>
            </div>
            <c.icon className={`h-4 w-4 ${c.tone}`} />
          </div>
        </DashCard>
      ))}
    </div>
  );
}
