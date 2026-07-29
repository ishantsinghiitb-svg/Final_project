import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, Loader2, PenLine, Redo2, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashButton } from "@/components/dashboard/DashButton";
import { applyRichTextCommand, renderRichTextHtml, type RichTextCommand } from "@/lib/richText";
import { AIThinkingInline } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { ExportMenu } from "./ExportMenu";
import { RichTextToolbar } from "@/components/shared/RichTextToolbar";
import type { CoverLetterExportFormat } from "@/features/cover-letters/export";

// ── Cover letter editor (Module 6E · centre pane) ──
//
// Storage stays plain text with a tiny markdown-like syntax layered on top
// (bold/italic/lists/links — see richText.ts) — never HTML. That's what keeps
// the AI prompts, section-splicing and version history untouched: they all
// already depend on `content` being plain prose. "Write" is the raw textarea
// the toolbar edits; "Preview" renders the same text as real formatting so
// the user sees actual bold/italic/bullets, not markdown soup, without the
// Studio becoming a WYSIWYG document editor.
//
// Undo / redo are wired to the Studio's own history stack (features/cover-letters/
// useUndoRedo), not the browser's — the native stack is destroyed every time an
// AI action replaces the text, which is exactly when undo matters most.

type Mode = "write" | "preview";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
  /** True while an AI action is rewriting the letter — the text is locked. */
  aiBusy: boolean;
  aiBusyLabel?: string;
  /**
   * Narrate the wait with the cover-letter phase script instead of a single
   * label. Reserved for a whole-letter regeneration, which takes as long as a
   * first draft; targeted refinements keep the shorter treatment.
   */
  aiNarrate?: boolean;
  onSave: () => void;
  onCopy: () => void;
  onExport: (format: CoverLetterExportFormat) => void;
};

export function CoverLetterEditor({
  value,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  dirty,
  saving,
  aiBusy,
  aiBusyLabel,
  aiNarrate,
  onSave,
  onCopy,
  onExport,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [mode, setMode] = useState<Mode>("write");

  // Restore the caret/selection after a toolbar command edits `value` — must
  // run once the textarea's DOM actually holds the new text, so a plain
  // synchronous set right after onChange would still read the stale value.
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const node = textareaRef.current;
    if (pending && node) {
      node.focus();
      node.setSelectionRange(pending.start, pending.end);
      pendingSelection.current = null;
    }
  }, [value]);

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+S while the editor has focus.
  // Scoped to the textarea so the shortcuts never hijack the rest of the app.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (key === "y") {
        e.preventDefault();
        onRedo();
      } else if (key === "s") {
        e.preventDefault();
        onSave();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo, onSave]);

  function handleRichTextCommand(command: RichTextCommand, linkUrl?: string) {
    const node = textareaRef.current;
    if (!node) return;
    const next = applyRichTextCommand(
      command,
      { value, start: node.selectionStart, end: node.selectionEnd },
      linkUrl,
    );
    pendingSelection.current = { start: next.start, end: next.end };
    onChange(next.value);
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label="Undo"
            onClick={onUndo}
            disabled={!canUndo || aiBusy}
            icon={Undo2}
          />
          <ToolbarIconButton
            label="Redo"
            onClick={onRedo}
            disabled={!canRedo || aiBusy}
            icon={Redo2}
          />
        </div>

        <span className="h-5 w-px bg-black/8" aria-hidden />

        <RichTextToolbar
          disabled={aiBusy || mode === "preview"}
          onCommand={handleRichTextCommand}
        />

        <span className="h-5 w-px bg-black/8" aria-hidden />

        <div className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          <ModeButton
            label="Write"
            icon={PenLine}
            active={mode === "write"}
            onClick={() => setMode("write")}
          />
          <ModeButton
            label="Preview"
            icon={Eye}
            active={mode === "preview"}
            onClick={() => setMode("preview")}
          />
        </div>

        <span className="h-5 w-px bg-black/8" aria-hidden />

        <ExportMenu onCopy={onCopy} onExport={onExport} disabled={aiBusy || !value.trim()} />

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] font-medium",
              dirty ? "text-[#F59E0B]" : "text-[oklch(0.55_0.02_265)]",
            )}
          >
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <DashButton size="sm" onClick={onSave} disabled={!dirty || saving || aiBusy}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save version
              </>
            )}
          </DashButton>
        </div>
      </div>

      {/* ── Writing surface ── */}
      <div className="relative min-h-0 flex-1">
        {mode === "write" ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={aiBusy}
            spellCheck
            aria-label="Cover letter text"
            placeholder="Your cover letter will appear here."
            className="h-full min-h-[420px] w-full resize-none border-0 bg-transparent px-6 py-6 font-serif text-[15px] leading-[1.85] text-[oklch(0.22_0.02_265)] outline-none placeholder:text-[oklch(0.65_0.02_265)] disabled:opacity-60 sm:px-10 sm:py-8"
          />
        ) : (
          <div
            className="h-full min-h-[420px] overflow-y-auto px-6 py-6 font-serif text-[15px] leading-[1.85] text-[oklch(0.22_0.02_265)] sm:px-10 sm:py-8 [&_a]:text-[#2563EB] [&_a]:underline [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"
            // Built from a fixed 5-construct markdown subset the app itself
            // recognizes (see richText.ts) — every other character is HTML-escaped
            // and every href is scheme-checked before it can render as a link.
            dangerouslySetInnerHTML={{
              __html:
                renderRichTextHtml(value) ||
                '<p style="color: oklch(0.65 0.02 265)">Your cover letter will appear here.</p>',
            }}
          />
        )}

        {aiBusy && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
            <div className="w-[min(22rem,90%)] rounded-xl border border-black/5 bg-white px-4 py-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)]">
              {aiNarrate ? (
                // A full rewrite takes as long as a first generation, so it gets
                // the same narrated wait (Module 6G). Targeted refinements —
                // grammar, a single paragraph — are short enough that a named
                // action plus a moving bar is the honest signal; walking them
                // through five reasoning phases would overstate the work.
                <AIThinkingInline capability={AI_CAPABILITIES.COVER_LETTER} />
              ) : (
                <div className="flex items-center gap-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
                  <span className="text-sm font-medium text-[oklch(0.3_0.02_265)]">
                    {aiBusyLabel ?? "Working on your letter…"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-[oklch(0.45_0.02_265)] transition-colors hover:bg-black/[0.04] hover:text-[oklch(0.2_0.02_265)] disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ModeButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-white text-[#2563EB] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          : "text-[oklch(0.45_0.02_265)] hover:text-[oklch(0.25_0.02_265)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
