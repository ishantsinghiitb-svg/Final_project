import { createServiceSupabase } from "@/server/supabase";

// ── Admin Platform user search (Module 13 · Phase 5) ──
//
// Read-only. There is no existing safe architecture for disabling/deleting a
// user (no is_active/is_banned column, no admin delete flow), and this phase
// explicitly says not to invent destructive actions without one — so this
// intentionally exposes information only, nothing that mutates a user.
//
// Per-user application counts are deliberately NOT included: PostgREST has
// no GROUP BY aggregation without a dedicated view/RPC, and adding one just
// for a list-view nicety is the "complicated analytics infrastructure" this
// phase says to avoid. AI credit usage (already a single indexed lookup) is
// the "usage information" shown instead.

const MAX_RESULTS = 50;

export type AdminUserSummary = {
  id: string;
  email: string | null;
  fullName: string | null;
  location: string | null;
  targetRole: string | null;
  createdAt: string;
  creditsTotal: number | null;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  lastAiUsedAt: string | null;
};

/** Escapes PostgREST `ilike` wildcards so a search term can't alter the match pattern. */
function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

export async function searchAdminUsers(query: string): Promise<AdminUserSummary[]> {
  const db = createServiceSupabase();
  const trimmed = query.trim();

  let profileQuery = db
    .from("profiles")
    .select("id, email, full_name, location, target_role, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_RESULTS);

  if (trimmed) {
    const like = `%${escapeIlike(trimmed)}%`;
    profileQuery = profileQuery.or(`email.ilike.${like},full_name.ilike.${like}`);
  }

  const { data: profiles, error } = await profileQuery;
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const { data: usage, error: usageError } = await db
    .from("user_ai_usage")
    .select("user_id, credits_total, credits_used, credits_remaining, last_used_at")
    .in("user_id", ids);
  if (usageError) throw usageError;

  const usageById = new Map((usage ?? []).map((u) => [u.user_id, u]));

  return profiles.map((p) => {
    const u = usageById.get(p.id);
    return {
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      location: p.location,
      targetRole: p.target_role,
      createdAt: p.created_at,
      creditsTotal: u?.credits_total ?? null,
      creditsUsed: u?.credits_used ?? null,
      creditsRemaining: u?.credits_remaining ?? null,
      lastAiUsedAt: u?.last_used_at ?? null,
    };
  });
}
