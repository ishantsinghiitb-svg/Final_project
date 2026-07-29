import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import type { RichTextCommand } from "@/features/cover-letters/richText";

// ── Rich text toolbar (Module 6E foundation refinement) ──
//
// Five buttons, matching the spec exactly: Bold, Italic, Bullet list,
// Numbered list, Hyperlink. Each operates on the textarea's current
// selection via the pure transforms in richText.ts (see applyRichTextCommand)
// — the toolbar itself only wires the DOM (reading/restoring selection) to
// those transforms via the `onCommand` callback its caller supplies.

type Props = {
  disabled?: boolean;
  onCommand: (command: RichTextCommand, linkUrl?: string) => void;
};

export function RichTextToolbar({ disabled, onCommand }: Props) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkPopoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setLinkPopoverOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkPopoverOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [linkPopoverOpen]);

  function confirmLink() {
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    onCommand("link", trimmed);
    setLinkUrl("");
    setLinkPopoverOpen(false);
  }

  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton
        label="Bold"
        icon={Bold}
        disabled={disabled}
        onClick={() => onCommand("bold")}
      />
      <ToolbarButton
        label="Italic"
        icon={Italic}
        disabled={disabled}
        onClick={() => onCommand("italic")}
      />
      <span className="mx-0.5 h-5 w-px bg-black/8" aria-hidden />
      <ToolbarButton
        label="Bullet list"
        icon={List}
        disabled={disabled}
        onClick={() => onCommand("bullet")}
      />
      <ToolbarButton
        label="Numbered list"
        icon={ListOrdered}
        disabled={disabled}
        onClick={() => onCommand("number")}
      />
      <span className="mx-0.5 h-5 w-px bg-black/8" aria-hidden />
      <div className="relative" ref={popoverRef}>
        <ToolbarButton
          label="Link"
          icon={Link2}
          disabled={disabled}
          onClick={() => setLinkPopoverOpen((o) => !o)}
        />
        {linkPopoverOpen && (
          <div className="absolute left-0 top-9 z-30 w-64 rounded-xl border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.55_0.02_265)]">
              Link URL
            </label>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmLink();
              }}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs outline-none focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
            />
            <button
              type="button"
              onClick={confirmLink}
              disabled={!linkUrl.trim()}
              className="mt-2 w-full rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Insert link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // mousedown (not click) fires BEFORE the textarea blurs, so the
      // selection the transform needs to read is still intact.
      onMouseDown={(e) => e.preventDefault()}
      className="grid h-8 w-8 place-items-center rounded-lg text-[oklch(0.45_0.02_265)] transition-colors hover:bg-black/[0.04] hover:text-[oklch(0.2_0.02_265)] disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
