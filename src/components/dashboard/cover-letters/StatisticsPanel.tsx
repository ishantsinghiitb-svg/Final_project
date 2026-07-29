import { useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import {
  LENGTH_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TONE_LABELS,
  type CoverLetterLength,
  type CoverLetterStatus,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { formatReadingTime, formatRelativeTime } from "@/features/cover-letters/stats";
import type { LetterStats } from "@/features/cover-letters/types";

// ── Statistics panel (Module 6E · right sidebar) ──
//
// Everything here is derived from the editor buffer on the client, so the
// numbers track what the user is looking at right now — not the last saved
// version. No network, no credits.
//
// Collapsed by default: the sidebar is a set of supporting tools, not a second
// dashboard. Word count is the one number people actually watch while writing,
// so it stays visible in the collapsed header — collapsing hides detail, it
// never hides the number you came for.

type Props = {
  stats: LetterStats;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  status: CoverLetterStatus;
  aiGenerated: boolean;
  lastEditedAt: string | null;
};

export function StatisticsPanel({ stats, tone, length, status, aiGenerated, lastEditedAt }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <DashCard padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
          Statistics
        </span>
        {!open && (
          <span className="text-[11px] tabular-nums text-[oklch(0.5_0.02_265)]">
            {stats.wordCount.toLocaleString()} words · {formatReadingTime(stats.readingSeconds)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-px border-t border-black/5 bg-black/5">
            <Metric label="Words" value={stats.wordCount.toLocaleString()} />
            <Metric label="Reading time" value={formatReadingTime(stats.readingSeconds)} />
            <Metric label="Characters" value={stats.charCount.toLocaleString()} />
            <Metric label="Paragraphs" value={String(stats.paragraphCount)} />
          </div>

          <dl className="space-y-2 px-4 py-3">
            <Row label="Tone">
              <Chip tone="blue">{TONE_LABELS[tone]}</Chip>
            </Row>
            <Row label="Length">
              <Chip>{LENGTH_LABELS[length]}</Chip>
            </Row>
            <Row label="Status">
              <Chip tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Chip>
            </Row>
            <Row label="AI generated">
              <span className="text-xs font-medium text-[oklch(0.3_0.02_265)]">
                {aiGenerated ? "Yes" : "No"}
              </span>
            </Row>
            <Row label="Last edited">
              <span className="text-xs font-medium text-[oklch(0.3_0.02_265)]">
                {formatRelativeTime(lastEditedAt)}
              </span>
            </Row>
          </dl>
        </>
      )}
    </DashCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="font-display text-lg font-semibold tabular-nums text-[oklch(0.2_0.02_265)]">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">{label}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] text-[oklch(0.5_0.02_265)]">{label}</dt>
      <dd className="flex items-center">{children}</dd>
    </div>
  );
}
