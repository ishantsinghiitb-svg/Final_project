import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COVER_LETTER_EXPORT_FORMATS,
  type CoverLetterExportFormat,
} from "@/features/cover-letters/export";

// ── Export menu (Module 6E) ──
//
// Copy sits alongside the download formats because from the user's side they
// are the same decision — "get this letter out of here and into an application."
// Exporting is local and free; nothing here consumes a credit.

export function ExportMenu({
  onCopy,
  onExport,
  disabled,
}: {
  onCopy: () => void;
  onExport: (format: CoverLetterExportFormat) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.25_0.02_265)] transition-colors hover:border-black/20 hover:bg-black/[0.03]",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <Download className="h-3.5 w-3.5" /> Export
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]"
        >
          <MenuItem
            icon={Copy}
            label="Copy to clipboard"
            hint="Paste into any application form"
            onClick={() => {
              setOpen(false);
              onCopy();
            }}
          />
          <div className="my-1 h-px bg-black/5" />
          {COVER_LETTER_EXPORT_FORMATS.map((format) => (
            <MenuItem
              key={format.id}
              icon={FileText}
              label={format.label}
              hint={format.hint}
              onClick={() => {
                setOpen(false);
                onExport(format.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/[0.03]"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[oklch(0.25_0.02_265)]">{label}</span>
        <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">{hint}</span>
      </span>
    </button>
  );
}
