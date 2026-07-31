import { X } from "lucide-react";

// ── EndInterviewDialog (Module 7C) ──
//
// A plain confirmation — ending is always free, so there's no cost warning
// here (unlike StartMockInterviewDialog). Its only job is to prevent an
// accidental End click from cutting off an interview the candidate meant to
// keep going.

export function EndInterviewDialog({
  open,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isPending ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_265)] p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)]">
        <button
          onClick={onCancel}
          disabled={isPending}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-lg text-white/50 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="font-display text-base font-semibold text-white">End this interview?</h2>
        <p className="mt-2 text-sm text-white/60">
          You'll get your full evaluation report right after — this doesn't cost anything, and you
          can always start a brand-new mock interview later.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#F43F5E] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Ending…" : "End interview"}
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}
