import { Link } from "@tanstack/react-router";
import type { Application, ApplicationStatus } from "@/types";
import { CompanyMark } from "@/components/dashboard/primitives";
import { StatusBadge } from "./ApplicationCard";
import { logoToneForCompany } from "@/features/jobs/utils";
import { Calendar, MapPin, Banknote, Globe, Trash2, ArrowUpRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
};

/**
 * ApplicationListView
 *
 * Tabular list view of applications — shows company, role, status,
 * applied date, location, salary, and source. Rows link to the detail page.
 */
export function ApplicationListView({ applications, onDelete }: Props) {
  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">
          No applications found
        </p>
        <p className="text-xs text-[oklch(0.55_0.02_265)]">
          Apply to a job and confirm "Did you apply?" to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-black/5 text-left text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
          <tr>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="hidden px-4 py-3 md:table-cell">Applied</th>
            <th className="hidden px-4 py-3 lg:table-cell">Location</th>
            <th className="hidden px-4 py-3 lg:table-cell">Source</th>
            <th className="w-8 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.03]">
          {applications.map((app) => {
            const tone = logoToneForCompany(app.company_name);
            const appliedDate = app.applied_at
              ? format(parseISO(app.applied_at), "MMM d, yyyy")
              : "—";

            return (
              <tr
                key={app.id}
                className="group relative transition-colors hover:bg-[oklch(0.99_0.005_265)]"
              >
                {/* Company */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CompanyMark company={app.company_name} tone={tone} size={28} />
                    <span className="font-medium text-[oklch(0.2_0.02_265)]">
                      {app.company_name}
                    </span>
                  </div>
                </td>

                {/* Role */}
                <td className="max-w-[200px] px-4 py-3">
                  <span className="line-clamp-2 text-xs text-[oklch(0.35_0.02_265)]">
                    {app.role}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={app.status} />
                </td>

                {/* Applied date */}
                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] md:table-cell">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {appliedDate}
                  </span>
                </td>

                {/* Location */}
                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  {app.location ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {app.location}
                    </span>
                  ) : (
                    <span className="text-[oklch(0.7_0.01_265)]">—</span>
                  )}
                </td>

                {/* Source */}
                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  {app.source ? (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3 shrink-0" />
                      {app.source}
                    </span>
                  ) : (
                    <span className="text-[oklch(0.7_0.01_265)]">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      to="/dashboard/applications/$applicationId"
                      params={{ applicationId: app.id }}
                      aria-label="View application"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
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
