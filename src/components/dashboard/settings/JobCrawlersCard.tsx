import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  FlaskConical,
  HeartPulse,
  Loader2,
  Play,
  ShieldAlert,
} from "lucide-react";
import { DashCard, Chip, SectionTitle } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { useCrawlAdminOverview, useRunCrawl, useVerifySources } from "@/features/jobCrawlers/hooks";
import type { AdminRegistryEntry, RegistrySummary } from "@/server-functions/jobIntelligence";
import type { SourceHealthReport } from "@/server/jobIntelligence/crawl/verify/SourceHealthService";
import type {
  CrawlReport,
  CompanyCrawlReport,
} from "@/server/jobIntelligence/crawl/report/CrawlReport";

// ── JobCrawlersCard (Module 10B.1) ──
//
// The admin surface for the job crawlers, rendered inside the existing
// Settings page as its own tab. Deliberately operator tooling, not product
// UI: dense, factual, and it never hides a failure behind a friendly message.
//
// Four actions, exactly as scoped: Crawl Selected Platform, Crawl All, Dry
// Run, and View Last Crawl Report. Admin-ness is decided by the SERVER
// (`overview.isAdmin`) — the Settings tab is not even listed for anyone else.

type Props = { overview: ReturnType<typeof useCrawlAdminOverview> };

export function JobCrawlersCard({ overview }: Props) {
  const { data, isLoading } = overview;
  const runCrawl = useRunCrawl();
  const [platform, setPlatform] = useState<string>("");
  const [report, setReport] = useState<CrawlReport | null>(null);
  const [showLastReport, setShowLastReport] = useState(false);

  const supported = useMemo(
    () => (data?.platforms ?? []).filter((entry) => entry.supported),
    [data?.platforms],
  );
  const blocked = useMemo(
    () => (data?.platforms ?? []).filter((entry) => !entry.supported),
    [data?.platforms],
  );

  const visibleReport = report ?? (showLastReport ? (data?.lastRun ?? null) : null);

  async function run(target: string | null, dryRun: boolean) {
    try {
      const result = await runCrawl.mutateAsync({ platform: target, dryRun });
      setReport(result);
      setShowLastReport(false);
      const label = dryRun ? "Dry run" : "Crawl";
      if (result.totals.failed > 0) {
        toast.warning(
          `${label} finished with ${result.totals.failed} failure(s). See the report below.`,
        );
      } else {
        toast.success(
          `${label} finished: ${result.totals.imported} imported, ${result.totals.duplicates} duplicate(s).`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Crawl failed.");
    }
  }

  if (isLoading) {
    return (
      <DashCard>
        <SectionTitle>Job crawlers</SectionTitle>
        <p className="mt-4 text-sm text-[oklch(0.5_0.02_265)]">Loading…</p>
      </DashCard>
    );
  }

  const busy = runCrawl.isPending;

  return (
    <div className="grid gap-3">
      <DashCard>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#2563EB]" />
            Job crawlers
          </span>
        </SectionTitle>
        <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
          Imports jobs into the shared catalogue. Admin only, run by hand, never triggered by users.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Platform</span>
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              disabled={busy}
              className="mt-1 w-56 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
            >
              <option value="">All platforms</option>
              {supported.map((entry) => (
                <option key={entry.platform} value={entry.platform}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>

          <DashButton onClick={() => void run(platform || null, false)} disabled={busy}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                {platform ? "Crawl selected platform" : "Crawl all"}
              </span>
            )}
          </DashButton>

          <button
            onClick={() => void run(platform || null, true)}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
          >
            <FlaskConical className="h-4 w-4" />
            Dry run
          </button>

          <button
            onClick={() => {
              setReport(null);
              setShowLastReport((open) => !open);
            }}
            disabled={busy || !data?.lastRun}
            className="rounded-lg border border-black/5 bg-white px-3 py-2 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
            title={data?.lastRun ? undefined : "No completed crawl yet"}
          >
            {showLastReport ? "Hide last crawl report" : "View last crawl report"}
          </button>
        </div>

        {data?.lastRunAt && (
          <p className="mt-3 text-xs text-[oklch(0.5_0.02_265)]">
            Last completed run: {new Date(data.lastRunAt).toLocaleString()}
          </p>
        )}
      </DashCard>

      {data?.summary && (
        <SourceHealthPanel summary={data.summary} platform={platform || null} busy={busy} />
      )}

      {visibleReport && <CrawlReportPanel report={visibleReport} />}

      <RegistryTable entries={data?.entries ?? []} />

      {blocked.length > 0 && (
        <DashCard>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#B45309]" />
              Platforms that cannot be crawled
            </span>
          </SectionTitle>
          <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
            These were tested against the live sites. No workaround is implemented for any of them
            by design.
          </p>
          <ul className="mt-3 divide-y divide-black/5">
            {blocked.map((entry) => (
              <li key={entry.platform} className="py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{entry.displayName}</p>
                  <Chip tone="amber">Blocked</Chip>
                </div>
                <p className="mt-1 text-xs text-[oklch(0.45_0.02_265)]">{entry.limitationReason}</p>
                {entry.limitationEvidence && (
                  <p className="mt-1 font-mono text-[11px] text-[oklch(0.55_0.02_265)]">
                    {entry.limitationEvidence}
                  </p>
                )}
                {entry.unblockedBy && (
                  <p className="mt-1 text-[11px] text-[oklch(0.5_0.02_265)]">
                    Would need: {entry.unblockedBy}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </DashCard>
      )}
    </div>
  );
}

// Plain-language health labels. The stored values are terse enum-ish strings;
// an operator should not have to know that vocabulary to read the panel.
const HEALTH_LABEL: Record<
  string,
  { label: string; tone: "green" | "blue" | "amber" | "rose" | "default" }
> = {
  HEALTHY: { label: "Working", tone: "green" },
  REDIRECTED: { label: "Moved", tone: "blue" },
  BLOCKED: { label: "Blocked", tone: "amber" },
  BROKEN: { label: "Broken link", tone: "rose" },
  UNAVAILABLE: { label: "Down", tone: "amber" },
  UNKNOWN: { label: "Unconfirmed", tone: "default" },
  UNCHECKED: { label: "Not checked", tone: "default" },
};

function SourceHealthPanel({
  summary,
  platform,
  busy,
}: {
  summary: RegistrySummary;
  platform: string | null;
  busy: boolean;
}) {
  const verify = useVerifySources();
  const [report, setReport] = useState<SourceHealthReport | null>(null);

  async function runVerification() {
    try {
      const result = await verify.mutateAsync({ platform });
      setReport(result);
      toast.success(
        `Checked ${result.sourcesChecked} source(s): ${result.rollup.HEALTHY} working, ` +
          `${result.rollup.BROKEN + result.rollup.BLOCKED} need attention.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  const needsAttention = (report ? report.entries : []).filter(
    (entry) =>
      entry.health === "BROKEN" || entry.health === "BLOCKED" || entry.health === "UNKNOWN",
  );
  const moved = (report ? report.entries : []).filter((entry) => entry.suggestedUrl);

  return (
    <DashCard>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-[#16A34A]" />
          Source health
        </span>
      </SectionTitle>
      <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
        {summary.total} compan{summary.total === 1 ? "y" : "ies"} registered · {summary.enabled}{" "}
        enabled, {summary.eligibleNow} ready to crawl now · {summary.needsAttention} need attention
        {summary.unchecked > 0 ? ` · ${summary.unchecked} not checked yet` : ""}
      </p>
      <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
        {summary.verified} verified working across the full registry (including disabled sources)
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(summary.health)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => {
            const meta = HEALTH_LABEL[status] ?? { label: status, tone: "default" as const };
            return (
              <Chip key={status} tone={meta.tone}>
                {meta.label}: {count}
              </Chip>
            );
          })}
      </div>

      {summary.platforms.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-[oklch(0.45_0.02_265)]">Detected platforms</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {summary.platforms.map(({ platform: name, count }) => (
              <Chip key={name} tone={name === "undetected" ? "default" : "blue"}>
                {name === "custom_careers"
                  ? "Custom careers page"
                  : name === "undetected"
                    ? "Not detected"
                    : name}
                : {count}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void runVerification()}
          disabled={busy || verify.isPending}
          className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
        >
          {verify.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <HeartPulse className="h-4 w-4" />
          )}
          {verify.isPending
            ? "Checking sources…"
            : platform
              ? "Check this platform's sources"
              : "Check all sources"}
        </button>
        {summary.lastCheckedAt && (
          <span className="text-xs text-[oklch(0.5_0.02_265)]">
            Last checked {new Date(summary.lastCheckedAt).toLocaleString()}
          </span>
        )}
      </div>

      {report && (
        <div className="mt-4 space-y-3">
          {moved.length > 0 && (
            <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/[0.05] p-3">
              <p className="text-xs font-medium text-[#2563EB]">
                {moved.length} source(s) moved — update the registry URL
              </p>
              <ul className="mt-1 space-y-0.5">
                {moved.slice(0, 10).map((entry) => (
                  <li key={entry.registryId} className="text-[11px] text-[oklch(0.45_0.02_265)]">
                    <span className="font-medium">{entry.companyName}</span> → {entry.suggestedUrl}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {needsAttention.length > 0 && (
            <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/[0.06] p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-[#B45309]">
                <AlertTriangle className="h-3.5 w-3.5" />
                {needsAttention.length} source(s) need attention
              </p>
              <ul className="mt-1 space-y-1">
                {needsAttention.slice(0, 15).map((entry) => (
                  <li key={entry.registryId} className="text-[11px] text-[oklch(0.45_0.02_265)]">
                    <span className="font-medium">{entry.companyName}</span>{" "}
                    <Chip tone={HEALTH_LABEL[entry.health]?.tone ?? "default"}>
                      {HEALTH_LABEL[entry.health]?.label ?? entry.health}
                    </Chip>
                    {entry.message && <span className="block">{entry.message}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {needsAttention.length === 0 && moved.length === 0 && (
            <p className="text-xs text-[oklch(0.5_0.02_265)]">
              All {report.sourcesChecked} checked source(s) are working.
            </p>
          )}
        </div>
      )}
    </DashCard>
  );
}

function CrawlReportPanel({ report }: { report: CrawlReport }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Every stage of the pipeline, in pipeline order — "imported" and "updated"
  // are deliberately separate: a run that updates 300 existing rows and
  // imports 0 new ones is a healthy run, not a broken one.
  const stats: Array<[string, number]> = [
    ["Targets", report.companiesScanned],
    ["Discovered", report.totals.discovered],
    ["Parsed", report.totals.parsed],
    ["Imported", report.totals.imported],
    ["Updated", report.totals.updated],
    ["Duplicates", report.totals.duplicates],
    ["Rejected", report.totals.rejected],
    ["Skipped", report.totals.skipped],
    ["Failed", report.totals.failed],
  ];

  return (
    <DashCard>
      <SectionTitle>
        <span className="flex items-center gap-2">
          Crawl report
          {report.mode === "dry_run" && <Chip tone="purple">Dry run — nothing written</Chip>}
        </span>
      </SectionTitle>
      <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
        {report.platform ? report.platform : "All platforms"} ·{" "}
        {new Date(report.startedAt).toLocaleString()} · {(report.durationMs / 1000).toFixed(1)}s
        {report.triggeredBy ? ` · ${report.triggeredBy}` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-black/5 bg-black/[0.015] p-3">
            <p className="text-[11px] text-[oklch(0.5_0.02_265)]">{label}</p>
            <p className="font-display text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {report.platforms.length > 1 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium text-[oklch(0.45_0.02_265)]">By platform</p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-[11px] text-[oklch(0.5_0.02_265)]">
                <tr className="border-b border-black/5">
                  <th className="py-1.5 pr-3 font-medium">Platform</th>
                  <th className="py-1.5 pr-3 font-medium">Targets</th>
                  <th className="py-1.5 pr-3 font-medium">Discovered</th>
                  <th className="py-1.5 pr-3 font-medium">Imported</th>
                  <th className="py-1.5 pr-3 font-medium">Duplicates</th>
                  <th className="py-1.5 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {report.platforms.map((entry) => (
                  <tr key={entry.platform} className="border-b border-black/5 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-[11px]">{entry.platform}</td>
                    <td className="py-1.5 pr-3">
                      {entry.succeeded}/{entry.targets}
                    </td>
                    <td className="py-1.5 pr-3">{entry.counters.discovered}</td>
                    <td className="py-1.5 pr-3">{entry.counters.imported}</td>
                    <td className="py-1.5 pr-3">{entry.counters.duplicates}</td>
                    <td className="py-1.5">{entry.failed + entry.counters.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.companies.length > 0 && (
        <ul className="mt-4 divide-y divide-black/5">
          {report.companies.map((company) => (
            <CompanyRow
              key={`${company.registryId ?? company.companyName}-${company.platform}`}
              company={company}
              open={expanded === company.registryId}
              onToggle={() =>
                setExpanded((current) =>
                  current === company.registryId ? null : company.registryId,
                )
              }
            />
          ))}
        </ul>
      )}

      {report.limitations.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/[0.06] p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-[#B45309]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Platform limitations in this run
          </p>
          {report.limitations.map((limitation) => (
            <p key={limitation.platform} className="mt-1 text-xs text-[oklch(0.45_0.02_265)]">
              <span className="font-medium">{limitation.displayName}:</span> {limitation.reason}
            </p>
          ))}
        </div>
      )}
    </DashCard>
  );
}

const STATUS_TONE: Record<string, "green" | "amber" | "rose" | "default"> = {
  success: "green",
  partial: "amber",
  failed: "rose",
  blocked: "amber",
  skipped: "default",
};

function CompanyRow({
  company,
  open,
  onToggle,
}: {
  company: CompanyCrawlReport;
  open: boolean;
  onToggle: () => void;
}) {
  const hasDetail =
    company.issues.length > 0 || company.warnings.length > 0 || Boolean(company.message);

  return (
    <li className="py-2.5">
      <button
        onClick={onToggle}
        disabled={!hasDetail}
        className="flex w-full items-center gap-2 text-left disabled:cursor-default"
      >
        {hasDetail ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{company.companyName}</span>
            <Chip tone={STATUS_TONE[company.status] ?? "default"}>{company.status}</Chip>
            {company.resolvedProvider && <Chip tone="blue">{company.resolvedProvider}</Chip>}
          </span>
          <span className="mt-0.5 block text-[11px] text-[oklch(0.5_0.02_265)]">
            {company.counters.discovered} discovered · {company.counters.imported} imported ·{" "}
            {company.counters.duplicates} duplicate · {company.counters.rejected} rejected ·{" "}
            {company.counters.failed} failed · {(company.durationMs / 1000).toFixed(1)}s
          </span>
        </span>
      </button>

      {open && hasDetail && (
        <div className="mt-2 ml-5 space-y-2">
          {company.message && (
            <p className="text-xs text-[oklch(0.45_0.02_265)]">{company.message}</p>
          )}
          {company.warnings.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-[oklch(0.45_0.02_265)]">Warnings</p>
              <ul className="mt-1 space-y-0.5">
                {company.warnings.map((warning, index) => (
                  <li key={index} className="text-[11px] text-[oklch(0.5_0.02_265)]">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {company.issues.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-[oklch(0.45_0.02_265)]">
                Rejected / failed postings
              </p>
              <ul className="mt-1 space-y-0.5">
                {company.issues.map((issue, index) => (
                  <li key={index} className="text-[11px] text-[oklch(0.5_0.02_265)]">
                    <span className="font-mono">{issue.kind}</span> · {issue.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RegistryTable({ entries }: { entries: AdminRegistryEntry[] }) {
  if (entries.length === 0) {
    return (
      <DashCard>
        <SectionTitle>Company registry</SectionTitle>
        <p className="mt-3 text-sm text-[oklch(0.5_0.02_265)]">
          No entries yet. Add rows to <span className="font-mono">crawl_company_registry</span> —
          companies are configuration, not code.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard>
      <SectionTitle>Company registry</SectionTitle>
      <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
        {entries.length} entr{entries.length === 1 ? "y" : "ies"}. Add a company by inserting a row
        — no code change needed.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-[11px] text-[oklch(0.5_0.02_265)]">
            <tr className="border-b border-black/5">
              <th className="py-2 pr-3 font-medium">Company</th>
              <th className="py-2 pr-3 font-medium">Platform</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Health</th>
              <th className="py-2 pr-3 font-medium">Last crawl</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Imported</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-black/5 last:border-0">
                <td className="py-2 pr-3">
                  <span className={entry.enabled ? "" : "text-[oklch(0.6_0.02_265)] line-through"}>
                    {entry.companyName}
                  </span>
                  {entry.parentCompany && (
                    <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">
                      part of {entry.parentCompany}
                    </span>
                  )}
                  {entry.notes && (
                    <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">
                      {entry.notes}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-[11px]">{entry.platform}</td>
                <td className="py-2 pr-3 font-mono text-[11px]">{entry.detectedPlatform ?? "—"}</td>
                <td className="py-2 pr-3">
                  {entry.healthStatus ? (
                    <Chip tone={HEALTH_LABEL[entry.healthStatus]?.tone ?? "default"}>
                      {HEALTH_LABEL[entry.healthStatus]?.label ?? entry.healthStatus}
                    </Chip>
                  ) : (
                    <span className="text-[oklch(0.6_0.02_265)]">—</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {entry.lastCrawlAt ? new Date(entry.lastCrawlAt).toLocaleString() : "Never"}
                </td>
                <td className="py-2 pr-3">
                  {entry.lastStatus ? (
                    <Chip tone={STATUS_TONE[entry.lastStatus] ?? "default"}>
                      {entry.lastStatus}
                    </Chip>
                  ) : (
                    <span className="text-[oklch(0.6_0.02_265)]">—</span>
                  )}
                </td>
                <td className="py-2">{entry.lastJobsImported ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashCard>
  );
}
