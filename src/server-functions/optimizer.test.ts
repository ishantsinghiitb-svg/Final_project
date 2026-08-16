import { describe, expect, it } from "vitest";
import { CUSTOM_CATEGORY_MAX_LENGTH } from "@/features/optimizer/constants";
import { OptimizeSchema } from "./optimizer";

// ── Resume Optimizer server function validator (Module 13 · Phase 2 · A3) ──

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("OptimizeSchema", () => {
  const valid = {
    accessToken: "token",
    resumeId: VALID_UUID,
    category: "software_engineering",
    sections: ["summary", "experience"],
  };

  it("accepts valid input", () => {
    expect(OptimizeSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty sections array — the service treats it the same as 'full'", () => {
    expect(OptimizeSchema.safeParse({ ...valid, sections: [] }).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { category: _category, ...withoutCategory } = valid;
    expect(OptimizeSchema.safeParse(withoutCategory).success).toBe(false);
  });

  it("rejects an invalid category enum value", () => {
    expect(OptimizeSchema.safeParse({ ...valid, category: "astronaut" }).success).toBe(false);
  });

  it("rejects a malformed sections array (wrong element type, not an array)", () => {
    expect(OptimizeSchema.safeParse({ ...valid, sections: "summary" }).success).toBe(false);
    expect(OptimizeSchema.safeParse({ ...valid, sections: [123] }).success).toBe(false);
    expect(OptimizeSchema.safeParse({ ...valid, sections: ["not_a_real_section"] }).success).toBe(
      false,
    );
  });

  it("rejects a non-uuid resumeId", () => {
    expect(OptimizeSchema.safeParse({ ...valid, resumeId: "resume-1" }).success).toBe(false);
  });

  it("rejects customCategory beyond the existing enforced limit", () => {
    const tooLong = "x".repeat(CUSTOM_CATEGORY_MAX_LENGTH + 1);
    expect(
      OptimizeSchema.safeParse({ ...valid, category: "other", customCategory: tooLong }).success,
    ).toBe(false);
  });

  it("accepts customCategory right at the limit", () => {
    const atLimit = "x".repeat(CUSTOM_CATEGORY_MAX_LENGTH);
    expect(
      OptimizeSchema.safeParse({ ...valid, category: "other", customCategory: atLimit }).success,
    ).toBe(true);
  });

  it("rejects wrong types for boolean/optional fields", () => {
    expect(OptimizeSchema.safeParse({ ...valid, forceRefresh: "yes" }).success).toBe(false);
  });
});
