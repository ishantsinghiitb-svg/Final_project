import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The account avatar, used by the sidebar, Settings and any future account
 * menu so they can never disagree.
 *
 * Mirrors CompanyMark's behaviour for company logos: render the real image when
 * there is one, and fall back to initials the moment it is missing OR fails to
 * load. The load-failure path matters here because Google's
 * `lh3.googleusercontent.com` avatar URLs can start returning 403 once the
 * OAuth grant is revoked, which would otherwise leave a broken image icon.
 */
export function UserAvatar({
  avatarUrl,
  initials,
  size = 32,
  className,
}: {
  avatarUrl: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [avatarUrl]);

  const box = { width: size, height: size } as const;

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={box}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] font-semibold text-white",
        className,
      )}
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials}
    </span>
  );
}
