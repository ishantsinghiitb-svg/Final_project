import { cn } from "@/lib/utils";
import {
  LENGTH_OPTIONS,
  MAX_CUSTOM_INSTRUCTIONS,
  TONE_OPTIONS,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";

// ── Generation settings fields (Module 6E) ──
//
// One implementation, two homes: the Generate dialog (before the first letter
// exists) and the Studio's right sidebar (to change settings for the next AI
// action). Keeping them literally the same component is what stops the two
// surfaces drifting apart as tones are added.

export function ToneField({
  value,
  onChange,
  disabled,
  compact = false,
}: {
  value: CoverLetterTone;
  onChange: (tone: CoverLetterTone) => void;
  disabled?: boolean;
  /** Sidebar variant: tighter rows, hint only on the selected option. */
  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
        Tone
      </p>
      <div className={cn("mt-2 grid gap-1.5", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {TONE_OPTIONS.map((tone) => {
          const active = tone.id === value;
          return (
            <button
              key={tone.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(tone.id)}
              aria-pressed={active}
              className={cn(
                "rounded-xl border p-2.5 text-left transition-all disabled:opacity-50",
                active
                  ? "border-[#2563EB]/40 bg-[#2563EB]/[0.04] ring-1 ring-[#2563EB]/15"
                  : "border-black/8 bg-white hover:border-black/15 hover:bg-black/[0.02]",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-medium",
                  active ? "text-[#2563EB]" : "text-[oklch(0.25_0.02_265)]",
                )}
              >
                {tone.label}
              </span>
              {(!compact || active) && (
                <span className="mt-0.5 block text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
                  {tone.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LengthField({
  value,
  onChange,
  disabled,
}: {
  value: CoverLetterLength;
  onChange: (length: CoverLetterLength) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
        Length
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {LENGTH_OPTIONS.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              title={option.hint}
              className={cn(
                "rounded-xl border px-2 py-2 text-center text-xs font-medium transition-all disabled:opacity-50",
                active
                  ? "border-[#2563EB]/40 bg-[#2563EB]/[0.04] text-[#2563EB] ring-1 ring-[#2563EB]/15"
                  : "border-black/8 bg-white text-[oklch(0.4_0.02_265)] hover:border-black/15 hover:bg-black/[0.02]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
        {LENGTH_OPTIONS.find((l) => l.id === value)?.hint}
      </p>
    </div>
  );
}

export function CustomInstructionsField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const remaining = MAX_CUSTOM_INSTRUCTIONS - value.length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
          Custom instructions
        </p>
        <span className="text-[11px] text-[oklch(0.55_0.02_265)]">Optional</span>
      </div>
      <textarea
        value={value}
        disabled={disabled}
        maxLength={MAX_CUSTOM_INSTRUCTIONS}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={
          'e.g. "Focus on leadership." · "Keep it under 300 words." · "Avoid repeating my resume."'
        }
        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-[oklch(0.25_0.02_265)] outline-none transition-colors placeholder:text-[oklch(0.65_0.02_265)] focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15 disabled:opacity-50"
      />
      <p className="mt-1.5 text-[11px] leading-snug text-[oklch(0.5_0.02_265)]">
        {value.trim()
          ? `${remaining} character${remaining === 1 ? "" : "s"} left`
          : "Leave empty and the AI decides what works best for this role."}
      </p>
    </div>
  );
}
