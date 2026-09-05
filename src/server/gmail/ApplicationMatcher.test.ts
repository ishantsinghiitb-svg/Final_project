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

function fakeSupabase(
  data: {
    gmailMessages?: Row[];
    applications?: Row[];
    contacts?: Row[];
  },
  callLog?: Record<string, number>,
): ServerSupabase {
  const tables: Record<string, Row[]> = {
    gmail_messages: data.gmailMessages ?? [],
    applications: data.applications ?? [],
    application_contacts: data.contacts ?? [],
  };
  return {
    from(table: string) {
      if (callLog) callLog[table] = (callLog[table] ?? 0) + 1;
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

  // ── Module 9B signals ──────────────────────────────────────────────────

  it("matches via iCalUID when a calendar event's UID matches an already-matched interview email", async () => {
    const sb = fakeSupabase({
      gmailMessages: [
        {
          user_id: userId,
          ical_uid: "abc123@google.com",
          matched_application_id: "app-7",
        },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "organizer@acme.com",
      companyName: null,
      gmailThreadId: "",
      subject: "Interview",
      icalUid: "abc123@google.com",
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-7" });
  });

  it("does not match on iCalUID when no email carries that UID", async () => {
    const sb = fakeSupabase({});
    const result = await matchApplication(sb, userId, {
      fromAddress: "organizer@acme.com",
      companyName: null,
      gmailThreadId: "",
      subject: "Interview",
      icalUid: "unknown-uid@google.com",
    });
    expect(result.kind).toBe("none");
  });

  it("matches an attendee's email domain against a recruiter contact's domain, at lower confidence than an exact email match", async () => {
    const sb = fakeSupabase({
      contacts: [{ application_id: "app-8", user_id: userId, email: "jane@acme.com" }],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "someone-else@acme.com",
      companyName: null,
      gmailThreadId: "",
      subject: "Interview",
      attendeeEmails: ["another-person@acme.com"],
    });
    expect(result).toMatchObject({ kind: "single", applicationId: "app-8" });
  });

  it("skips thread continuity entirely for a calendar event (empty gmailThreadId)", async () => {
    const sb = fakeSupabase({
      gmailMessages: [{ user_id: userId, gmail_thread_id: "", matched_application_id: "app-9" }],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "nobody@nowhere.com",
      companyName: null,
      gmailThreadId: "",
      subject: "Interview",
    });
    // Would incorrectly match via signal 1 if empty-string thread ids weren't
    // explicitly skipped for calendar-sourced calls.
    expect(result.kind).toBe("none");
  });

  it("still finds the ambiguous/union result across a mix of Gmail and Calendar signals", async () => {
    const sb = fakeSupabase({
      contacts: [{ application_id: "app-10", user_id: userId, email: "jane@acme.com" }],
      applications: [
        { id: "app-11", user_id: userId, company_name: "Acme", role: "PM", archived: false },
      ],
    });
    const result = await matchApplication(sb, userId, {
      fromAddress: "jane@acme.com",
      companyName: "Acme",
      gmailThreadId: "",
      subject: "Interview",
      attendeeEmails: [],
    });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidateApplicationIds.sort()).toEqual(["app-10", "app-11"]);
    }
  });
});

// ── `prefetched` — GmailSyncService's per-invocation hoisting (subrequest
// exhaustion fix). The old per-message loop re-fetched application_contacts
// and applications (Signals 2/3/4) on EVERY iteration — identical rows every
// time, since they don't depend on which message is being matched. These
// tests assert the hoisted path skips those two queries entirely, not just
// that the match result happens to come out the same.
describe("matchApplication — prefetched rows", () => {
  it("does not query application_contacts or applications when prefetched rows are supplied", async () => {
    const callLog: Record<string, number> = {};
    const sb = fakeSupabase({}, callLog);

    await matchApplication(
      sb,
      userId,
      {
        fromAddress: "jane@acme.com",
        companyName: "Acme",
        gmailThreadId: "", // no thread hit — Signal 1's own per-message applications-by-id lookup never fires, isolating Signal 3's hoisting
        subject: "Interview",
      },
      {
        applications: [{ id: "app-1", company_name: "Acme", role: "PM" }],
        contacts: [{ application_id: "app-2", email: "jane@acme.com" }],
      },
    );

    expect(callLog.application_contacts).toBeUndefined();
    expect(callLog.applications).toBeUndefined();
  });

  it("produces the identical match using prefetched rows as it would fetching them live", async () => {
    const applications = [
      { id: "app-1", user_id: userId, company_name: "Acme", role: "PM", archived: false },
    ];
    const contacts = [{ application_id: "app-2", user_id: userId, email: "jane@acme.com" }];

    const live = await matchApplication(fakeSupabase({ applications, contacts }), userId, {
      fromAddress: "jane@acme.com",
      companyName: "Acme",
      gmailThreadId: "",
      subject: "Interview",
    });

    const prefetchedResult = await matchApplication(
      fakeSupabase({}),
      userId,
      {
        fromAddress: "jane@acme.com",
        companyName: "Acme",
        gmailThreadId: "",
        subject: "Interview",
      },
      {
        applications: [{ id: "app-1", company_name: "Acme", role: "PM" }],
        contacts: [{ application_id: "app-2", email: "jane@acme.com" }],
      },
    );

    expect(prefetchedResult).toEqual(live);
    expect(prefetchedResult.kind).toBe("ambiguous"); // both signals hit, on distinct applications — sanity that this scenario actually exercises both
  });

  it("Signal 1's thread-continuity lookup is untouched — still a live per-message query even when prefetched is supplied", async () => {
    const callLog: Record<string, number> = {};
    const sb = fakeSupabase(
      {
        gmailMessages: [
          { user_id: userId, gmail_thread_id: "thread-1", matched_application_id: "app-1" },
        ],
        applications: [{ id: "app-1", company_name: "Acme", role: "Software Engineer" }],
      },
      callLog,
    );

    const result = await matchApplication(
      sb,
      userId,
      {
        fromAddress: "recruiter@acme.com",
        companyName: null,
        gmailThreadId: "thread-1",
        subject: "Following up on your Software Engineer interview",
      },
      { applications: [], contacts: [] }, // prefetched rows deliberately empty/wrong — must not affect Signal 1
    );

    expect(result).toMatchObject({ kind: "single", applicationId: "app-1" });
    // Signal 1's OWN by-id lookup still ran (once) — prefetched only
    // replaces Signals 2/3/4's per-user queries, never this one.
    expect(callLog.applications).toBe(1);
  });

  it("without prefetched, falls back to the exact same live-fetch behavior as before (backward compatibility for CalendarSyncService/CalendarRescan/SuggestionRebuilder)", async () => {
    const callLog: Record<string, number> = {};
    const sb = fakeSupabase(
      {
        applications: [
          { id: "app-1", user_id: userId, company_name: "Acme", role: "PM", archived: false },
        ],
      },
      callLog,
    );

    const result = await matchApplication(sb, userId, {
      fromAddress: "recruiter@nowhere.com",
      companyName: "Acme",
      gmailThreadId: "",
      subject: "Hello",
    });

    expect(result).toMatchObject({ kind: "single", applicationId: "app-1" });
    expect(callLog.applications).toBeGreaterThan(0);
  });
});
