import { describe, expect, it } from "vitest";
import { splitCalendarSuggestions } from "./pendingSuggestions";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

function suggestion(overrides: Partial<SuggestionListItem> = {}): SuggestionListItem {
  return {
    id: "sugg-1",
    user_id: "user-1",
    gmail_message_id: null,
    calendar_event_id: "evt-1",
    type: "create_interview",
    status: "pending",
    confidence: 0.8,
    explanation: "test",
    target_application_id: null,
    suggested_payload: {},
    resolved_at: null,
    resolved_action: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    source: "calendar",
    company_name: "Acme",
    subject: null,
    category: null,
    externalMessageId: "",
    threadId: "",
    receivedAt: null,
    fromAddress: null,
    isUnread: false,
    calendarEvent: null,
    ...overrides,
  };
}

describe("splitCalendarSuggestions", () => {
  it("routes a suggestion with existingInterviewId to the attached map, keyed by that interview", () => {
    const item = suggestion({
      id: "sugg-attached",
      suggested_payload: { existingInterviewId: "interview-1" },
    });
    const { attachedByInterviewId, unattached } = splitCalendarSuggestions([item]);
    expect(attachedByInterviewId.get("interview-1")?.id).toBe("sugg-attached");
    expect(unattached).toEqual([]);
  });

  it("routes a suggestion with no existingInterviewId to unattached", () => {
    const item = suggestion({ id: "sugg-new", suggested_payload: { companyName: "Acme" } });
    const { attachedByInterviewId, unattached } = splitCalendarSuggestions([item]);
    expect(attachedByInterviewId.size).toBe(0);
    expect(unattached.map((i) => i.id)).toEqual(["sugg-new"]);
  });

  it("routes a possibleDuplicateOfInterviewId-only suggestion (no confirmed existingInterviewId) to unattached", () => {
    const item = suggestion({
      id: "sugg-maybe-dup",
      suggested_payload: { possibleDuplicateOfInterviewId: "interview-2" },
    });
    const { attachedByInterviewId, unattached } = splitCalendarSuggestions([item]);
    expect(attachedByInterviewId.size).toBe(0);
    expect(unattached.map((i) => i.id)).toEqual(["sugg-maybe-dup"]);
  });

  it("handles a mix of attached and unattached suggestions together", () => {
    const attached = suggestion({
      id: "sugg-a",
      suggested_payload: { existingInterviewId: "interview-1" },
    });
    const unattached1 = suggestion({ id: "sugg-b", suggested_payload: {} });
    const { attachedByInterviewId, unattached } = splitCalendarSuggestions([attached, unattached1]);
    expect(attachedByInterviewId.get("interview-1")?.id).toBe("sugg-a");
    expect(unattached.map((i) => i.id)).toEqual(["sugg-b"]);
  });
});
