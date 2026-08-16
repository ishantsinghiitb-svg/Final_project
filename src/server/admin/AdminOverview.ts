import { createServiceSupabase } from "@/server/supabase";

// ── Admin Platform overview data (Module 13 · Phase 5) ──
//
// Every query here goes through the service-role client, which bypasses RLS
// — this is intentionally the ONLY place in the codebase besides the job
// crawler admin panel that does that. Callers MUST have already passed
// `requireAdmin` (see src/server/jobIntelligence/adminAuth.ts) before this
// module is ever reached; nothing here re-checks admin-ness itself.
//
// "Active users" comes from Supabase Auth's own `last_sign_in_at` (via the
// service-role `auth.admin.listUsers` API), not a new activity table — the
// product has no existing session/activity tracking to reuse, and adding one
// would be exactly the "complicated analytics infrastructure" this phase
// says not to build. If that lookup fails for any reason, the field comes
// back `null` rather than a fabricated 0, so the UI can say "unavailable"
// instead of implying no one is active.

const ACTIVE_WINDOW_DAYS = 7;
/** Supabase Auth's admin listUsers page size — comfortably above this
 *  product's current user count. If the real count ever exceeds it, the
 *  overview should move to a paginated sweep — not a concern at this stage. */
const AUTH_USERS_PAGE_SIZE = 1000;

export type AdminOverviewData = {
  totalUsers: number;
  recentSignups: {
    id: string;
    email: string | null;
    fullName: string | null;
    createdAt: string;
  }[];
  /** Signed in within the last 7 days. `null` if Auth admin lookup failed. */
  activeUsersLast7d: number | null;
  totalApplications: number;
  totalGlobalJobs: number;
  /** Users with at least one AI credit consumed — the "usage" signal already tracked. */
  usersWithAiUsage: number;
  feedbackCount: number;
};

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  const db = createServiceSupabase();

  const [
    totalUsersRes,
    recentSignupsRes,
    totalApplicationsRes,
    totalGlobalJobsRes,
    usersWithAiUsageRes,
    feedbackCountRes,
    authUsersRes,
  ] = await Promise.all([
    db.from("profiles").select("*", { count: "exact", head: true }),
    db
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    db.from("applications").select("*", { count: "exact", head: true }),
    db.from("global_jobs").select("*", { count: "exact", head: true }),
    db.from("user_ai_usage").select("*", { count: "exact", head: true }).gt("credits_used", 0),
    db.from("feedback").select("*", { count: "exact", head: true }),
    db.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_PAGE_SIZE }),
  ]);

  if (totalUsersRes.error) throw totalUsersRes.error;
  if (recentSignupsRes.error) throw recentSignupsRes.error;
  if (totalApplicationsRes.error) throw totalApplicationsRes.error;
  if (totalGlobalJobsRes.error) throw totalGlobalJobsRes.error;
  if (usersWithAiUsageRes.error) throw usersWithAiUsageRes.error;
  if (feedbackCountRes.error) throw feedbackCountRes.error;

  let activeUsersLast7d: number | null = null;
  if (!authUsersRes.error) {
    const cutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    activeUsersLast7d = authUsersRes.data.users.filter(
      (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= cutoff,
    ).length;
  }

  return {
    totalUsers: totalUsersRes.count ?? 0,
    recentSignups: (recentSignupsRes.data ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      createdAt: p.created_at,
    })),
    activeUsersLast7d,
    totalApplications: totalApplicationsRes.count ?? 0,
    totalGlobalJobs: totalGlobalJobsRes.count ?? 0,
    usersWithAiUsage: usersWithAiUsageRes.count ?? 0,
    feedbackCount: feedbackCountRes.count ?? 0,
  };
}
