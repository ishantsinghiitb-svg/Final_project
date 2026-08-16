import { describe, expect, it } from "vitest";
import { COVER_LETTER_MAX_SESSION_ACTIONS } from "@/features/cover-letters/constants";
import type { ServerSupabase } from "@/server/supabase";
import { recordSessionAction, requireActiveSession } from "./CoverLetterAIService";

// ── Cover Letter session-action budget (Module 13 · Phase 2 · B1) ──
//
// `requireActiveSession`/`recordSessionAction` are the actual security
// boundary this closes: a session's free AI actions (rewrite, tone/length
// change, explain, ...) were checked only for "does a session exist", never
// counted, so once a session was open (1 paid credit) an authenticated user
// could script an unbounded number of real provider calls against it for
// free. These tests exercise that gate directly — the full generation flow
// (loadContext, prompt building, provider call, schema parsing) is a
// separate concern already covered by this module's own design; the gate
// itself is what needed a regression test.
//
// A single in-memory `cover_letters` row is enough: both functions only ever
// touch one row by id via `.select()...eq("id", ...).maybeSingle()` /
// `.update()...eq("id", ...)`.

function fakeSupabaseWithRow(row: Record<string, unknown> | null): {
  sb: ServerSupabase;
  row: Record<string, unknown> | null;
} {
  const state = { row };
  const client = {
    from(table: string) {
      if (table !== "cover_letters") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.row, error: null }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            if (state.row) Object.assign(state.row, values);
            return { data: null, error: null };
          },
        }),
      };
    },
  };
  return { sb: client as unknown as ServerSupabase, row: state.row };
}

describe("requireActiveSession", () => {
  it("allows a follow-up action when a session is active and under budget", async () => {
    const { sb } = fakeSupabaseWithRow({
      id: "letter-1",
      ai_session_id: "session-1",
      ai_action_count: 5,
    });
    const result = await requireActiveSession(sb, "letter-1");
    expect(result).toEqual({ ok: true });
  });

  it("allows a follow-up right after a fresh charge (action count reset to 0)", async () => {
    // The "valid paid entitlement" case: a session that was just opened by a
    // charged generation starts at 0, well under the budget.
    const { sb } = fakeSupabaseWithRow({
      id: "letter-1",
      ai_session_id: "session-2",
      ai_action_count: 0,
    });
    const result = await requireActiveSession(sb, "letter-1");
    expect(result).toEqual({ ok: true });
  });

  it("rejects when no document/coverLetterId is supplied (unauthorized / never generated)", async () => {
    const { sb } = fakeSupabaseWithRow(null);
    const result = await requireActiveSession(sb, undefined);
    expect(result).toMatchObject({ ok: false, code: "session_required" });
  });

  it("rejects when the document has no active session", async () => {
    const { sb } = fakeSupabaseWithRow({ id: "letter-1", ai_session_id: null, ai_action_count: 0 });
    const result = await requireActiveSession(sb, "letter-1");
    expect(result).toMatchObject({ ok: false, code: "session_required" });
  });

  it("rejects when the document doesn't exist at all", async () => {
    const { sb } = fakeSupabaseWithRow(null);
    const result = await requireActiveSession(sb, "someone-elses-letter");
    expect(result).toMatchObject({ ok: false, code: "session_required" });
  });

  it("rejects once the session's free-action budget is exhausted", async () => {
    const { sb } = fakeSupabaseWithRow({
      id: "letter-1",
      ai_session_id: "session-1",
      ai_action_count: COVER_LETTER_MAX_SESSION_ACTIONS,
    });
    const result = await requireActiveSession(sb, "letter-1");
    expect(result).toMatchObject({ ok: false, code: "session_action_limit_reached" });
  });

  it("stops a scripted replay loop exactly at the budget — not one call later", async () => {
    const { sb, row } = fakeSupabaseWithRow({
      id: "letter-1",
      ai_session_id: "session-1",
      ai_action_count: 0,
    });

    // Simulate COVER_LETTER_MAX_SESSION_ACTIONS free actions in a row, each
    // checking the gate first and then recording itself — exactly the
    // sequence runCoverLetterAI's free path follows.
    for (let i = 0; i < COVER_LETTER_MAX_SESSION_ACTIONS; i++) {
      const gate = await requireActiveSession(sb, "letter-1");
      expect(gate).toEqual({ ok: true });
      await recordSessionAction(sb, "letter-1");
    }

    expect(row?.ai_action_count).toBe(COVER_LETTER_MAX_SESSION_ACTIONS);
    // The next attempt — the replay — is rejected instead of silently
    // continuing forever.
    const replay = await requireActiveSession(sb, "letter-1");
    expect(replay).toMatchObject({ ok: false, code: "session_action_limit_reached" });
  });
});

describe("recordSessionAction", () => {
  it("increments the session's action count by exactly one", async () => {
    const { sb, row } = fakeSupabaseWithRow({
      id: "letter-1",
      ai_session_id: "session-1",
      ai_action_count: 2,
    });
    await recordSessionAction(sb, "letter-1");
    expect(row?.ai_action_count).toBe(3);
  });
});
