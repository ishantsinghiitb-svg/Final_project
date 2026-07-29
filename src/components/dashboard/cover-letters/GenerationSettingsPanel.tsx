import { useEffect, useState } from "react";
import { Check, Loader2, SlidersHorizontal } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import type { CoverLetterLength, CoverLetterTone } from "@/features/cover-letters/constants";
import { CustomInstructionsField, LengthField, ToneField } from "./GenerationSettingsFields";

// ── Generation settings panel (Module 6E · right sidebar) ──
//
// These settings describe how the NEXT AI action should write. Changing them
// costs nothing and does not touch the letter — the user picks the settings,
// then chooses an action. Saving them persists to the document so reopening the
// Studio months later restores the same intent.

type Props = {
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions: string;
  disabled: boolean;
  saving: boolean;
  onChange: (next: {
    tone: CoverLetterTone;
    length: CoverLetterLength;
    customInstructions: string;
  }) => void;
  onSave: () => void;
};

export function GenerationSettingsPanel({
  tone,
  length,
  customInstructions,
  disabled,
  saving,
  onChange,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  // The panel only tracks whether the user has touched the settings since the
  // last save; the values themselves live in the Studio so an AI action always
  // reads the same source of truth the panel shows.
  useEffect(() => {
    if (!saving) return;
    setDirty(false);
  }, [saving]);

  function update(
    patch: Partial<{
      tone: CoverLetterTone;
      length: CoverLetterLength;
      customInstructions: string;
    }>,
  ) {
    setDirty(true);
    onChange({ tone, length, customInstructions, ...patch });
  }

  return (
    <DashCard padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
      >
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
          Generation settings
        </span>
        <span className="text-[11px] font-medium text-[#2563EB]">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-black/5 px-4 py-4">
          <ToneField
            value={tone}
            onChange={(next) => update({ tone: next })}
            disabled={disabled}
            compact
          />
          <LengthField
            value={length}
            onChange={(next) => update({ length: next })}
            disabled={disabled}
          />
          <CustomInstructionsField
            value={customInstructions}
            onChange={(next) => update({ customInstructions: next })}
            disabled={disabled}
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
              Applies to your next AI action.
            </p>
            <DashButton
              size="sm"
              variant="outline"
              onClick={onSave}
              disabled={disabled || saving || !dirty}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Save settings
                </>
              )}
            </DashButton>
          </div>
        </div>
      )}
    </DashCard>
  );
}
