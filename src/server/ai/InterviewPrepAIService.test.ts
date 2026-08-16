import { describe, expect, it } from "vitest";
import { INTERVIEW_PREP_MAX_SESSION_ACTIONS } from "@/features/interview-prep/constants";
import type { ServerSupabase } from "@/server/supabase";
import { recordSessionAction, requireActiveSession } from "./InterviewPrepAIService";

// ── Interview Prep session-action budget (Module 13 · Phase 2 · B1) ──
//
// Same gap and same fix as CoverLetterAIService (see that file's test
// header for the full rationale): generating/regenerating an answer for any
// question was checked only for "does a session exist", so once a 3-credit
// preparation was generated, an unbounded number of free answer
// generations could be scripted against it. These tests exercise
// `requireActiveSession`/`recordSessionAction` directly — the actual gate.

function fakeSupabaseWithRow(row: Record<string, unknown> | null): {
  sb: ServerSupabase;
  row: Record<string, unknown> | null;
} {
  const state = { row };
  const client = {
    from(table: string) {
      if (table !== "interview_preps") throw new Error(`Unexpected table: ${table}`);
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
  it("allows a follow-up (generate/regenerate an answer) when under budget", async () => {
    const { sb } = fakeSupabaseWithRow({
      id: "prep-1",
      ai_session_id: "session-1",
      ai_action_count: 10,
    });
    const result = await requireActiveSession(sb, "prep-1");
    expect(result).toEqual({ ok: true });
  });

  it("allows a follow-up right after a fresh 3-credit generation (action count reset to 0)", async () => {
    const { sb } = fakeSupabaseWithRow({
      id: "prep-1",
      ai_session_id: "session-2",
      ai_action_count: 0,
    });
    const result = await requireActiveSession(sb, "prep-1");
    expect(result).toEqual({ ok: true });
  });

  it("rejects when the preparation was never generated (unauthorized / no session)", async () => {
    const { sb } = fakeSupabaseWithRow(null);
    const result = await requireActiveSession(sb, "someone-elses-prep");
    expect(result).toMatchObject({ ok: false, code: "session_required" });
  });

  it("rejects when the preparation exists but has no active session", async () => {
    const { sb } = fakeSupabaseWithRow({ id: "prep-1", ai_session_id: null, ai_action_count: 0 });
    const result = await requireActiveSession(sb, "prep-1");
    expect(result).toMatchObject({ ok: false, code: "session_required" });
  });

  it("rejects once the session's free-answer budget is exhausted", async () => {
    const { sb } = fakeSupabaseWithRow({
      id: "prep-1",
      ai_session_id: "session-1",
      ai_action_count: INTERVIEW_PREP_MAX_SESSION_ACTIONS,
    });
    const result = await requireActiveSession(sb, "prep-1");
    expect(result).toMatchObject({ ok: false, code: "session_action_limit_reached" });
  });

  it("stops a scripted replay loop exactly at the budget — not one call later", async () => {
    const { sb, row } = fakeSupabaseWithRow({
      id: "prep-1",
      ai_session_id: "session-1",
      ai_action_count: 0,
    });

    for (let i = 0; i < INTERVIEW_PREP_MAX_SESSION_ACTIONS; i++) {
      const gate = await requireActiveSession(sb, "prep-1");
      expect(gate).toEqual({ ok: true });
      await recordSessionAction(sb, "prep-1");
    }

    expect(row?.ai_action_count).toBe(INTERVIEW_PREP_MAX_SESSION_ACTIONS);
    const replay = await requireActiveSession(sb, "prep-1");
    expect(replay).toMatchObject({ ok: false, code: "session_action_limit_reached" });
  });
});

describe("recordSessionAction", () => {
  it("increments the session's action count by exactly one", async () => {
    const { sb, row } = fakeSupabaseWithRow({
      id: "prep-1",
      ai_session_id: "session-1",
      ai_action_count: 4,
    });
    await recordSessionAction(sb, "prep-1");
    expect(row?.ai_action_count).toBe(5);
  });
});
