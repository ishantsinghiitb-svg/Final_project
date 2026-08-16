import { describe, expect, it } from "vitest";
import { MOCK_INTERVIEW_MAX_ANSWER_CHARS } from "@/features/mock-interview/constants";
import { INTERVIEWER_ROLES } from "@/features/mock-interview/interviewerRoles";
import { StartSchema, SubmitAnswerSchema } from "./mockInterview";

// ── Mock Interview server function validators (Module 13 · Phase 2 · A3) ──

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_ROLE = INTERVIEWER_ROLES[0].id;

describe("StartSchema", () => {
  const valid = {
    accessToken: "token",
    interviewId: VALID_UUID,
    clientKey: VALID_UUID,
    interviewerRole: VALID_ROLE,
  };

  it("accepts valid input, including without the optional fields", () => {
    expect(StartSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { clientKey: _clientKey, ...withoutClientKey } = valid;
    expect(StartSchema.safeParse(withoutClientKey).success).toBe(false);
  });

  it("rejects an interviewerRole not in the offered catalogue", () => {
    expect(StartSchema.safeParse({ ...valid, interviewerRole: "made-up-role" }).success).toBe(
      false,
    );
  });

  it("rejects a non-uuid clientKey", () => {
    expect(StartSchema.safeParse({ ...valid, clientKey: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a malformed request body (array instead of object)", () => {
    expect(StartSchema.safeParse([valid]).success).toBe(false);
  });
});

describe("SubmitAnswerSchema", () => {
  const valid = {
    accessToken: "token",
    sessionId: VALID_UUID,
    turnIndex: 0,
    answer: "My answer to the question.",
    inputMode: "text",
  };

  it("accepts valid input", () => {
    expect(SubmitAnswerSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty answer for a skipped turn", () => {
    expect(
      SubmitAnswerSchema.safeParse({ ...valid, answer: "", inputMode: "skipped" }).success,
    ).toBe(true);
  });

  it("rejects a negative or non-integer turnIndex", () => {
    expect(SubmitAnswerSchema.safeParse({ ...valid, turnIndex: -1 }).success).toBe(false);
    expect(SubmitAnswerSchema.safeParse({ ...valid, turnIndex: 1.5 }).success).toBe(false);
    expect(SubmitAnswerSchema.safeParse({ ...valid, turnIndex: "0" }).success).toBe(false);
  });

  it("rejects an invalid inputMode enum value", () => {
    expect(SubmitAnswerSchema.safeParse({ ...valid, inputMode: "telepathy" }).success).toBe(false);
  });

  it("rejects an answer beyond the existing enforced character limit", () => {
    const tooLong = "x".repeat(MOCK_INTERVIEW_MAX_ANSWER_CHARS + 1);
    expect(SubmitAnswerSchema.safeParse({ ...valid, answer: tooLong }).success).toBe(false);
  });
});
