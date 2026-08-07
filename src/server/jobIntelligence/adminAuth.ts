import { requireUser, type AuthedContext } from "@/server/supabase";
import { serverEnv } from "@/server/env";

// ── Module 10A: admin gating for the manual crawl framework ──
//
// There is no `is_admin` role/column anywhere in this project (checked —
// see MEMORY). Crawling is explicitly "admin-only manual" and "never
// user-triggered" (module scope), so gating needs to reject every ordinary
// authenticated user by default. A small env allowlist checked against the
// caller's Supabase-verified email is the simplest thing that satisfies
// that without inventing a roles/permissions system this module doesn't
// otherwise need.

function adminAllowlist(): string[] {
  return serverEnv.adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export class AdminAccessError extends Error {
  constructor(message = "Admin access required.") {
    super(message);
    this.name = "AdminAccessError";
  }
}

/**
 * Validates the caller's session (same as `requireUser`) AND that their
 * verified email is on the `ADMIN_EMAILS` allowlist. Throws `AdminAccessError`
 * for anyone else — including a perfectly valid, logged-in end user.
 */
export async function requireAdmin(accessToken: string | undefined | null): Promise<AuthedContext> {
  const authed = await requireUser(accessToken);
  const email = authed.user.email?.toLowerCase();
  const allowlist = adminAllowlist();

  if (allowlist.length === 0) {
    throw new AdminAccessError("No admin emails configured (ADMIN_EMAILS is empty).");
  }
  if (!email || !allowlist.includes(email)) {
    throw new AdminAccessError();
  }
  return authed;
}
