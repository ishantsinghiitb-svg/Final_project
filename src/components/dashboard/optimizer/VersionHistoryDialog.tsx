import { Check, History, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptimizationChange, OptimizationRecord } from "@/features/optimizer/types";

// ── VersionHistoryDialog (Module 6E) ──
//
// Reopen a saved optimized version months later and see EXACTLY what the AI
// proposed and what the user decided — every accepted and rejected change, with
// the original text, the suggested text, the reason, the type, and the benefit.
// Reads the durable `resume_versions.optimization` record; nothing is
// recomputed, so the history is a faithful, permanent snapshot.

const KIND_LABELS: Record<string, string> = {
  rewrite: "Rewrite",
  replace: "Replace",
  add: "Add",
  remove: "Remove",
  merge: "Merge",
  split: "Split",
  move: "Move",
  reorder: "Reorder",
  rename: "Rename",
  highlight: "Highlight",
  compress: "Compress",
  expand: "Expand",
  promote: "Promote",
  demote: "Demote",
  restructure: "Restructure",
};

type Props = {
  open: boolean;
  versionName: string;
  versionNumber: number;
  record: OptimizationRecord | null;
  onClose: () => void;
};

export function VersionHistoryDialog({ open, versionName, versionNumber, record, onClose }: Props) {
  if (!open) return null;

  const accepted = record?.changes.filter((c) => c.decision === "accepted") ?? [];
  const rejected = record?.changes.filter((c) => c.decision === "rejected") ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="flex items-start gap-3 border-b border-black/5 px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <History className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="version-history-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              {versionName}
              <span className="ml-1.5 rounded-md bg-[#2563EB]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#2563EB]">
                v{versionNumber}
              </span>
            </h2>
            <p className="text-[11px] text-[oklch(0.5_0.02_265)]">
              {record
                ? `Optimized for ${record.categoryLabel} · ${new Date(record.savedAt).toLocaleDateString()}`
                : "Optimization history"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] transition-colors hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {!record || record.changes.length === 0 ? (
            <p className="text-sm text-[oklch(0.5_0.02_265)]">
              No detailed change history was recorded for this version.
            </p>
          ) : (
            <>
              {record.auditSummary && (
                <div className="rounded-xl border border-[#2563EB]/15 bg-[#2563EB]/[0.03] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#7C3AED]">
                    <Sparkles className="h-3 w-3" /> Reviewer's verdict
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">
                    {record.auditSummary}
                  </p>
                </div>
              )}

              <ChangeGroup
                title={`Accepted (${accepted.length})`}
                accent="green"
                changes={accepted}
              />
              <ChangeGroup
                title={`Rejected (${rejected.length})`}
                accent="rose"
                changes={rejected}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeGroup({
  title,
  accent,
  changes,
}: {
  title: string;
  accent: "green" | "rose";
  changes: OptimizationChange[];
}) {
  if (changes.length === 0) return null;
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">{title}</p>
      <div className="mt-2 space-y-2.5">
        {changes.map((c, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border border-l-[3px] border-black/5 bg-white p-3",
              accent === "green" ? "border-l-[#16A34A]" : "border-l-[#E11D48]",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  accent === "green"
                    ? "bg-[#22C55E]/15 text-[#16A34A]"
                    : "bg-[#F43F5E]/10 text-[#E11D48]",
                )}
              >
                {accent === "green" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {KIND_LABELS[c.kind] ?? "Change"}
              </span>
              <span className="truncate text-xs font-medium text-[oklch(0.35_0.02_265)]">
                {c.action || c.target}
              </span>
            </div>

            {c.current && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-[oklch(0.45_0.02_265)]">
                <span className="font-semibold text-[oklch(0.35_0.02_265)]">From: </span>
                {c.current}
              </p>
            )}
            {c.suggested && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-[oklch(0.3_0.02_265)]">
                <span className="font-semibold text-[oklch(0.35_0.02_265)]">To: </span>
                {c.suggested}
              </p>
            )}
            {c.reason && (
              <p className="mt-1 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
                <span className="font-semibold text-[oklch(0.4_0.02_265)]">Why: </span>
                {c.reason}
              </p>
            )}
            {c.benefit && (
              <p className="mt-0.5 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
                <span className="font-semibold text-[oklch(0.4_0.02_265)]">Benefit: </span>
                {c.benefit}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
