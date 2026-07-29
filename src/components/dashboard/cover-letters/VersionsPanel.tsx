import { Check, Copy, History, Loader2, RotateCcw, Tag } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { DashCard } from "@/components/dashboard/primitives";
import {
  AI_ACTION_LABELS,
  VERSION_SOURCE_LABELS,
  type CoverLetterAIAction,
  type VersionSource,
} from "@/features/cover-letters/constants";
import { formatRelativeTime } from "@/features/cover-letters/stats";
import type { CoverLetterVersion } from "@/types";

// ── Versions panel (Module 6E · left sidebar) ──
//
// The Studio's history surface. Versions are append-only: switching is a read,
// restoring APPENDS a new version carrying the old text, and duplicating
// appends a copy. Nothing here can destroy a past version, which is what makes
// experimenting with AI actions safe.

type Props = {
  versions: CoverLetterVersion[];
  loading: boolean;
  activeVersionId: string | null;
  /** True when the editor holds unsaved edits — switching would discard them. */
  dirty: boolean;
  busyVersionId: string | null;
  onSelect: (version: CoverLetterVersion) => void;
  onRestore: (version: CoverLetterVersion) => void;
  onDuplicate: (version: CoverLetterVersion) => void;
  onLabel: (version: CoverLetterVersion) => void;
};

function versionTitle(version: CoverLetterVersion): string {
  if (version.label?.trim()) return version.label.trim();
  return `Version ${version.version_number}`;
}

function versionSubtitle(version: CoverLetterVersion): string {
  if (version.source === "ai_action" && version.ai_action) {
    return AI_ACTION_LABELS[version.ai_action as CoverLetterAIAction] ?? "AI edit";
  }
  return VERSION_SOURCE_LABELS[version.source as VersionSource] ?? "Edit";
}

export function VersionsPanel({
  versions,
  loading,
  activeVersionId,
  dirty,
  busyVersionId,
  onSelect,
  onRestore,
  onDuplicate,
  onLabel,
}: Props) {
  return (
    <DashCard padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
            <History className="h-3.5 w-3.5" />
          </div>
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">Versions</p>
        </div>
        <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[oklch(0.45_0.02_265)]">
          {versions.length}
        </span>
      </div>

      {dirty && (
        <p className="border-b border-black/5 bg-[#F59E0B]/[0.06] px-4 py-2 text-[11px] leading-snug text-[oklch(0.4_0.02_265)]">
          You have unsaved edits. Save them first — switching versions replaces what's in the
          editor.
        </p>
      )}

      <div className="max-h-[520px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
          </div>
        ) : versions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[oklch(0.5_0.02_265)]">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {versions.map((version) => {
              const active = version.id === activeVersionId;
              const busy = version.id === busyVersionId;
              return (
                <li key={version.id} className={cn(active && "bg-[#2563EB]/[0.03]")}>
                  <button
                    type="button"
                    onClick={() => onSelect(version)}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-semibold tabular-nums",
                        active
                          ? "bg-[#2563EB] text-white"
                          : "bg-black/[0.05] text-[oklch(0.45_0.02_265)]",
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : active ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        version.version_number
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          active ? "text-[#2563EB]" : "text-[oklch(0.25_0.02_265)]",
                        )}
                      >
                        {versionTitle(version)}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[oklch(0.5_0.02_265)]">
                        {versionSubtitle(version)} · {formatRelativeTime(version.created_at)}
                        {version.word_count != null ? ` · ${version.word_count} words` : ""}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5 px-3 pb-2">
                    <RowAction
                      icon={RotateCcw}
                      label="Restore"
                      onClick={() => onRestore(version)}
                      disabled={busy}
                    />
                    <RowAction
                      icon={Copy}
                      label="Duplicate"
                      onClick={() => onDuplicate(version)}
                      disabled={busy}
                    />
                    <RowAction
                      icon={Tag}
                      label="Rename"
                      onClick={() => onLabel(version)}
                      disabled={busy}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-black/5 px-4 py-2.5">
        <Link
          to="/dashboard/cover-letters"
          className="text-xs font-medium text-[#2563EB] hover:underline"
        >
          All cover letters
        </Link>
      </div>
    </DashCard>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[oklch(0.5_0.02_265)] transition-colors hover:bg-black/[0.04] hover:text-[oklch(0.25_0.02_265)] disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}
