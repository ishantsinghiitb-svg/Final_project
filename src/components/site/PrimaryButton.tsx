import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CommonProps = {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "ghost" | "outline";
  size?: "md" | "lg";
};

function classesFor({ variant = "primary", size = "md", className }: CommonProps) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60",
    size === "lg" ? "px-5 py-3 text-[15px]" : "px-4 py-2.5 text-sm",
    variant === "primary" &&
      "bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_30px_-10px_oklch(0.58_0.21_260/0.8)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_16px_40px_-12px_oklch(0.58_0.21_260/0.9)] active:translate-y-0",
    variant === "outline" &&
      "border border-white/15 bg-white/[0.02] text-foreground hover:border-white/25 hover:bg-white/[0.05]",
    variant === "ghost" && "text-muted-foreground hover:text-foreground",
    className,
  );
}

export function ButtonLink({
  to,
  children,
  className,
  variant,
  size,
}: CommonProps & { to: string }) {
  return (
    <Link to={to} className={classesFor({ children, className, variant, size })}>
      {children}
    </Link>
  );
}

export function Button({
  onClick,
  type = "button",
  children,
  className,
  variant,
  size,
}: CommonProps & { onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} className={classesFor({ children, className, variant, size })}>
      {children}
    </button>
  );
}