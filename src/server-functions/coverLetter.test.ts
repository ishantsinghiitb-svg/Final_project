import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_INSTRUCTIONS, MAX_LETTER_CHARS } from "@/features/cover-letters/constants";
import { ActionSchemaInput, GenerateSchema } from "./coverLetter";

// ── Cover Letter server function validators (Module 13 · Phase 2 · A3) ──

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("GenerateSchema", () => {
  const valid = {
    accessToken: "token",
    resumeId: VALID_UUID,
    jobId: VALID_UUID,
    tone: "professional",
    length: "standard",
  };

  it("accepts valid input, including without the optional fields", () => {
    expect(GenerateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts valid input with the optional fields present", () => {
    const result = GenerateSchema.safeParse({
      ...valid,
      customInstructions: "Keep it under 250 words.",
      forceRefresh: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when a required field is missing", () => {
    const { resumeId: _resumeId, ...withoutResumeId } = valid;
    expect(GenerateSchema.safeParse(withoutResumeId).success).toBe(false);
  });

  it("rejects the wrong type for a required field", () => {
    expect(GenerateSchema.safeParse({ ...valid, tone: 42 }).success).toBe(false);
  });

  it("rejects an invalid enum value for tone/length", () => {
    expect(GenerateSchema.safeParse({ ...valid, tone: "sarcastic" }).success).toBe(false);
    expect(GenerateSchema.safeParse({ ...valid, length: "novel-length" }).success).toBe(false);
  });

  it("rejects a non-uuid resumeId/jobId", () => {
    expect(GenerateSchema.safeParse({ ...valid, resumeId: "not-a-uuid" }).success).toBe(false);
    expect(GenerateSchema.safeParse({ ...valid, jobId: "1234" }).success).toBe(false);
  });

  it("rejects customInstructions beyond the existing enforced limit", () => {
    const tooLong = "x".repeat(MAX_CUSTOM_INSTRUCTIONS + 1);
    expect(GenerateSchema.safeParse({ ...valid, customInstructions: tooLong }).success).toBe(false);
  });

  it("accepts customInstructions right at the limit", () => {
    const atLimit = "x".repeat(MAX_CUSTOM_INSTRUCTIONS);
    expect(GenerateSchema.safeParse({ ...valid, customInstructions: atLimit }).success).toBe(true);
  });
});

describe("ActionSchemaInput", () => {
  const valid = {
    accessToken: "token",
    coverLetterId: VALID_UUID,
    action: "regenerate_all",
    content: "Dear hiring manager, ...",
    resumeId: VALID_UUID,
    jobId: VALID_UUID,
    tone: "professional",
    length: "standard",
  };

  it("accepts valid input", () => {
    expect(ActionSchemaInput.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid action enum value", () => {
    expect(ActionSchemaInput.safeParse({ ...valid, action: "delete_everything" }).success).toBe(
      false,
    );
  });

  it("rejects empty content — every action needs the current letter text", () => {
    expect(ActionSchemaInput.safeParse({ ...valid, content: "" }).success).toBe(false);
  });

  it("rejects content beyond the existing enforced letter-length ceiling", () => {
    const tooLong = "x".repeat(MAX_LETTER_CHARS + 1);
    expect(ActionSchemaInput.safeParse({ ...valid, content: tooLong }).success).toBe(false);
  });

  it("rejects a malformed payload shape (array instead of object)", () => {
    expect(ActionSchemaInput.safeParse([valid]).success).toBe(false);
  });

  it("rejects an invalid targetTone when supplied", () => {
    expect(ActionSchemaInput.safeParse({ ...valid, targetTone: "not-a-real-tone" }).success).toBe(
      false,
    );
  });
});
