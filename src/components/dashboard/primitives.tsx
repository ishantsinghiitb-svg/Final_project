import { type ReactNode } from "react";
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
}: {
  company: string;
  tone: string;
  size?: number;
}) {
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

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="font-display text-sm font-semibold text-[oklch(0.25_0.02_265)]">{children}</p>
      {action}
    </div>
  );
}