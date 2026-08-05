import { describe, it, expect } from "vitest";
import { groupSuggestions } from "./grouping";
import { applyView, applyReadFilter } from "./views";
import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";
import type { GmailMessageCategory, GmailSuggestionType } from "@/features/gmail/types";

let seq = 0;

function item(overrides: Partial<GmailSuggestionListItem> = {}): GmailSuggestionListItem {
  seq += 1;
  const base: GmailSuggestionListItem = {
    id: `s${seq}`,
    user_id: "u1",
    gmail_message_id: `m${seq}`,
    type: "create_application" as GmailSuggestionType,
    status: "pending",
    confidence: 0.8,
    explanation: "because",
    target_application_id: null,
    suggested_payload: {},
    resolved_at: null,
    resolved_action: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    company_name: null,
    subject: null,
    category: "recruiter_reply" as GmailMessageCategory,
    externalMessageId: `ext${seq}`,
    threadId: `t${seq}`,
    receivedAt: "2026-08-01T00:00:00.000Z",
    fromAddress: "someone@acme.com",
    isUnread: true,
  };
  return { ...base, ...overrides };
}

function withSummary(
  overrides: Partial<GmailSuggestionListItem>,
  summary: Record<string, unknown>,
): GmailSuggestionListItem {
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

  it("returns everything for the all view", () => {
    expect(applyView(items, "all")).toHaveLength(4);
  });

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

  it("today keeps only items received today", () => {
    const todayItem = item({ receivedAt: new Date().toISOString() });
    const result = applyView([...items, todayItem], "today");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(todayItem.id);
  });
});

describe("applyReadFilter", () => {
  const mixed = [item({ isUnread: true }), item({ isUnread: true }), item({ isUnread: false })];

  it("unread keeps only unread mail", () => {
    expect(applyReadFilter(mixed, "unread")).toHaveLength(2);
  });

  it("read keeps only already-read mail", () => {
    expect(applyReadFilter(mixed, "read")).toHaveLength(1);
  });

  it("all restores everything — nothing is lost by having read it in Gmail", () => {
    // The guarantee behind making this a VIEW filter rather than a sync
    // filter: every stored recruiter email is always reachable.
    expect(applyReadFilter(mixed, "all")).toHaveLength(3);
  });

  it("composes with a category view without either filter swallowing the other", () => {
    const set = [
      item({ category: "interview_invitation", isUnread: true }),
      item({ category: "interview_invitation", isUnread: false }),
      item({ category: "offer", isUnread: true }),
    ];
    const result = applyReadFilter(applyView(set, "interview"), "unread");
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("interview_invitation");
    expect(result[0].isUnread).toBe(true);
  });
});
