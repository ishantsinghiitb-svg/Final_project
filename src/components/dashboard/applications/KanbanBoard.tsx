import { useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import type { Application, ApplicationStatus } from "@/types";
import { KANBAN_COLUMNS, STATUS_META } from "@/features/applications/constants";
import { ApplicationCard } from "./ApplicationCard";
import { cn } from "@/lib/utils";

type Props = {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
};

/**
 * KanbanBoard
 *
 * Trello / Linear-style Kanban (Applied → Rejected).
 * Uses native HTML5 Drag & Drop API — no additional packages required.
 *
 * Drag behaviour:
 *   - onDragStart: stores the dragged card ID in dataTransfer + state
 *   - onDragOver: sets the column as the drop target (visual cue)
 *   - onDrop: calls onStatusChange → optimistic update → Supabase
 */
export function KanbanBoard({ applications, onStatusChange, onDelete, onArchive }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ApplicationStatus | null>(null);

  const grouped = KANBAN_COLUMNS.reduce<Record<ApplicationStatus, Application[]>>(
    (acc, col) => {
      acc[col] = applications.filter((a) => a.status === col);
      return acc;
    },
    {} as Record<ApplicationStatus, Application[]>,
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, col: ApplicationStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverColumn(col);
  }, []);

  const handleDragLeave = useCallback(() => {
    setOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, col: ApplicationStatus) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || draggingId;
      setDraggingId(null);
      setOverColumn(null);
      if (!id) return;
      const app = applications.find((a) => a.id === id);
      if (!app || app.status === col) return;
      onStatusChange(id, col);
    },
    [draggingId, applications, onStatusChange],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverColumn(null);
  }, []);

  return (
    <div className="scrollbar-hide flex gap-3 overflow-x-auto scroll-smooth pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const meta = STATUS_META[col];
        const cards = grouped[col] ?? [];
        const isOver = overColumn === col;

        return (
          <div key={col} className="flex shrink-0 flex-col" style={{ width: 260 }}>
            {/* Column header */}
            <div
              className={cn(
                "mb-2 flex items-center justify-between rounded-xl px-3 py-2 transition-colors",
                isOver ? "bg-[oklch(0.95_0.02_265)]" : "bg-[oklch(0.98_0.005_265)]",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[oklch(0.3_0.02_265)]">
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                {meta.label}
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  cards.length > 0
                    ? `${meta.bg} ${meta.text}`
                    : "bg-black/[0.04] text-[oklch(0.5_0.02_265)]",
                )}
              >
                {cards.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col)}
              className={cn(
                "flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-2 transition-all",
                isOver
                  ? "border-[#2563EB]/40 bg-[#2563EB]/[0.03]"
                  : "border-transparent bg-transparent",
              )}
            >
              {cards.map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={app}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  onArchive={onArchive}
                  draggable
                  onDragStart={handleDragStart}
                />
              ))}

              {cards.length === 0 && !isOver && (
                <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/10 bg-black/[0.012] px-3 py-8 text-center transition-colors hover:border-black/20 hover:bg-black/[0.025]">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-black/[0.04] text-[oklch(0.6_0.02_265)]">
                    <ArrowDown className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium text-[oklch(0.5_0.02_265)]">
                    Drag an application here
                  </p>
                  <p className="text-[11px] text-[oklch(0.6_0.02_265)]">
                    to move it into {meta.label}
                  </p>
                </div>
              )}

              {isOver && (
                <div className="flex animate-in fade-in min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#2563EB]/50 bg-[#2563EB]/[0.06] py-8 duration-150">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[#2563EB]/15 text-[#2563EB]">
                    <ArrowDown className="h-4 w-4" />
                  </div>
                  <p className="text-center text-xs font-semibold text-[#2563EB]">
                    Move to {meta.label}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
