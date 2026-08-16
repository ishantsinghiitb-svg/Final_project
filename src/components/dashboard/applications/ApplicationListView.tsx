import { Link } from "@tanstack/react-router";
import type { Application, ApplicationStatus } from "@/types";
import { CompanyMark } from "@/components/dashboard/primitives";
import { StatusBadge } from "./ApplicationCard";
import { logoToneForCompany, formatSourceLabel } from "@/features/jobs/utils";
import { formatLocationDisplay } from "@/features/jobs/locationDisplay";
import { Calendar, MapPin, Banknote, Globe, Trash2, Archive, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
};

/**
 * ApplicationListView
 *
 * Tabular list view of applications — shows company, role, status,
 * applied date, location, salary, and source. Rows link to the detail page.
 */
export function ApplicationListView({ applications, onDelete, onArchive }: Props) {
  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No applications found</p>
        <p className="text-xs text-[oklch(0.55_0.02_265)]">
          Apply to a job and confirm "Did you apply?" to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-black/5 text-left text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
          {/* Explicit column widths. Left to auto-layout the table gave Company
              and Role too little room while Location kept a wide empty column,
              and the Applied cell was narrow enough to wrap "Aug 5, 2026" onto
              two lines. */}
          <tr>
            <th className="w-[22%] px-3 py-2.5">Company</th>
            <th className="w-[26%] px-3 py-2.5">Role</th>
            <th className="w-[13%] whitespace-nowrap px-3 py-2.5">Status</th>
            <th className="hidden w-[13%] whitespace-nowrap px-3 py-2.5 md:table-cell">Applied</th>
            <th className="hidden w-[16%] px-3 py-2.5 lg:table-cell">Location</th>
            <th className="hidden w-[10%] px-3 py-2.5 lg:table-cell">Source</th>
            <th className="w-[92px] px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.03]">
          {applications.map((app) => {
            const tone = logoToneForCompany(app.company_name);
            const location = formatLocationDisplay(app.location);
            const appliedDate = app.applied_at
              ? format(parseISO(app.applied_at), "MMM d, yyyy")
              : "—";

            return (
              <tr
                key={app.id}
                className="group relative transition-colors hover:bg-[oklch(0.99_0.005_265)]"
              >
                {/* Company */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <CompanyMark
                      company={app.company_name}
                      tone={tone}
                      size={26}
                      logoUrl={app.company_logo_url}
                    />
                    <span className="truncate font-medium text-[oklch(0.2_0.02_265)]">
                      {app.company_name}
                    </span>
                  </div>
                </td>

                {/* Role */}
                <td className="px-3 py-2.5">
                  <span className="line-clamp-2 text-xs leading-snug text-[oklch(0.35_0.02_265)]">
                    {app.role}
                  </span>
                </td>

                {/* Status */}
                <td className="px-3 py-2.5">
                  <StatusBadge status={app.status} />
                </td>

                {/* Applied date */}
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-[oklch(0.5_0.02_265)] md:table-cell">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {appliedDate}
                  </span>
                </td>

                {/* Location */}
                <td className="hidden px-3 py-2.5 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  {location ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{location}</span>
                    </span>
                  ) : (
                    <span className="text-[oklch(0.7_0.01_265)]">—</span>
                  )}
                </td>

                {/* Source */}
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  {app.source ? (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3 shrink-0" />
                      {formatSourceLabel(app.source)}
                    </span>
                  ) : (
                    <span className="text-[oklch(0.7_0.01_265)]">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Link
                      to="/dashboard/applications/$applicationId"
                      params={{ applicationId: app.id }}
                      aria-label="View application"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    {onArchive && (
                      <button
                        onClick={() => onArchive(app.id)}
                        aria-label="Archive application"
                        className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[oklch(0.2_0.02_265)] transition-colors"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(app.id)}
                      aria-label="Delete application"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>

                {/* Row link overlay */}
                <td className="absolute inset-0">
                  <Link
                    to="/dashboard/applications/$applicationId"
                    params={{ applicationId: app.id }}
                    className="absolute inset-0"
                    aria-hidden
                    tabIndex={-1}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
