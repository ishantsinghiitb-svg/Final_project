import { describe, expect, it } from "vitest";
import { AccessTokenOnlySchema, SearchAdminUsersSchema } from "./admin";

// ── Admin Platform server function validators (Module 13 · Phase 5) ──
//
// Matches this directory's established convention (see coverLetter.test.ts,
// mockInterview.test.ts): only the exported Zod schemas are unit-tested here.
// The `createServerFn`-wrapped handlers themselves can't be invoked outside
// the real TanStack Start server runtime (`getStartContext` throws "No Start
// context found in AsyncLocalStorage" in a plain vitest environment) — every
// other file in this directory hits the same constraint and stops at schema
// coverage for that reason. The gate each handler applies (`requireAdmin`
// first, non-admin gets `isAdmin: false`/a thrown error, never a data query)
// is exercised directly in adminAuth.test.ts and is the same 2-3 line
// try/catch(AdminAccessError) shape already used untested in
// src/server-functions/jobIntelligence.ts's admin endpoints.

describe("AccessTokenOnlySchema", () => {
  it("accepts a valid access token", () => {
    expect(AccessTokenOnlySchema.safeParse({ accessToken: "token" }).success).toBe(true);
  });

  it("rejects a missing access token", () => {
    expect(AccessTokenOnlySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty access token", () => {
    expect(AccessTokenOnlySchema.safeParse({ accessToken: "" }).success).toBe(false);
  });
});

describe("SearchAdminUsersSchema", () => {
  it("accepts a valid token with a query", () => {
    const result = SearchAdminUsersSchema.safeParse({ accessToken: "token", query: "jane" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid token without a query", () => {
    expect(SearchAdminUsersSchema.safeParse({ accessToken: "token" }).success).toBe(true);
  });

  it("rejects a query beyond the enforced length limit", () => {
    const result = SearchAdminUsersSchema.safeParse({
      accessToken: "token",
      query: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing access token even with a valid query", () => {
    const result = SearchAdminUsersSchema.safeParse({ query: "jane" });
    expect(result.success).toBe(false);
  });
});
