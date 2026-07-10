import { cn } from "@/lib/utils";

/**
 * NextOffer logo mark — SVG reproduction of the brand asset.
 * Blue-to-purple gradient N with upward arrow. Works on dark backgrounds.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="40" x2="40" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* N body - left stroke */}
      <path d="M6 34 L6 10 L14 10 L14 22" stroke="url(#logo-grad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      {/* N diagonal */}
      <path d="M6 10 L26 34" stroke="url(#logo-grad)" strokeWidth="7" strokeLinecap="round"/>
      {/* N body - right stroke */}
      <path d="M26 34 L26 14" stroke="url(#logo-grad)" strokeWidth="7" strokeLinecap="round"/>
      {/* Arrow head at top of right stroke */}
      <path d="M22 8 L30 8 L30 16" stroke="url(#logo-grad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M26 14 L30 8" stroke="url(#logo-grad)" strokeWidth="4.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Logo({
  className,
  size = 28,
  showWordmark = true,
  wordmarkClassName,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span
          className={cn("font-display font-semibold tracking-tight", wordmarkClassName)}
          style={{ fontSize: size * 0.6 }}
          aria-label="NextOffer"
        >
          <span className="text-foreground">Next</span>
          <span className="text-gradient">Offer</span>
        </span>
      )}
    </span>
  );
}

/**
 * Full-width horizontal logo using the PNG asset.
 * Best for light-background auth pages.
 */
export function LogoImage({
  height = 32,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="/image.png"
      alt="NextOffer"
      height={height * 4}
      width={height * 4 * 3.5}
      className={cn("object-contain", className)}
      style={{ height, width: "auto" }}
    />
  );
}
