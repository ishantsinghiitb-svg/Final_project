import { createServiceSupabase } from "@/server/supabase";
import type { FeedbackCategory } from "@/types";

// ── Admin Platform feedback view (Module 13 · Phase 5) ──
//
// `feedback`'s RLS only lets a user read their own rows (see the Phase 3
// migration) — this reads across all users via the service-role client,
// which is why it must only ever be reached after `requireAdmin`.

const MAX_RESULTS = 200;

export type AdminFeedbackItem = {
  id: string;
  userId: string;
  userEmail: string | null;
  userFullName: string | null;
  category: FeedbackCategory;
  message: string;
  pagePath: string | null;
  createdAt: string;
};

export async function listAdminFeedback(): Promise<AdminFeedbackItem[]> {
  const db = createServiceSupabase();

  const { data: rows, error } = await db
    .from("feedback")
    .select("id, user_id, category, message, page_path, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_RESULTS);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      userEmail: profile?.email ?? null,
      userFullName: profile?.full_name ?? null,
      category: r.category as FeedbackCategory,
      message: r.message,
      pagePath: r.page_path,
      createdAt: r.created_at,
    };
  });
}
