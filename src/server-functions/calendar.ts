import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { GoogleConnectionRepository } from "@/repositories/GoogleConnectionRepository";
import {
  syncCalendarForUser,
  isCalendarSyncDue,
  type CalendarSyncOutcome,
} from "@/server/calendar/CalendarSyncService";
import { rescanCalendarEvents, type CalendarRescanOutcome } from "@/server/calendar/CalendarRescan";
import { accessToken, validate } from "./validation";

const AccessTokenSchema = z.object({ accessToken });

// ── Calendar server functions (Module 9B) ──
//
// Split out from src/server-functions/gmail.ts once Calendar's own trigger
// functions made that file unwieldy — same "lives OUTSIDE src/server/**"
// rationale (Vite's import-protection blocks client imports of any "server"
// path; these createServerFn entry points are what the client calls
// directly, while the handler closures still compile into the server-only
// bundle). Connect/disconnect/auto-sync-toggle for Calendar go through the
// shared google-product functions in server-functions/gmail.ts — this file
// is only the Calendar-specific sync triggers.

type CheckAndSyncCalendarResult = CalendarSyncOutcome | { status: "not_due" };

/** The "app open" trigger — a cheap due-check; only calls into CalendarSyncService when actually due (and auto-sync is enabled). */
export const checkAndSyncCalendar = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenSchema, data))
  .handler(async ({ data }): Promise<CheckAndSyncCalendarResult> => {
    const authed = await requireUser(data.accessToken);
    const repo = new GoogleConnectionRepository(authed.supabase);
    const connection = await repo.findConnectionForSync(authed.user.id);
    if (!connection) return { status: "skipped", reason: "not_connected" };
    if (!isCalendarSyncDue(connection)) return { status: "not_due" };
    return syncCalendarForUser(authed);
  });

/** The manual "Sync Now" trigger — always runs, regardless of the due-check. */
export const syncCalendarNow = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenSchema, data))
  .handler(async ({ data }): Promise<CalendarSyncOutcome> => {
    const authed = await requireUser(data.accessToken);
    return syncCalendarForUser(authed);
  });

type RescanCalendarResult =
  { ok: true; outcome: CalendarRescanOutcome } | { ok: false; message: string };

/**
 * DEVELOPMENT-ONLY. Re-runs the current relevance/matching logic over
 * already-stored calendar_events — no Calendar API call, no change to the
 * OAuth connection or sync checkpoint. `import.meta.env.DEV` is statically
 * false in a production build, so the guard also lets the bundler drop the
 * body entirely rather than shipping a live endpoint that merely refuses at
 * runtime.
 */
export const rebuildCalendarEvents = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenSchema, data))
  .handler(async ({ data }): Promise<RescanCalendarResult> => {
    if (!import.meta.env.DEV) {
      return { ok: false, message: "This utility is only available in development." };
    }
    try {
      const authed = await requireUser(data.accessToken);
      const outcome = await rescanCalendarEvents(authed);
      return { ok: true, outcome };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to rescan calendar events.",
      };
    }
  });
