import { describe, expect, it } from "vitest";
import { combinedSyncOutcomeMessage, syncOutcomeMessage } from "./syncOutcome";

// ── Combined sync toast tests (P1-2) ──
//
// THE RULE THIS FILE EXISTS FOR: if either connected product did not actually
// sync, the combined toast can never be `tone: "success"`.
//
// It used to be. `skipped` outcomes other than `needs_reauth` fell straight
// through to the success paths, so a healthy Calendar's counters spoke for a
// Gmail that had been skipped — a sync wedged on `already_syncing` produced a
// green "Synced — no new calendar events found." and stayed invisible. Two
// products, one toast, and the good news won.
//
// Pure function, no mocking: the whole matrix is cheap to assert exactly.

// The parameter type is `SyncResultLike | null` (null = that product isn't
// connected). `Result` is the non-null half, so "not connected" stays an
// explicit `null` at each call site rather than hiding inside the alias.
type Result = NonNullable<Parameters<typeof combinedSyncOutcomeMessage>[0]>;

// Gmail's two-counter shape.
const GMAIL_SYNCED: Result = { status: "synced", processed: 12, suggestionsCreated: 0 };
const GMAIL_SYNCED_NEW: Result = { status: "synced", processed: 12, suggestionsCreated: 2 };
const GMAIL_ERROR: Result = { status: "error", message: "Gmail API 500" };
const GMAIL_ALREADY_SYNCING: Result = { status: "skipped", reason: "already_syncing" };
const GMAIL_NOT_CONNECTED: Result = { status: "skipped", reason: "not_connected" };
const GMAIL_NEEDS_REAUTH: Result = { status: "skipped", reason: "needs_reauth" };

// Calendar's three-counter shape.
const CAL_SYNCED: Result = {
  status: "synced",
  eventsProcessed: 0,
  relevantEventsStored: 0,
  suggestionsCreated: 0,
};
const CAL_SYNCED_NEW: Result = {
  status: "synced",
  eventsProcessed: 5,
  relevantEventsStored: 3,
  suggestionsCreated: 3,
};
const CAL_ERROR: Result = { status: "error", message: "Calendar API 403" };
const CAL_ALREADY_SYNCING: Result = { status: "skipped", reason: "already_syncing" };
const CAL_NEEDS_REAUTH: Result = { status: "skipped", reason: "needs_reauth" };

const REAUTH_MESSAGE = "Access was revoked for one of your Google connections — please reconnect.";
const ALREADY_SYNCING_MESSAGE =
  "A sync was already running, so this one was skipped. Try again in a few minutes.";
const DIDNT_SYNC_MESSAGE = "One of your Google connections didn't sync. Please try again.";

type Case = {
  name: string;
  gmail: Result;
  calendar: Result;
  tone: "success" | "error";
  message: string;
};

const CASES: Case[] = [
  // ── Both ran cleanly — unchanged behaviour ──
  {
    name: "Gmail success + Calendar success, nothing new",
    gmail: GMAIL_SYNCED,
    calendar: CAL_SYNCED,
    tone: "success",
    message: "Synced 12 emails — nothing new to review.",
  },
  {
    name: "Gmail success with new suggestions + Calendar success",
    gmail: GMAIL_SYNCED_NEW,
    calendar: CAL_SYNCED,
    tone: "success",
    message: "Synced — 2 new updates to review.",
  },
  {
    name: "both produced new suggestions — counts are summed",
    gmail: GMAIL_SYNCED_NEW,
    calendar: CAL_SYNCED_NEW,
    tone: "success",
    message: "Synced — 5 new updates to review.",
  },
  {
    name: "a single new suggestion is singular",
    gmail: { status: "synced", processed: 3, suggestionsCreated: 1 },
    calendar: CAL_SYNCED,
    tone: "success",
    message: "Synced — 1 new update to review.",
  },

  // ── Hard errors win, from either side ──
  {
    name: "Gmail error + Calendar success",
    gmail: GMAIL_ERROR,
    calendar: CAL_SYNCED,
    tone: "error",
    message: "Gmail API 500",
  },
  {
    name: "Gmail success + Calendar error",
    gmail: GMAIL_SYNCED,
    calendar: CAL_ERROR,
    tone: "error",
    message: "Calendar API 403",
  },
  {
    name: "Calendar error outranks Gmail's new suggestions",
    gmail: GMAIL_SYNCED_NEW,
    calendar: CAL_ERROR,
    tone: "error",
    message: "Calendar API 403",
  },
  {
    name: "both errored — the first product's message is surfaced",
    gmail: GMAIL_ERROR,
    calendar: CAL_ERROR,
    tone: "error",
    message: "Gmail API 500",
  },

  // ── Revoked access, from either side ──
  {
    name: "Gmail needs_reauth + Calendar success",
    gmail: GMAIL_NEEDS_REAUTH,
    calendar: CAL_SYNCED,
    tone: "error",
    message: REAUTH_MESSAGE,
  },
  {
    name: "Gmail success + Calendar needs_reauth",
    gmail: GMAIL_SYNCED,
    calendar: CAL_NEEDS_REAUTH,
    tone: "error",
    message: REAUTH_MESSAGE,
  },
  {
    name: "an error still outranks a revoked connection",
    gmail: GMAIL_ERROR,
    calendar: CAL_NEEDS_REAUTH,
    tone: "error",
    message: "Gmail API 500",
  },

  // ── The P1-2 regressions: a skip must never read as success ──
  {
    name: "Gmail skipped (already syncing) + Calendar success",
    gmail: GMAIL_ALREADY_SYNCING,
    calendar: CAL_SYNCED,
    tone: "error",
    message: ALREADY_SYNCING_MESSAGE,
  },
  {
    name: "Gmail skipped + Calendar found new suggestions — good news must not mask it",
    gmail: GMAIL_ALREADY_SYNCING,
    calendar: CAL_SYNCED_NEW,
    tone: "error",
    message: ALREADY_SYNCING_MESSAGE,
  },
  {
    name: "Gmail success + Calendar skipped (already syncing)",
    gmail: GMAIL_SYNCED,
    calendar: CAL_ALREADY_SYNCING,
    tone: "error",
    message: ALREADY_SYNCING_MESSAGE,
  },
  {
    name: "both skipped",
    gmail: GMAIL_ALREADY_SYNCING,
    calendar: CAL_ALREADY_SYNCING,
    tone: "error",
    message: ALREADY_SYNCING_MESSAGE,
  },
  {
    name: "a skip for any other reason still reads as a failure",
    gmail: GMAIL_NOT_CONNECTED,
    calendar: CAL_SYNCED,
    tone: "error",
    message: DIDNT_SYNC_MESSAGE,
  },
  {
    name: "needs_reauth keeps its own message rather than the generic skip copy",
    gmail: GMAIL_NEEDS_REAUTH,
    calendar: CAL_ALREADY_SYNCING,
    tone: "error",
    message: REAUTH_MESSAGE,
  },
];

describe("combinedSyncOutcomeMessage", () => {
  it.each(CASES)("$name", ({ gmail, calendar, tone, message }) => {
    expect(combinedSyncOutcomeMessage(gmail, calendar)).toEqual({ tone, message });
  });
});

describe("combinedSyncOutcomeMessage with only one product connected", () => {
  it("reports a lone Gmail success", () => {
    expect(combinedSyncOutcomeMessage(GMAIL_SYNCED_NEW, null)).toEqual({
      tone: "success",
      message: "Synced — 2 new updates to review.",
    });
  });

  it("reports a lone Calendar success", () => {
    expect(combinedSyncOutcomeMessage(null, CAL_SYNCED)).toEqual({
      tone: "success",
      message: "Synced — no new calendar events found.",
    });
  });

  it("reports a lone Gmail error", () => {
    expect(combinedSyncOutcomeMessage(GMAIL_ERROR, null)).toEqual({
      tone: "error",
      message: "Gmail API 500",
    });
  });

  it("reports a lone Gmail skip as a failure, not a success", () => {
    expect(combinedSyncOutcomeMessage(GMAIL_ALREADY_SYNCING, null)).toEqual({
      tone: "error",
      message: ALREADY_SYNCING_MESSAGE,
    });
  });

  it("never claims success when nothing ran at all", () => {
    expect(combinedSyncOutcomeMessage(null, null)).toEqual({
      tone: "error",
      message: "Sync didn't run.",
    });
  });
});

// ── The invariant ──
//
// Asserted as a property over the whole cross product rather than case by
// case, so a NEW skip reason added to SyncOutcome later cannot quietly land
// back on the success path just because nobody remembered to add a row to
// the table above.
describe("invariant: a product that did not sync can never produce a success toast", () => {
  const GMAIL_OUTCOMES: [string, Result][] = [
    ["synced", GMAIL_SYNCED],
    ["synced with new", GMAIL_SYNCED_NEW],
    ["error", GMAIL_ERROR],
    ["skipped already_syncing", GMAIL_ALREADY_SYNCING],
    ["skipped not_connected", GMAIL_NOT_CONNECTED],
    ["skipped needs_reauth", GMAIL_NEEDS_REAUTH],
    ["skipped some_future_reason", { status: "skipped", reason: "some_future_reason" }],
  ];
  const CALENDAR_OUTCOMES: [string, Result | null][] = [
    ["synced", CAL_SYNCED],
    ["synced with new", CAL_SYNCED_NEW],
    ["error", CAL_ERROR],
    ["skipped already_syncing", CAL_ALREADY_SYNCING],
    ["skipped needs_reauth", CAL_NEEDS_REAUTH],
    ["skipped some_future_reason", { status: "skipped", reason: "some_future_reason" }],
    ["not connected", null],
  ];

  const pairs = GMAIL_OUTCOMES.flatMap(([gmailName, gmail]) =>
    CALENDAR_OUTCOMES.map(
      ([calendarName, calendar]) =>
        [`Gmail ${gmailName} + Calendar ${calendarName}`, gmail, calendar] as const,
    ),
  );

  it.each(pairs)("%s", (_name, gmail, calendar) => {
    const everyConnectedProductSynced = [gmail, calendar]
      .filter((r): r is Result => r !== null)
      .every((r) => r.status === "synced");
    const { tone } = combinedSyncOutcomeMessage(gmail, calendar);
    if (!everyConnectedProductSynced) expect(tone).toBe("error");
    else expect(tone).toBe("success");
  });

  it("covers every combination", () => {
    expect(pairs).toHaveLength(GMAIL_OUTCOMES.length * CALENDAR_OUTCOMES.length);
  });
});

// Per-product copy is unchanged by P1-2 — pinned so the combined-toast work
// above can't quietly alter what a single product's own result reads like.
describe("syncOutcomeMessage", () => {
  it("summarises Gmail's counters", () => {
    expect(syncOutcomeMessage(GMAIL_SYNCED)).toBe("Synced 12 emails — nothing new to review.");
    expect(syncOutcomeMessage({ status: "synced", processed: 0, suggestionsCreated: 0 })).toBe(
      "Synced — no new email found.",
    );
  });

  it("summarises Calendar's richer counters", () => {
    expect(syncOutcomeMessage(CAL_SYNCED)).toBe("Synced — no new calendar events found.");
    expect(
      syncOutcomeMessage({
        status: "synced",
        eventsProcessed: 4,
        relevantEventsStored: 0,
        suggestionsCreated: 0,
      }),
    ).toBe("Synced 4 events — none looked like interviews.");
  });

  it("reports a non-synced result as not having run", () => {
    expect(syncOutcomeMessage(GMAIL_ERROR)).toBe("Sync didn't run.");
    expect(syncOutcomeMessage(GMAIL_ALREADY_SYNCING)).toBe("Sync didn't run.");
  });
});
