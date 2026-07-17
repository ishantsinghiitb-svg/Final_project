import { Link } from "@tanstack/react-router";
import { MapPin, Banknote, Calendar, MoreVertical, Trash2, Archive } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Application, ApplicationStatus } from "@/types";
import { CompanyMark, Chip } from "@/components/dashboard/primitives";
import { STATUS_META, ALL_STATUSES } from "@/features/applications/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

type Props = {
  application: Application;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  /** Used when rendering inside Kanban — enables native drag */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
};

function formatSalaryRange(app: Application): string | null {
  if (!app.salary_min && !app.salary_max) return null;
  const currency = app.salary_currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(n);

  if (app.salary_min && app.salary_max) {
    return `${fmt(app.salary_min)} – ${fmt(app.salary_max)}`;
  }
  if (app.salary_min) return `${fmt(app.salary_min)}+`;
  if (app.salary_max) return `Up to ${fmt(app.salary_max)}`;
  return null;
}

/**
 * ApplicationCard
 *
 * Used in both Kanban (draggable) and Grid views.
 * Includes a status dropdown and delete option via a ⋮ menu.
 */
export function ApplicationCard({
  application: app,
  onStatusChange,
  onDelete,
  onArchive,
  draggable = false,
  onDragStart,
}: Props) {
  const tone = logoToneForCompany(app.company_name);
  const meta = STATUS_META[app.status];
  const salary = formatSalaryRange(app);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => onDragStart(e, app.id) : undefined}
      className={cn(
        "group relative rounded-xl border border-black/5 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all",
        draggable &&
          "cursor-grab active:cursor-grabbing active:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.15)] active:scale-[1.02]",
        "hover:border-black/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)]",
      )}
    >
      {/* Header: company mark + name + menu */}
      <div className="flex items-start gap-2.5">
        <CompanyMark company={app.company_name} tone={tone} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[oklch(0.2_0.02_265)]">
            {app.company_name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[oklch(0.5_0.02_265)]">{app.role}</p>
        </div>
        {/* ⋮ menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-label="Application options"
            className="grid h-6 w-6 place-items-center rounded-md text-[oklch(0.55_0.02_265)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/[0.05]"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 w-52 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)]">
              {/* Status submenu */}
              <div className="border-b border-black/5 px-2 py-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
                  Move to
                </p>
                {ALL_STATUSES.filter((s) => s !== app.status).map((s) => {
                  const sm = STATUS_META[s];
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(app.id, s);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-black/[0.04]"
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />
                      {sm.label}
                    </button>
                  );
                })}
              </div>
              {/* Archive + Delete */}
              <div className="px-2 py-1.5">
                {onArchive && (
                  <button
                    onClick={() => {
                      onArchive(app.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.4_0.02_265)] hover:bg-black/[0.04]"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive application
                  </button>
                )}
                <button
                  onClick={() => {
                    onDelete(app.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete application
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status chip */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            meta.bg,
            meta.text,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-2.5 space-y-1">
        {app.location && (
          <div className="flex items-center gap-1 text-[11px] text-[oklch(0.55_0.02_265)]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{app.location}</span>
          </div>
        )}
        {salary && (
          <div className="flex items-center gap-1 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Banknote className="h-3 w-3 shrink-0" />
            <span className="truncate">{salary}</span>
          </div>
        )}
        {app.applied_at && (
          <div className="flex items-center gap-1 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Applied {format(parseISO(app.applied_at), "MMM d, yyyy")}</span>
          </div>
        )}
      </div>

      {/* View detail link */}
      <Link
        to="/dashboard/applications/$applicationId"
        params={{ applicationId: app.id }}
        className="absolute inset-0 rounded-xl"
        aria-label={`View ${app.role} at ${app.company_name}`}
        onClick={(e) => {
          // Don't navigate when clicking menu
          if (menuOpen) e.preventDefault();
        }}
      />
    </div>
  );
}

// ── StatusBadge (small reusable) ─────────────────────────────────────────────
export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.bg,
        meta.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
