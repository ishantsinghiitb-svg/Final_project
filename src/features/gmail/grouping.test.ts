import { describe, it, expect } from "vitest";
import { groupSuggestions } from "./grouping";
import { applyView, splitByReadState } from "./views";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";
import type { GmailMessageCategory, SuggestionType } from "@/features/gmail/types";

let seq = 0;

function item(overrides: Partial<SuggestionListItem> = {}): SuggestionListItem {
  seq += 1;
  const base: SuggestionListItem = {
    id: `s${seq}`,
    user_id: "u1",
    gmail_message_id: `m${seq}`,
    calendar_event_id: null,
    type: "create_application" as SuggestionType,
    status: "pending",
    confidence: 0.8,
    explanation: "because",
    target_application_id: null,
    suggested_payload: {},
    resolved_at: null,
    resolved_action: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    source: "gmail",
    company_name: null,
    subject: null,
    category: "recruiter_reply" as GmailMessageCategory,
    externalMessageId: `ext${seq}`,
    threadId: `t${seq}`,
    receivedAt: "2026-08-01T00:00:00.000Z",
    fromAddress: "someone@acme.com",
    isUnread: true,
    calendarEvent: null,
  };
  return { ...base, ...overrides };
}

function withSummary(
  overrides: Partial<SuggestionListItem>,
  summary: Record<string, unknown>,
): SuggestionListItem {
  return item({
    ...overrides,
    suggested_payload: { summary: { headline: "Recruiter Reply", reason: "r", ...summary } },
  });
}

describe("groupSuggestions", () => {
  it("groups everything linked to the same application into one card", () => {
    const groups = groupSuggestions([
      item({ target_application_id: "app-1", threadId: "tA" }),
      item({ target_application_id: "app-1", threadId: "tB" }),
      item({ target_application_id: "app-2", threadId: "tC" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.key === "app:app-1")?.items).toHaveLength(2);
  });

  it("groups by company + role when nothing is linked yet", () => {
    const groups = groupSuggestions([
      withSummary(
        { company_name: "Jar", threadId: "t1" },
        { company: "Jar", role: "Product Intern" },
      ),
      withSummary(
        { company_name: "Jar", threadId: "t2" },
        { company: "Jar", role: "Product Intern" },
      ),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it("keeps two different roles at the same company apart", () => {
    const groups = groupSuggestions([
      withSummary({ company_name: "Jar" }, { company: "Jar", role: "Product Intern" }),
      withSummary({ company_name: "Jar" }, { company: "Jar", role: "Backend Engineer" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("falls back to the Gmail thread when entities are unknown", () => {
    const groups = groupSuggestions([
      item({ threadId: "shared" }),
      item({ threadId: "shared" }),
      item({ threadId: "other" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("builds one timeline entry per email, not per suggestion", () => {
    // An assessment invite yields a status update AND a deadline reminder —
    // one event, two suggestions.
    const groups = groupSuggestions([
      item({
        target_application_id: "app-1",
        gmail_message_id: "same",
        type: "update_application",
      }),
      item({ target_application_id: "app-1", gmail_message_id: "same", type: "add_reminder" }),
    ]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].timeline).toHaveLength(1);
  });

  it("orders groups by most recent activity", () => {
    const groups = groupSuggestions([
      item({ target_application_id: "old", receivedAt: "2026-07-01T00:00:00.000Z" }),
      item({ target_application_id: "new", receivedAt: "2026-08-03T00:00:00.000Z" }),
    ]);
    expect(groups[0].key).toBe("app:new");
  });

  it("counts only pending suggestions as actions", () => {
    const groups = groupSuggestions([
      item({ target_application_id: "app-1", status: "pending" }),
      item({ target_application_id: "app-1", status: "accepted" }),
    ]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].pending).toHaveLength(1);
  });
});

describe("applyView", () => {
  const items = [
    item({ category: "interview_invitation" }),
    item({ category: "online_assessment" }),
    item({ category: "offer" }),
    item({ category: "rejection", status: "accepted" }),
  ];

  it("filters to a single category", () => {
    expect(applyView(items, "interview")).toHaveLength(1);
    expect(applyView(items, "offer")).toHaveLength(1);
  });

  it("groups assessments and assignments together", () => {
    const withAssignment = [...items, item({ category: "assignment" })];
    expect(applyView(withAssignment, "assessment")).toHaveLength(2);
  });

  it("needs_action keeps only pending items", () => {
    expect(applyView(items, "needs_action")).toHaveLength(3);
  });
});

describe("splitByReadState", () => {
  const mixed = [item({ isUnread: true }), item({ isUnread: true }), item({ isUnread: false })];

  it("routes unread mail to the Unread section and the rest to Read", () => {
    const { unread, read } = splitByReadState(mixed);
    expect(unread).toHaveLength(2);
    expect(read).toHaveLength(1);
  });

  it("never drops anything — every row lands in exactly one of the two sections", () => {
    // The guarantee behind splitting rather than filtering: read mail used
    // to be hidden AND uncounted behind an on-by-default Unread toggle, so
    // a working inbox could look empty. Both halves are always accounted for.
    const { unread, read } = splitByReadState(mixed);
    expect(unread.length + read.length).toBe(mixed.length);
  });

  it("composes with a category view, splitting only what that view admits", () => {
    const set = [
      item({ category: "interview_invitation", isUnread: true }),
      item({ category: "interview_invitation", isUnread: false }),
      item({ category: "offer", isUnread: true }),
    ];
    const { unread, read } = splitByReadState(applyView(set, "interview"));
    expect(unread).toHaveLength(1);
    expect(read).toHaveLength(1);
    expect(unread[0].category).toBe("interview_invitation");
  });
});
