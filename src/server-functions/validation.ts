import { z, type ZodSchema } from "zod";

// ── Runtime input validation for server functions (Module 13 · Phase 2 · A3) ──
//
// `createServerFn().validator(...)` previously took `(data: SomeType) => data`
// — a compile-time-only cast with zero runtime effect (see the audit this
// closes). This helper is what every server function's `.validator()` now
// calls instead: a real `schema.safeParse`, so a malformed/oversized/wrong-
// shaped request is rejected BEFORE the handler runs (before any AI call,
// DB query, or credit charge).
//
// Deliberately a single-issue message, not the full Zod issue array (which
// `JSON.stringify`s every failing path by default) — enough for a user or
// client dev to see what's wrong with a field, without dumping the schema's
// internal shape or a stack trace back over the wire.
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `Invalid ${path}: ${issue.message}` : issue.message);
  }
  return result.data;
}

// ── Shared field schemas ──
// Every server function takes the caller's Supabase access token; most take
// one or more DB-row ids. Centralized so every file constrains them the same
// way instead of redeclaring slightly different rules.
export const accessToken = z.string().min(1, "Access token is required.");
export const uuid = z.string().uuid("Must be a valid id.");

/** A free-text field bound to a sane max length before it can reach a prompt/DB column. */
export function freeText(maxLength: number, opts: { optional?: boolean } = {}) {
  const base = z.string().max(maxLength, `Must be ${maxLength} characters or fewer.`);
  return opts.optional ? base.optional() : base;
}
