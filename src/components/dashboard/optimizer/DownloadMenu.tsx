import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESUME_FORMATS, type DownloadFormat } from "@/features/optimizer/download";

// ── DownloadMenu (Module 6E) ──
//
// The "Download ▼" split control that replaced the single Text button: a menu
// offering PDF / DOCX (see RESUME_FORMATS). Format-agnostic — it just renders
// the registry and calls back with the chosen format. Lightweight dropdown in
// the dashboard's established style (no Radix, matching the app's light theme).

type Props = {
  onDownload: (format: DownloadFormat) => void | Promise<void>;
  size?: "sm" | "md";
  className?: string;
};

export function DownloadMenu({ onDownload, size = "md", className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DownloadFormat | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function pick(format: DownloadFormat) {
    if (pending) return;
    setOpen(false);
    setPending(format);
    try {
      await onDownload(format);
    } finally {
      setPending(null);
    }
  }

  const trigger =
    size === "sm"
      ? "gap-1.5 px-2.5 py-1.5 text-xs"
      : "gap-2 px-4 py-2.5 text-sm shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)]";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending !== null}
        className={cn(
          "inline-flex items-center rounded-xl font-semibold text-white transition-all hover:-translate-y-px disabled:cursor-wait disabled:opacity-70 disabled:translate-y-0",
          "bg-gradient-to-br from-[#2563EB] to-[#7C3AED]",
          trigger,
        )}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-black/5 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)]">
          {RESUME_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => void pick(f.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/[0.03]"
            >
              <Download className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[oklch(0.28_0.02_265)]">
                  {f.label}
                </span>
                <span className="block text-[11px] text-[oklch(0.55_0.02_265)]">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
