import { describe, expect, it } from "vitest";
import { matchApplication } from "./ApplicationMatcher";
import type { ServerSupabase } from "@/server/supabase";

// ── Hand-written fake Supabase client for ApplicationMatcher tests ──
//
// Mirrors src/server/ai/testing/fakeSupabase.ts's philosophy (hand-written,
// not a mocking library) but needs real filter/order semantics, since
// matchApplication reads the SAME `applications` table two different ways
// (a single row by id for thread continuity, a filtered list for the
// company-name scan) — a fake that ignores filters couldn't tell those apart
// correctly.

type Row = Record<string, unknown>;

function makeChain(sourceRows: Row[]) {
  let rows = sourceRows;
  const chain = {
    eq(column: string, value: unknown) {
      rows = rows.filter((r) => r[column] === value);
      return chain;
    },
    ilike(column: string, value: unknown) {
      const needle = String(value).toLowerCase();
      rows = rows.filter((r) => String(r[column] ?? "").toLowerCase() === needle);
      return chain;
    },
    not(column: string) {
      rows = rows.filter((r) => r[column] != null);
      return chain;
    },
    order() {
      return chain;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then(resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

function fakeSupabase(data: {
  gmailMessages?: Row[];
  applications?: Row[];
  contacts?: Row[];
}): ServerSupabase {
  const tables: Record<string, Row[]> = {
    gmail_messages: data.gmailMessages ?? [],
    applications: data.applications ?? [],
    application_contacts: data.contacts ?? [],
  };
  return {
    from(table: string) {
      return { select: () => makeChain(tables[table] ?? []) };
    },
  } as unknown as ServerSupabase;
}

const userId = "user-1";

describe("matchApplication", () => {
  it("returns none when no signal matches", async () => {
    const sb = fakeSupabase({
      applications: [
        { id: "app-1", user_id: userId, company_name: "Other Co", role: "PM", archived: false },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "recruiter@nowhere.com",
      companyName: "Nonexistent Corp",
      gmailThreadId: "thread-1",
      subject: "Hello",
    });
    expect(result.kind).toBe("none");
  });

  it("matches via thread continuity when the linked application's role doesn't conflict", async () => {
    const sb = fakeSupabase({
      gmailMessages: [
        { user_id: userId, gmail_thread_id: "thread-1", matched_application_id: "app-1" },
      ],
      applications: [{ id: "app-1", company_name: "Acme", role: "Software Engineer" }],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "recruiter@acme.com",
      companyName: null,
      gmailThreadId: "thread-1",
      subject: "Following up on your Software Engineer interview",
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-1" });
  });

  it("skips the thread-continuity signal when the subject names a clearly different role", async () => {
    const sb = fakeSupabase({
      gmailMessages: [
        { user_id: userId, gmail_thread_id: "thread-1", matched_application_id: "app-1" },
      ],
      applications: [{ id: "app-1", company_name: "Acme", role: "Software Engineer" }],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "recruiter@acme.com",
      companyName: null,
      gmailThreadId: "thread-1",
      subject: "We also have a Product Manager opening for you",
    });
    // Thread signal demoted; no company/contact signal supplied either.
    expect(result.kind).toBe("none");
  });

  it("matches via an exact recruiter contact email", async () => {
    const sb = fakeSupabase({
      contacts: [{ application_id: "app-2", user_id: userId, email: "jane@acme.com" }],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "jane@acme.com",
      companyName: null,
      gmailThreadId: "thread-2",
      subject: "Quick question",
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-2" });
  });

  it("matches via normalized company name", async () => {
    const sb = fakeSupabase({
      applications: [
        {
          id: "app-3",
          user_id: userId,
          company_name: "Acme Inc.",
          role: "Analyst",
          archived: false,
        },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "hr@acme.com",
      companyName: "Acme, Inc",
      gmailThreadId: "thread-3",
      subject: "Application update",
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-3" });
  });

  it("returns ambiguous when the company name matches more than one application", async () => {
    const sb = fakeSupabase({
      applications: [
        {
          id: "app-4",
          user_id: userId,
          company_name: "Acme",
          role: "Backend Engineer",
          archived: false,
        },
        {
          id: "app-5",
          user_id: userId,
          company_name: "Acme",
          role: "Frontend Engineer",
          archived: false,
        },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "hr@acme.com",
      companyName: "Acme",
      gmailThreadId: "thread-4",
      subject: "Update",
    });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidateApplicationIds.sort()).toEqual(["app-4", "app-5"]);
    }
  });

  it("does not double-count when contact email and company name both point to the same application", async () => {
    const sb = fakeSupabase({
      contacts: [{ application_id: "app-6", user_id: userId, email: "jane@acme.com" }],
      applications: [
        {
          id: "app-6",
          user_id: userId,
          company_name: "Acme",
          role: "Designer",
          archived: false,
        },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "jane@acme.com",
      companyName: "Acme",
      gmailThreadId: "thread-6",
      subject: "Update",
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-6" });
  });
});
