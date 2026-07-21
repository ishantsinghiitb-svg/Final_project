import { Link } from "@tanstack/react-router";
import { Briefcase, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { DashCard } from "@/components/dashboard/primitives";
import { COLLECTION_COLOR_META } from "@/features/collections/constants";
import { formatSourceLabel } from "@/features/jobs/utils";
import type { CollectionWithStats } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  collection: CollectionWithStats;
  onEdit: (collection: CollectionWithStats) => void;
  onDelete: (collection: CollectionWithStats) => void;
};

/**
 * CollectionCard — grid tile for the Collections page. The whole card body
 * (name, stats, source breakdown, last updated) is one Link, matching the
 * Job Card's "identity area navigates, actions are siblings" convention; Edit
 * / Delete sit in a separate footer row below, outside the Link, so they
 * never conflict with the click target. No charts — a small source-count
 * list only.
 */
export function CollectionCard({ collection, onEdit, onDelete }: Props) {
  const colorMeta = COLLECTION_COLOR_META[collection.color ?? "default"] ?? COLLECTION_COLOR_META.default;

  return (
    <DashCard className="group flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200">
      <Link to="/dashboard/collections/$collectionId" params={{ collectionId: collection.id }} className="flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorMeta.dot)} aria-hidden />
          <p className="truncate font-display font-semibold text-[oklch(0.2_0.02_265)] transition-colors group-hover:text-[#2563EB]">
            {collection.name}
          </p>
        </div>

        {collection.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
            {collection.description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-[oklch(0.25_0.02_265)]">
          <Briefcase className="h-3.5 w-3.5 text-[oklch(0.5_0.02_265)]" />
          {collection.job_count} {collection.job_count === 1 ? "Job" : "Jobs"}
        </div>

        {collection.top_sources.length > 0 && (
          <ul className="mt-2 space-y-1">
            {collection.top_sources.map((s) => (
              <li key={s.source} className="text-xs text-[oklch(0.5_0.02_265)]">
                {formatSourceLabel(s.source)}
                <span className="mx-1.5 text-[oklch(0.7_0.02_265)]">•</span>
                <span className="font-medium text-[oklch(0.4_0.02_265)]">{s.count}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-[oklch(0.55_0.02_265)]">
          Updated {formatDistanceToNow(parseISO(collection.updated_at), { addSuffix: true })}
        </p>
      </Link>

      <div className="mt-4 flex items-center gap-2 border-t border-black/5 pt-3">
        <button
          onClick={() => onEdit(collection)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)] transition-colors hover:bg-black/[0.03]"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          onClick={() => onDelete(collection)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </DashCard>
  );
}
