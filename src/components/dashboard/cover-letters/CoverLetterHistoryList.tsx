import { Link } from "@tanstack/react-router";
import { Building2, Copy, FileText, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import {
  DEFAULT_TONE,
  STATUS_LABELS,
  STATUS_TONES,
  TONE_LABELS,
  type CoverLetterStatus,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { formatDate, formatRelativeTime } from "@/features/cover-letters/stats";
import type { CoverLetter } from "@/types";

// ── Cover letter history (Module 6E · library page) ──
//
// Every letter the user has generated, persisted in the database — the spec's
// History surface. Columns are the ones that identify a letter months later:
// company, role, the resume it was written from, when it was made, when it was
// last touched, its tone and its status.
//
// Renders as a table on wide screens and as stacked cards on narrow ones, so the
// same data reads well at both ends without a second component.

type Props = {
  letters: CoverLetter[];
  resumeNames: Record<string, string>;
  onRename: (letter: CoverLetter) => void;
  onDuplicate: (letter: CoverLetter) => void;
  onDelete: (letter: CoverLetter) => void;
};

export function CoverLetterHistoryList({
  letters,
  resumeNames,
  onRename,
  onDuplicate,
  onDelete,
}: Props) {
  return (
    <DashCard padded={false} className="overflow-hidden">
      {/* Header row — desktop only; the card layout below carries its own labels. */}
      <div className="hidden items-center gap-3 border-b border-black/5 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.55_0.02_265)] lg:flex">
        <span className="flex-1">Letter</span>
        <span className="w-40">Resume used</span>
        <span className="w-28">Created</span>
        <span className="w-28">Last edited</span>
        <span className="w-24">Tone</span>
        <span className="w-28">Status</span>
        <span className="w-8" />
      </div>

      <ul className="divide-y divide-black/5">
        {letters.map((letter) => (
          <li key={letter.id} className="transition-colors hover:bg-black/[0.015]">
            <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-3">
              {/* Identity */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <Link
                    to="/dashboard/cover-letters/$coverLetterId"
                    params={{ coverLetterId: letter.id }}
                    className="block truncate text-sm font-medium text-[oklch(0.22_0.02_265)] hover:text-[#2563EB]"
                  >
                    {letter.name}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[oklch(0.5_0.02_265)]">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {letter.company_name || "No company"}
                    {letter.role_title ? ` · ${letter.role_title}` : ""}
                  </p>
                </div>
              </div>

              {/* Metadata — labelled on mobile, columnar on desktop */}
              <Cell label="Resume used" className="w-40">
                {letter.resume_id ? (resumeNames[letter.resume_id] ?? "Deleted resume") : "—"}
              </Cell>
              <Cell label="Created" className="w-28">
                {formatDate(letter.created_at)}
              </Cell>
              <Cell label="Last edited" className="w-28">
                {formatRelativeTime(letter.last_edited_at ?? letter.updated_at)}
              </Cell>
              <div className="w-24 lg:shrink-0">
                <Chip>{TONE_LABELS[(letter.tone as CoverLetterTone) ?? DEFAULT_TONE] ?? "—"}</Chip>
              </div>
              <div className="w-28 lg:shrink-0">
                <Chip tone={STATUS_TONES[(letter.status as CoverLetterStatus) ?? "draft"]}>
                  {STATUS_LABELS[(letter.status as CoverLetterStatus) ?? "draft"]}
                </Chip>
              </div>

              <RowMenu
                onRename={() => onRename(letter)}
                onDuplicate={() => onDuplicate(letter)}
                onDelete={() => onDelete(letter)}
              />
            </div>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-baseline gap-2 lg:block lg:shrink-0", className)}>
      <span className="text-[11px] text-[oklch(0.55_0.02_265)] lg:hidden">{label}</span>
      <span className="truncate text-xs text-[oklch(0.4_0.02_265)]">{children}</span>
    </div>
  );
}

function RowMenu({
  onRename,
  onDuplicate,
  onDelete,
}: {
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative lg:w-8 lg:shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Letter actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] transition-colors hover:bg-black/[0.04] hover:text-[oklch(0.2_0.02_265)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]"
        >
          <MenuItem
            icon={PenLine}
            label="Rename"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          />
          <MenuItem
            icon={Copy}
            label="Duplicate"
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          />
          <div className="my-1 h-px bg-black/5" />
          <MenuItem
            icon={Trash2}
            label="Delete"
            danger
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-black/[0.03]",
        danger ? "text-[#E11D48]" : "text-[oklch(0.3_0.02_265)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
