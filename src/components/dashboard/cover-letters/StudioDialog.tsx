import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared Studio modal chrome (Module 6E) ──
//
// The Studio needs six small dialogs (generate, rename letter, label version,
// duplicate, delete, credit confirmation). They all use the dashboard's
// established modal look — gradient top rule, gradient icon tile, backdrop blur.
// Factoring the chrome out once keeps them identical to each other and to the
// existing optimizer dialogs, without six copies of the same markup.

type ShellProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  /** Wider shell for the generation setup flow. */
  size?: "sm" | "md" | "lg";
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
};

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
} as const;

export function StudioDialog({
  open,
  title,
  description,
  icon: Icon,
  size = "sm",
  busy = false,
  onClose,
  children,
  footer,
}: ShellProps) {
  // Escape closes — but never mid-request, where closing would strand a call
  // the user has already been charged for.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={busy ? undefined : onClose}
      />

      <div
        className={cn(
          "relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300",
          SIZES[size],
        )}
      >
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] transition-colors hover:bg-black/[0.05] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
            <Icon className="h-5 w-5" />
          </div>

          <h2 className="mt-4 pr-8 font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
            {title}
          </h2>
          {description && (
            <div className="mt-2 text-sm text-[oklch(0.45_0.02_265)]">{description}</div>
          )}

          {children}
        </div>

        {footer && <div className="shrink-0 border-t border-black/5 p-4">{footer}</div>}
      </div>
    </div>
  );
}

// ── Reusable action buttons (same visual language as the optimizer dialogs) ──

export function DialogPrimaryButton({
  onClick,
  disabled,
  busy,
  busyLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function DialogSecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DialogDangerButton({
  onClick,
  disabled,
  busy,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#E11D48] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(225,29,72,0.6)] transition-all hover:-translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * A small single-field prompt (rename a letter, label a version, name a copy).
 * One component covers all three because they differ only in copy.
 */
export function NamePromptDialog({
  open,
  title,
  description,
  label,
  defaultValue,
  confirmLabel,
  busy,
  icon,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  label: string;
  defaultValue: string;
  confirmLabel: string;
  busy?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const trimmed = value.trim();

  return (
    <StudioDialog
      open={open}
      title={title}
      description={description}
      icon={icon}
      busy={busy}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <DialogPrimaryButton
            onClick={() => trimmed && onConfirm(trimmed)}
            disabled={!trimmed}
            busy={busy}
            busyLabel="Saving…"
          >
            {confirmLabel}
          </DialogPrimaryButton>
          <DialogSecondaryButton onClick={onClose} disabled={busy}>
            Cancel
          </DialogSecondaryButton>
        </div>
      }
    >
      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.5_0.02_265)]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmed) onConfirm(trimmed);
        }}
        className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-[oklch(0.25_0.02_265)] outline-none transition-colors focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/15"
      />
    </StudioDialog>
  );
}
