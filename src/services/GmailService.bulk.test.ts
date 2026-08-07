import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Bulk accept/dismiss isolation (Module 9A) ──
//
// Regression cover for a structural bug in the bulk path: resolveSuggestion
// called repository methods OUTSIDE its own try/catch (the lookup, and the
// entire dismiss branch), both of which throw on error. resolveSuggestions
// awaited it without a guard, so one failing item threw straight out of the
// loop — every remaining selected suggestion was silently abandoned and the
// promise rejected with nothing shown to the user. "Select all → Dismiss
// Selected" therefore stopped at the first problem row.
//
// These tests assert the contract that prevents it: every item is attempted,
// and the result array always has one entry per input id.

const findSuggestionById = vi.fn();
const updateSuggestionResolution = vi.fn();
const createManual = vi.fn();
const updateStatus = vi.fn();

vi.mock("@/repositories/SuggestionRepository", () => ({
  SuggestionRepository: class {
    findSuggestionById = findSuggestionById;
    updateSuggestionResolution = updateSuggestionResolution;
  },
}));

vi.mock("@/services/ApplicationService", () => ({
  applicationService: {
    createManual: (...args: unknown[]) => createManual(...args),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
  },
}));
vi.mock("@/services/InterviewService", () => ({ interviewService: {} }));
vi.mock("@/services/ReminderService", () => ({ reminderService: {} }));
vi.mock("@/services/AttachmentService", () => ({ attachmentService: {} }));
vi.mock("@/server-functions/gmail", () => ({ fetchGmailAttachmentBytes: vi.fn() }));

const { gmailService } = await import("@/services/GmailService");

const USER = "user-1";

function pendingSuggestion(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER,
    gmail_message_id: `m-${id}`,
    type: "create_application",
    status: "pending",
    confidence: 0.8,
    explanation: "why",
    target_application_id: null,
    suggested_payload: { companyName: "Groww", role: "SDE Intern" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSuggestionResolution.mockResolvedValue({});
  createManual.mockImplementation(() => Promise.resolve({ id: `app-${Math.random()}` }));
  updateStatus.mockResolvedValue({});
});

describe("resolveSuggestions — per-item isolation", () => {
  it("dismisses every id even when one throws mid-batch", async () => {
    findSuggestionById.mockImplementation((id: string) => Promise.resolve(pendingSuggestion(id)));
    // The middle one fails at the DB layer, the way a transient error would.
    updateSuggestionResolution.mockImplementation((id: string) =>
      id === "b" ? Promise.reject(new Error("network down")) : Promise.resolve({}),
    );

    const results = await gmailService.resolveSuggestions(USER, ["a", "b", "c"], "dismiss", "tok");

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    // The item AFTER the failure must still have been attempted — this is
    // exactly what the old code skipped.
    expect(updateSuggestionResolution).toHaveBeenCalledTimes(3);
  });

  it("keeps going when the suggestion lookup itself throws", async () => {
    findSuggestionById.mockImplementation((id: string) =>
      id === "a"
        ? Promise.reject(new Error("lookup failed"))
        : Promise.resolve(pendingSuggestion(id)),
    );

    const results = await gmailService.resolveSuggestions(USER, ["a", "b"], "dismiss", "tok");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ok: false });
    expect(results[1]).toMatchObject({ ok: true });
  });

  it("never rejects — always resolves with one result per id", async () => {
    findSuggestionById.mockRejectedValue(new Error("everything is broken"));

    const results = await gmailService.resolveSuggestions(USER, ["a", "b", "c"], "accept", "tok");

    expect(results).toHaveLength(3);
    expect(results.every((r) => !r.ok)).toBe(true);
  });

  it("reports already-resolved rows without aborting the batch", async () => {
    findSuggestionById.mockImplementation((id: string) =>
      Promise.resolve(pendingSuggestion(id, { status: id === "b" ? "accepted" : "pending" })),
    );

    const results = await gmailService.resolveSuggestions(USER, ["a", "b", "c"], "dismiss", "tok");

    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].message).toMatch(/already been resolved/i);
  });
});

describe("resolveSuggestions — accept creates one application per opportunity", () => {
  it("does not create a duplicate application for the same company and role", async () => {
    findSuggestionById.mockImplementation((id: string) => Promise.resolve(pendingSuggestion(id)));

    const results = await gmailService.resolveSuggestions(USER, ["a", "b", "c"], "accept", "tok");

    expect(results.every((r) => r.ok)).toBe(true);
    // Three suggestions about one opportunity must yield ONE application.
    expect(createManual).toHaveBeenCalledTimes(1);
  });

  it("still creates separate applications for genuinely different roles", async () => {
    findSuggestionById.mockImplementation((id: string) =>
      Promise.resolve(
        pendingSuggestion(id, {
          suggested_payload: {
            companyName: "Groww",
            role: id === "a" ? "SDE Intern" : "Product Analyst",
          },
        }),
      ),
    );

    await gmailService.resolveSuggestions(USER, ["a", "b"], "accept", "tok");

    expect(createManual).toHaveBeenCalledTimes(2);
  });

  it("isolates a single unacceptable item without losing the rest", async () => {
    findSuggestionById.mockImplementation((id: string) =>
      Promise.resolve(
        // The middle suggestion has no company, which accept legitimately
        // refuses — the others must still go through.
        pendingSuggestion(id, id === "b" ? { suggested_payload: { role: "SDE" } } : {}),
      ),
    );

    const results = await gmailService.resolveSuggestions(USER, ["a", "b", "c"], "accept", "tok");

    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].message).toMatch(/company name is required/i);
  });
});
