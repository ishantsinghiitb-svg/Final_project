import { describe, expect, it } from "vitest";
import { z } from "zod";
import { accessToken, freeText, uuid, validate } from "./validation";

// ── Shared server-function validation (Module 13 · Phase 2 · A3) ──
//
// `validate()` is what every `.validator()` across src/server-functions now
// calls instead of the old `(data) => data` type-only cast. These tests pin
// its two jobs: real rejection of malformed input, and a clean single-issue
// message (not the framework's default `JSON.stringify(issues)` dump) so a
// validation failure never reads like a stack trace.

describe("validate", () => {
  const schema = z.object({ id: uuid, count: z.number().int().min(0) });

  it("returns the parsed data on success", () => {
    const input = { id: "123e4567-e89b-12d3-a456-426614174000", count: 3 };
    expect(validate(schema, input)).toEqual(input);
  });

  it("throws a plain Error (not a ZodError) with a single-issue message", () => {
    let caught: unknown;
    try {
      validate(schema, { id: "not-a-uuid", count: 3 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toContain("ZodError");
    // A field path + a human message — not a JSON dump of every issue.
    expect(message).toMatch(/^Invalid id:/);
    expect(message).not.toContain("{");
  });

  it("rejects a completely missing required field", () => {
    expect(() => validate(schema, { count: 1 })).toThrow(/id/);
  });

  it("rejects the wrong type for a field", () => {
    expect(() =>
      validate(schema, { id: "123e4567-e89b-12d3-a456-426614174000", count: "three" }),
    ).toThrow(/count/);
  });

  it("rejects a malformed object entirely (null, array, primitive)", () => {
    expect(() => validate(schema, null)).toThrow();
    expect(() => validate(schema, [])).toThrow();
    expect(() => validate(schema, "just a string")).toThrow();
  });
});

describe("accessToken", () => {
  it("accepts a non-empty string", () => {
    expect(accessToken.safeParse("a.jwt.token").success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(accessToken.safeParse("").success).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(accessToken.safeParse(12345).success).toBe(false);
  });
});

describe("uuid", () => {
  it("accepts a well-formed uuid", () => {
    expect(uuid.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(true);
  });

  it("rejects a non-uuid string (e.g. an attempted SQL/path injection payload)", () => {
    expect(uuid.safeParse("'; DROP TABLE resumes; --").success).toBe(false);
    expect(uuid.safeParse("../../etc/passwd").success).toBe(false);
    expect(uuid.safeParse("not-a-uuid-at-all").success).toBe(false);
  });
});

describe("freeText", () => {
  it("accepts a string within the limit, required by default", () => {
    const schema = freeText(10);
    expect(schema.safeParse("hello").success).toBe(true);
  });

  it("rejects a string over the limit", () => {
    const schema = freeText(10);
    expect(schema.safeParse("this is way too long").success).toBe(false);
  });

  it("is optional when requested, and still enforces the limit when present", () => {
    const schema = freeText(10, { optional: true });
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse("short").success).toBe(true);
    expect(schema.safeParse("this is way too long").success).toBe(false);
  });
});
