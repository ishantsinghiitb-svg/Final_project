import { XCircle, Loader2, RefreshCw, HeartPulse } from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { cn } from "@/lib/utils";
import type { ResumeHealth, ResumeHealthCheck } from "@/features/ai/schemas";
import { ActionPlanList, type ActionItem } from "@/components/dashboard/reports/ActionPlanList";

// ── Resume Health panel (deterministic report — NOT an AI feature) ──
// Surfaces the score as a gradient bar plus an actionable improvement plan.
//
// Presentation-only (6E): checks needing attention render through the shared
// ActionPlanList as a plain improvement plan (fail before warn) — no
// Critical/High/Medium/Low tier labels. Same analysis, same checks, same
// `detail` text; only the framing changed. The deterministic parser output
// (ResumeHealth) itself is untouched.

function checksToItems(checks: ResumeHealthCheck[]): ActionItem[] {
  // Failing checks first (higher impact), then warnings — ordering only, no tiers shown.
  return [...checks]
    .filter((c) => c.status !== "pass")
    .sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1))
    .map((c) => ({
      id: c.id,
      title: c.label,
      tag: c.status === "fail" ? "Fix" : "Improve",
      why: c.detail ?? undefined,
    }));
}

type Props = {
  health: ResumeHealth | null;
  parseStatus: string | undefined;
  parseError?: string | null;
  onReparse?: () => void;
  reparsing?: boolean;
};

const STATUS_LABEL: Record<ResumeHealth["status"], string> = {
  good: "Good",
  warnings: "Needs work",
  poor: "Needs attention",
};

const STATUS_GRADIENT: Record<ResumeHealth["status"], string> = {
  good: "from-[#22C55E] to-[#16A34A]",
  warnings: "from-[#F59E0B] to-[#EAB308]",
  poor: "from-[#F43F5E] to-[#E11D48]",
};

export function ResumeHealthPanel({
  health,
  parseStatus,
  parseError,
  onReparse,
  reparsing,
}: Props) {
  if (parseStatus === "processing" || parseStatus === "pending") {
    return (
      <div className="flex items-center gap-2 text-sm text-[oklch(0.45_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Analyzing resume…
      </div>
    );
  }

  if (parseStatus === "failed") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-[#E11D48]">
          <XCircle className="h-4 w-4" /> {parseError || "Could not parse this resume."}
        </div>
        {onReparse && (
          <DashButton variant="outline" size="sm" onClick={onReparse} disabled={reparsing}>
            <RefreshCw className={reparsing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Retry
          </DashButton>
        )}
      </div>
    );
  }

  if (!health) {
    return <p className="text-sm text-[oklch(0.5_0.02_265)]">No health report yet.</p>;
  }

  const tone = health.status === "good" ? "green" : health.status === "warnings" ? "amber" : "rose";
  const passCount = health.checks.filter((c) => c.status === "pass").length;
  const warnCount = health.checks.filter((c) => c.status === "warn").length;
  const failCount = health.checks.filter((c) => c.status === "fail").length;
  const issues = health.checks.filter((c) => c.status !== "pass");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
          <HeartPulse className="h-4 w-4" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold">Resume Health</p>
          <p className="text-[11px] text-[oklch(0.5_0.02_265)]">Deterministic checks · not AI</p>
        </div>
        {onReparse && (
          <button
            onClick={onReparse}
            disabled={reparsing}
            title="Re-analyze this file"
            aria-label="Re-analyze this file"
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg border border-black/5 text-[oklch(0.5_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", reparsing && "animate-spin")} />
          </button>
        )}
      </div>

      {/* Score */}
      <div>
        <div className="flex items-end justify-between">
          <p className="font-display text-4xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
            {health.score}
            <span className="text-base font-medium text-[oklch(0.5_0.02_265)]">/100</span>
          </p>
          <Chip tone={tone}>{STATUS_LABEL[health.status]}</Chip>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-black/5">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r", STATUS_GRADIENT[health.status])}
            style={{ width: `${health.score}%` }}
          />
        </div>
      </div>

      {/* Severity summary */}
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="green">{passCount} passed</Chip>
        {warnCount > 0 && <Chip tone="amber">{warnCount} to improve</Chip>}
        {failCount > 0 && <Chip tone="rose">{failCount} missing</Chip>}
      </div>

      {/* Improvement plan — only the checks that need attention */}
      {issues.length > 0 && (
        <ActionPlanList items={checksToItems(issues)} title="Improvement plan" />
      )}

      <div className="flex flex-wrap gap-3 border-t border-black/5 pt-3 text-[11px] text-[oklch(0.5_0.02_265)]">
        {health.metrics.pageCount != null && <span>{health.metrics.pageCount} pages</span>}
        <span>{health.metrics.wordCount} words</span>
        <span>{Math.round(health.metrics.parseConfidence * 100)}% parse confidence</span>
      </div>
    </div>
  );
}
