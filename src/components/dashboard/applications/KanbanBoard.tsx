import { useState, useCallback } from "react";
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

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, col: ApplicationStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverColumn(col);
    },
    [],
  );

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
    <div className="flex gap-3 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const meta = STATUS_META[col];
        const cards = grouped[col] ?? [];
        const isOver = overColumn === col;

        return (
          <div
            key={col}
            className="flex shrink-0 flex-col"
            style={{ width: 260 }}
          >
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
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 py-8">
                  <p className="text-center text-[11px] text-[oklch(0.6_0.02_265)]">
                    Drop here
                  </p>
                </div>
              )}

              {isOver && (
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-[#2563EB]/40 bg-[#2563EB]/[0.04] py-8">
                  <p className="text-center text-[11px] text-[#2563EB]">
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
