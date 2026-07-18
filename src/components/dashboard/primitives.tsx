import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashCard({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * StickyPageHeader
 *
 * Wraps a page's PageHeader (and, where present, its filter/sort/view-switcher
 * bar) so it stays pinned right below the app-level header while the page's
 * content scrolls underneath. Not for individual cards — only page-level
 * navigation/header controls should use this.
 */
export function StickyPageHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-15 z-10 space-y-4 bg-[oklch(0.98_0.005_250)]/95 pb-4 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-[oklch(0.5_0.02_265)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-black/10 bg-white/50 p-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-display text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[oklch(0.45_0.02_265)]">{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-black/10 bg-black/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[oklch(0.4_0.02_265)]">
      {children}
    </kbd>
  );
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "blue" | "purple" | "green" | "amber" | "rose";
  className?: string;
}) {
  const map: Record<string, string> = {
    default: "bg-black/[0.04] text-[oklch(0.35_0.02_265)]",
    blue: "bg-[#2563EB]/10 text-[#2563EB]",
    purple: "bg-[#7C3AED]/10 text-[#7C3AED]",
    green: "bg-[#22C55E]/15 text-[#16A34A]",
    amber: "bg-[#F59E0B]/15 text-[#B45309]",
    rose: "bg-[#F43F5E]/10 text-[#E11D48]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CompanyMark({
  company,
  tone,
  size = 32,
  logoUrl,
}: {
  company: string;
  tone: string;
  size?: number;
  logoUrl?: string | null;
}) {
  // Render the stored company_logo_url when present; fall back to the tinted
  // initials only when there's no logo, or the image fails to load (LinkedIn's
  // media.licdn.com URLs can be signed/time-limited and expire over time).
  const [imgFailed, setImgFailed] = useState(false);
  // Reset the failure flag if the URL changes (this component can be reused
  // for a different company without remounting).
  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={`${company} logo`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="shrink-0 rounded-lg bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn("grid place-items-center rounded-lg bg-gradient-to-br text-white font-semibold", tone)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {company[0]}
    </div>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type MultiSelectOption = { value: string; label: string };

/**
 * MultiSelectDropdown
 *
 * Checkbox-panel dropdown for filters with more than one selectable value at
 * once — same trigger-button styling as a native filter `<select>`, so it
 * drops into existing filter bars without changing their layout.
 */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  options: readonly MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleValue = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const buttonLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label} (${selected.length})`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm transition-colors",
          selected.length > 0
            ? "border-[#2563EB]/30 text-[#2563EB]"
            : "border-black/5 text-[oklch(0.4_0.02_265)] hover:border-black/10",
        )}
      >
        {buttonLabel}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-20 max-h-72 w-52 overflow-y-auto rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-[oklch(0.35_0.02_265)] transition-colors hover:bg-black/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(o.value)}
                  className="h-3.5 w-3.5 rounded border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
                />
                {o.label}
              </label>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-1.5 border-t border-black/5 px-3 py-2 text-xs text-[oklch(0.5_0.02_265)] hover:bg-black/[0.03] transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="font-display text-sm font-semibold text-[oklch(0.25_0.02_265)]">{children}</p>
      {action}
    </div>
  );
}