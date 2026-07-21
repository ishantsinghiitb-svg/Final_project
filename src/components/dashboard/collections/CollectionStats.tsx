import { Briefcase, Globe, Wifi, Clock } from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { formatSourceLabel } from "@/features/jobs/utils";
import type { GlobalJob } from "@/types";

type Props = { jobs: GlobalJob[] };

function tally(items: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    m.set(item, (m.get(item) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function StatTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DashCard>
      <div className="flex items-center gap-1.5 text-[oklch(0.5_0.02_265)]">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <div className="mt-2">{children}</div>
    </DashCard>
  );
}

/**
 * CollectionStats — Total Jobs, Sources, Work Modes, Employment Types.
 * Deliberately lightweight (no charts): tallies fields already present on the
 * collection's already-fetched GlobalJob rows, rendered as Chips. No new
 * query, no new metadata.
 */
export function CollectionStats({ jobs }: Props) {
  const sources = tally(jobs.map((j) => j.source));
  const workModes = tally(jobs.map((j) => j.work_mode));
  const employmentTypes = tally(jobs.map((j) => j.employment_type));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile icon={Briefcase} label="Total Jobs">
        <p className="font-display text-2xl font-semibold text-[oklch(0.2_0.02_265)]">{jobs.length}</p>
      </StatTile>

      <StatTile icon={Globe} label="Sources">
        {sources.length === 0 ? (
          <p className="text-xs text-[oklch(0.55_0.02_265)]">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sources.map(([source, count]) => (
              <Chip key={source} tone="default">
                {formatSourceLabel(source)} × {count}
              </Chip>
            ))}
          </div>
        )}
      </StatTile>

      <StatTile icon={Wifi} label="Work Modes">
        {workModes.length === 0 ? (
          <p className="text-xs text-[oklch(0.55_0.02_265)]">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {workModes.map(([mode, count]) => (
              <Chip key={mode} tone={mode === "Remote" ? "green" : mode === "Hybrid" ? "blue" : "default"}>
                {mode} × {count}
              </Chip>
            ))}
          </div>
        )}
      </StatTile>

      <StatTile icon={Clock} label="Employment Types">
        {employmentTypes.length === 0 ? (
          <p className="text-xs text-[oklch(0.55_0.02_265)]">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {employmentTypes.map(([type, count]) => (
              <Chip key={type} tone="default">
                {type} × {count}
              </Chip>
            ))}
          </div>
        )}
      </StatTile>
    </div>
  );
}
