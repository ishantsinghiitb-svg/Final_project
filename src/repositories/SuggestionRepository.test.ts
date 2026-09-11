import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SuggestionRepository } from "./SuggestionRepository";
import type { Database } from "@/types/database";

// ── Gmail disconnect cleanup tests (production audit B5) ──
//
// detachGmailFromCorroboratedSuggestions is the fix for a real data-loss
// bug: suggestions.gmail_message_id is ON DELETE CASCADE (unlike
// calendar_event_id, which is ON DELETE SET NULL — see
// deleteCalendarOnlySuggestions's own header for why that asymmetry exists).
// Deleting a user's gmail_messages rows outright on Gmail disconnect would
// therefore cascade-delete every suggestion referencing one, INCLUDING a
// corroborated suggestion that also carries a still-valid calendar_event_id
// — silently destroying Calendar-derived suggestion data even though
// Calendar remains connected. This must run first and detach exactly the
// corroborated rows, leaving gmail-only and calendar-only rows untouched.

type SuggestionRow = {
  id: string;
  user_id: string;
  gmail_message_id: string | null;
  calendar_event_id: string | null;
};

function fakeSupabaseForUpdate(
  rows: SuggestionRow[],
  callLog: { calls: number },
): SupabaseClient<Database> {
  return {
    from(table: string) {
      if (table !== "suggestions") throw new Error(`unexpected table ${table}`);
      return {
        update(patch: Partial<SuggestionRow>) {
          const predicates: ((row: SuggestionRow) => boolean)[] = [];
          const chain = {
            eq(column: string, value: unknown) {
              predicates.push((r) => (r as Record<string, unknown>)[column] === value);
              return chain;
            },
            not(column: string, op: string, value: unknown) {
              if (op !== "is" || value !== null) {
                throw new Error(`fake supabase: unsupported .not() form ${op}/${String(value)}`);
              }
              predicates.push((r) => (r as Record<string, unknown>)[column] !== null);
              return chain;
            },
            then(
              resolve: (v: { data: null; error: null }) => unknown,
              reject?: (e: unknown) => unknown,
            ) {
              callLog.calls += 1;
              for (const row of rows) {
                if (predicates.every((p) => p(row))) Object.assign(row, patch);
              }
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

const userId = "user-1";

describe("detachGmailFromCorroboratedSuggestions", () => {
  it("nulls gmail_message_id only on rows that ALSO have calendar_event_id set", async () => {
    const rows: SuggestionRow[] = [
      { id: "corroborated", user_id: userId, gmail_message_id: "msg-1", calendar_event_id: "evt-1" },
      { id: "gmail-only", user_id: userId, gmail_message_id: "msg-2", calendar_event_id: null },
      { id: "calendar-only", user_id: userId, gmail_message_id: null, calendar_event_id: "evt-2" },
    ];
    const callLog = { calls: 0 };
    const repo = new SuggestionRepository(fakeSupabaseForUpdate(rows, callLog));

    await repo.detachGmailFromCorroboratedSuggestions(userId);

    expect(rows.find((r) => r.id === "corroborated")).toMatchObject({
      gmail_message_id: null,
      calendar_event_id: "evt-1",
    });
    // Gmail-only survives untouched here — it's meant to disappear later via
    // the CASCADE when gmail_messages itself is deleted, not by this step.
    expect(rows.find((r) => r.id === "gmail-only")).toMatchObject({ gmail_message_id: "msg-2" });
    // Calendar-only was never a CASCADE risk and must be left exactly as-is.
    expect(rows.find((r) => r.id === "calendar-only")).toMatchObject({
      gmail_message_id: null,
      calendar_event_id: "evt-2",
    });
  });

  it("is scoped to the calling user's own suggestions", async () => {
    const rows: SuggestionRow[] = [
      {
        id: "someone-elses",
        user_id: "someone-else",
        gmail_message_id: "msg-1",
        calendar_event_id: "evt-1",
      },
    ];
    const callLog = { calls: 0 };
    const repo = new SuggestionRepository(fakeSupabaseForUpdate(rows, callLog));

    await repo.detachGmailFromCorroboratedSuggestions(userId);

    expect(rows[0].gmail_message_id).toBe("msg-1");
  });

  it("is a safe no-op on retry once every corroborated row is already detached", async () => {
    const rows: SuggestionRow[] = [
      { id: "already-detached", user_id: userId, gmail_message_id: null, calendar_event_id: "evt-1" },
    ];
    const callLog = { calls: 0 };
    const repo = new SuggestionRepository(fakeSupabaseForUpdate(rows, callLog));

    await expect(repo.detachGmailFromCorroboratedSuggestions(userId)).resolves.toBeUndefined();
    await expect(repo.detachGmailFromCorroboratedSuggestions(userId)).resolves.toBeUndefined();
    expect(callLog.calls).toBe(2);
    expect(rows[0].gmail_message_id).toBeNull();
  });

  it("leaves a user with no suggestions at all untouched", async () => {
    const rows: SuggestionRow[] = [];
    const callLog = { calls: 0 };
    const repo = new SuggestionRepository(fakeSupabaseForUpdate(rows, callLog));

    await expect(repo.detachGmailFromCorroboratedSuggestions(userId)).resolves.toBeUndefined();
  });
});
