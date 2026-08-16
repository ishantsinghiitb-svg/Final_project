import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Briefcase,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquareText,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import { useAdminOverview } from "@/features/admin/hooks";

export const Route = createFileRoute("/dashboard/admin/")({
  component: AdminOverviewPage,
});

type Tone = { icon: typeof Users; iconBg: string; iconColor: string };

const TILES: { key: string; label: string; tone: Tone }[] = [
  { key: "totalUsers", label: "Total Users", tone: { icon: Users, iconBg: "bg-[#2563EB]/10", iconColor: "text-[#2563EB]" } },
  { key: "activeUsersLast7d", label: "Active (7d)", tone: { icon: Activity, iconBg: "bg-[#22C55E]/15", iconColor: "text-[#16A34A]" } },
  { key: "totalApplications", label: "Applications", tone: { icon: Briefcase, iconBg: "bg-[#7C3AED]/10", iconColor: "text-[#7C3AED]" } },
  { key: "totalGlobalJobs", label: "Jobs Indexed", tone: { icon: Briefcase, iconBg: "bg-[#F59E0B]/15", iconColor: "text-[#D97706]" } },
  { key: "usersWithAiUsage", label: "Users Using AI", tone: { icon: Sparkles, iconBg: "bg-[#2563EB]/10", iconColor: "text-[#2563EB]" } },
  { key: "feedbackCount", label: "Feedback Received", tone: { icon: MessageSquareText, iconBg: "bg-[#F43F5E]/10", iconColor: "text-[#E11D48]" } },
];

function AdminOverviewPage() {
  const { data: overview, isLoading, isError } = useAdminOverview();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <DashCard key={i} className="h-20 animate-pulse bg-black/[0.03]">
            <span className="sr-only">Loading…</span>
          </DashCard>
        ))}
      </div>
    );
  }

  if (isError || !overview?.data) {
    return (
      <DashCard>
        <p className="text-sm text-rose-600">Failed to load admin overview. Try refreshing.</p>
      </DashCard>
    );
  }

  const data = overview.data;
  const values: Record<string, string> = {
    totalUsers: String(data.totalUsers),
    activeUsersLast7d: data.activeUsersLast7d === null ? "—" : String(data.activeUsersLast7d),
    totalApplications: String(data.totalApplications),
    totalGlobalJobs: String(data.totalGlobalJobs),
    usersWithAiUsage: String(data.usersWithAiUsage),
    feedbackCount: String(data.feedbackCount),
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.tone.icon;
          return (
            <DashCard key={tile.key} className="p-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                    tile.tone.iconBg,
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", tile.tone.iconColor)} />
                </span>
                <span className="text-xs font-medium text-[oklch(0.5_0.02_265)]">{tile.label}</span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight text-[oklch(0.15_0.02_265)]">
                {values[tile.key]}
              </p>
            </DashCard>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DashCard>
          <SectionTitle>Recent signups</SectionTitle>
          {data.recentSignups.length === 0 ? (
            <p className="mt-3 text-sm text-[oklch(0.5_0.02_265)]">No signups yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-black/5">
              {data.recentSignups.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[oklch(0.2_0.02_265)]">
                      {s.fullName || "Unnamed user"}
                    </p>
                    <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">
                      {s.email ?? "no email on file"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[oklch(0.5_0.02_265)]">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <SystemHealthCard />
      </div>
    </div>
  );
}

type HealthState = { status: "checking" | "ok" | "down"; timestamp: string | null };

/** Calls the existing GET /api/health liveness endpoint directly — no new health infra. */
function SystemHealthCard() {
  const [health, setHealth] = useState<HealthState>({ status: "checking", timestamp: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { status?: string; timestamp?: string }) => {
        if (cancelled) return;
        setHealth({
          status: body.status === "ok" ? "ok" : "down",
          timestamp: body.timestamp ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setHealth({ status: "down", timestamp: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashCard>
      <SectionTitle>System health</SectionTitle>
      <div className="mt-3 flex items-center gap-3">
        {health.status === "checking" && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-[oklch(0.5_0.02_265)]" />
            <p className="text-sm text-[oklch(0.5_0.02_265)]">Checking /api/health…</p>
          </>
        )}
        {health.status === "ok" && (
          <>
            <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
            <div>
              <p className="text-sm font-medium text-[oklch(0.2_0.02_265)]">Operational</p>
              {health.timestamp && (
                <p className="text-xs text-[oklch(0.5_0.02_265)]">
                  Last checked {new Date(health.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>
          </>
        )}
        {health.status === "down" && (
          <>
            <XCircle className="h-5 w-5 text-rose-600" />
            <p className="text-sm font-medium text-rose-600">
              /api/health did not respond as expected.
            </p>
          </>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-[oklch(0.5_0.02_265)]">
        <Mail className="h-3 w-3" /> Liveness only — proves the Worker is serving traffic, not that
        every dependency is healthy.
      </p>
    </DashCard>
  );
}
