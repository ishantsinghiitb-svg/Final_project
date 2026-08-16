import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, AdminAccessError } from "@/server/jobIntelligence/adminAuth";
import { getAdminOverviewData, type AdminOverviewData } from "@/server/admin/AdminOverview";
import { searchAdminUsers as searchAdminUsersData, type AdminUserSummary } from "@/server/admin/AdminUsers";
import { listAdminFeedback as listAdminFeedbackData, type AdminFeedbackItem } from "@/server/admin/AdminFeedback";
import { accessToken, freeText, validate } from "./validation";

// ── Admin Platform server functions (Module 13 · Phase 5) ──
//
// Every handler calls `requireAdmin` FIRST — see
// src/server/jobIntelligence/adminAuth.ts, the same ADMIN_EMAILS-allowlist
// gate the Module 10B.1 crawler admin panel already uses. That module's
// gate was written generically (it validates a session then checks an email
// allowlist; nothing about it is crawl-specific), so it is reused as-is
// rather than duplicated here.
//
// `getIsAdmin` and `getAdminOverview` return `isAdmin: false` for a
// non-admin caller instead of throwing, so the dashboard nav link and the
// overview page can simply not render — the same pattern
// `getCrawlAdminOverview` already established. The users/feedback lookups
// are only ever reached from inside a page already gated behind that check,
// so they just let `requireAdmin`'s rejection propagate as a normal error.

export const AccessTokenOnlySchema = z.object({ accessToken });

/** Cheap admin check for nav visibility — no data queries, just the auth gate. */
export const getIsAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<{ isAdmin: boolean }> => {
    try {
      await requireAdmin(data.accessToken);
      return { isAdmin: true };
    } catch (err) {
      if (err instanceof AdminAccessError) return { isAdmin: false };
      throw err;
    }
  });

export type AdminOverviewResult = { isAdmin: boolean; data: AdminOverviewData | null };

export const getAdminOverview = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<AdminOverviewResult> => {
    try {
      await requireAdmin(data.accessToken);
    } catch (err) {
      if (err instanceof AdminAccessError) return { isAdmin: false, data: null };
      throw err;
    }
    return { isAdmin: true, data: await getAdminOverviewData() };
  });

export const SearchAdminUsersSchema = z.object({
  accessToken,
  query: freeText(200, { optional: true }),
});

export const searchAdminUsers = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(SearchAdminUsersSchema, data))
  .handler(async ({ data }): Promise<AdminUserSummary[]> => {
    await requireAdmin(data.accessToken);
    return searchAdminUsersData(data.query ?? "");
  });

export const listAdminFeedback = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<AdminFeedbackItem[]> => {
    await requireAdmin(data.accessToken);
    return listAdminFeedbackData();
  });
