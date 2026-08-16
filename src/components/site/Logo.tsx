import { cn } from "@/lib/utils";

/**
 * Surface the logo is being drawn on. The wordmark's ink has to flip with it:
 * `onDark` uses the marketing site's near-white text + light gradient, which
 * is invisible on the dashboard's white sidebar. Anything rendered on a light
 * background must pass `tone="onLight"`.
 */
export type LogoTone = "onDark" | "onLight";

/**
 * OfferLyst logo mark — the official symbol-only brand asset (icon.png).
 * Height-driven sizing keeps the asset's native aspect ratio intact rather
 * than forcing it into a square.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src="/icon.png"
      alt=""
      aria-hidden
      className={cn("shrink-0 object-contain", className)}
      style={{ height: size, width: "auto" }}
    />
  );
}

export function Logo({
  className,
  size = 32,
  showWordmark = true,
  wordmarkClassName,
  tone = "onDark",
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  tone?: LogoTone;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span
          className={cn(
            "font-display font-semibold leading-none tracking-tight",
            wordmarkClassName,
          )}
          style={{ fontSize: Math.round(size * 0.62) }}
          aria-label="OfferLyst"
        >
          <span className={tone === "onLight" ? "text-[oklch(0.24_0.03_265)]" : "text-foreground"}>
            Offer
          </span>
          <span className={tone === "onLight" ? "text-gradient-ink" : "text-gradient"}>Lyst</span>
        </span>
      )}
    </span>
  );
}

/**
 * Full wordmark lockup (icon + "OfferLyst" text baked into one image).
 * Best for light-background placements with enough horizontal space.
 */
export function LogoImage({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <img
      src="/image.png"
      alt="OfferLyst"
      height={height * 4}
      width={height * 4 * 3.245}
      className={cn("object-contain", className)}
      style={{ height, width: "auto" }}
    />
  );
}
