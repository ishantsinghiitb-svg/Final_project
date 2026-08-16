import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";

/**
 * The one place that answers "who is signed in, and how do we show them?".
 *
 * There are two legitimate stores for this and they can disagree:
 *   • the `profiles` row  — what the user has explicitly set in Settings,
 *                           including an avatar they uploaded themselves
 *   • Supabase `user_metadata` — what the identity provider supplied, e.g. a
 *                           Google account's `picture`/`avatar_url` and `name`
 *
 * `ProfileService.ensureProfile` copies the provider metadata across, but only
 * when it CREATES the row (`if (existing) return existing`). So an account whose
 * profile row already existed before it had provider metadata — an email/password
 * signup that later authenticated with Google, or any row created before the
 * metadata arrived — keeps `avatar_url: null` forever and renders the generic
 * placeholder even though Google is supplying a picture.
 *
 * Resolving at read time fixes that for every existing account without a
 * migration, a backfill job, or any write: the profile row wins when it has a
 * value (it is the user's own choice), and provider metadata fills the gaps.
 * Nothing is fabricated — when neither source has an avatar the caller draws
 * initials.
 */

export type UserIdentity = {
  /** Best available human name. Falls back to the email local part, then "Account". */
  displayName: string;
  /** The authenticated account's email. Empty string when somehow absent. */
  email: string;
  /** Verified avatar URL, or null when neither source has one. */
  avatarUrl: string | null;
  /** 1-2 character fallback for the avatar placeholder. */
  initials: string;
  /** True once auth has resolved a user. */
  isAuthenticated: boolean;
};

function metaString(meta: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Derives initials from a name, or from the email local part when there is no name. */
export function initialsFrom(name: string | null, email: string): string {
  const source = (name ?? email.split("@")[0] ?? "").trim();
  if (!source) return "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function useUserIdentity(): UserIdentity {
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;

    const email = profile?.email ?? user?.email ?? "";

    // Profile row first (the user's own choice), then provider metadata.
    const name =
      (profile?.full_name?.trim() || null) ??
      metaString(meta, "full_name", "name", "given_name") ??
      null;

    const avatarUrl =
      (profile?.avatar_url?.trim() || null) ?? metaString(meta, "avatar_url", "picture") ?? null;

    return {
      displayName: name ?? (email ? email.split("@")[0].replace(/[._-]/g, " ") : "Account"),
      email,
      avatarUrl,
      initials: initialsFrom(name, email),
      isAuthenticated: Boolean(user),
    };
  }, [user, profile]);
}
