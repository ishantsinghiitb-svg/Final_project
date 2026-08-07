import { describe, expect, it } from "vitest";
import {
  decideRelevance,
  buildSyncWindow,
  tierForConfidence,
  RELEVANCE_THRESHOLD,
  type RelevanceContext,
  type CalendarEventInput,
} from "./CalendarRelevanceFilter";

function emptyContext(overrides: Partial<RelevanceContext> = {}): RelevanceContext {
  return {
    knownIcsUids: new Set(),
    trackedCompanyDomains: new Set(),
    existingInterviewLinks: new Set(),
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return {
    title: null,
    description: null,
    organizerEmail: null,
    externalAttendeeEmails: [],
    icalUid: null,
    meetingLink: null,
    ...overrides,
  };
}

describe("decideRelevance — deterministic-identity signals (near/at max confidence)", () => {
  it("matches an event whose iCalUID matches a known interview email", () => {
    const result = decideRelevance(
      event({ icalUid: "abc123@google.com" }),
      emptyContext({ knownIcsUids: new Set(["abc123@google.com"]) }),
    );
    expect(result.relevant).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it("matches an event whose meeting link matches an existing tracked interview", () => {
    const result = decideRelevance(
      event({ meetingLink: "https://meet.google.com/abc-defg-hij" }),
      emptyContext({ existingInterviewLinks: new Set(["https://meet.google.com/abc-defg-hij"]) }),
    );
    expect(result.relevant).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("matches an organizer on a known ATS domain whose domain is also tracked", () => {
    const result = decideRelevance(
      event({ organizerEmail: "notifications@greenhouse.io", title: "Interview" }),
      emptyContext({ trackedCompanyDomains: new Set(["greenhouse.io"]) }),
    );
    expect(result.relevant).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

describe("decideRelevance — the target scenario: title-only, self-organized, no attendees", () => {
  it("detects a self-created event with a strong interview title and zero external party — the 'Product Interview' case", () => {
    // Confirmed via live data: a real user's calendar had exactly this shape
    // (organizer.self=true, attendees=undefined) for a genuine upcoming
    // interview they'd noted for themselves. Vocabulary alone must be enough
    // to clear the bar — that's the whole point of "weighted, not brittle."
    const result = decideRelevance(event({ title: "Product Interview | Groww" }), emptyContext());
    expect(result.relevant).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(RELEVANCE_THRESHOLD);
  });

  it("still detects a bare 'Interview' title alone — a known tradeoff, not a regression: everything is review-gated now, so a false positive costs one dismiss, not a bad write", () => {
    const result = decideRelevance(event({ title: "Interview prep" }), emptyContext());
    expect(result.relevant).toBe(true);
  });
});

describe("decideRelevance — combined weak signals", () => {
  it("promotes on tracked-company-domain + interview vocabulary together", () => {
    const result = decideRelevance(
      event({
        title: "Technical Interview — Acme",
        organizerEmail: "jane@acme-corp.com",
        externalAttendeeEmails: ["jane@acme-corp.com"],
      }),
      emptyContext({ trackedCompanyDomains: new Set(["acme-corp.com"]) }),
    );
    expect(result.relevant).toBe(true);
  });

  it("promotes an organizer-only invite (recruiter as organizer, not duplicated into attendees — common for scheduling-tool invites) on vocabulary + external-party alone", () => {
    const result = decideRelevance(
      event({
        title: "Interview — Backend Engineer",
        organizerEmail: "recruiter@untracked-startup.com",
        externalAttendeeEmails: [],
      }),
      emptyContext(),
    );
    expect(result.relevant).toBe(true);
  });

  it("promotes on vocabulary + a recognized meeting link alone, no external party at all", () => {
    const result = decideRelevance(
      event({ title: "Technical Round", meetingLink: "https://zoom.us/j/1234567890" }),
      emptyContext(),
    );
    expect(result.relevant).toBe(true);
  });
});

describe("decideRelevance — dropped (never stored)", () => {
  it("drops an event with no interview signal at all", () => {
    const result = decideRelevance(
      event({ title: "Dentist appointment", externalAttendeeEmails: [] }),
      emptyContext(),
    );
    expect(result.relevant).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("drops a personal event with no vocabulary, no external party and no other signal — a self-organized event's own email never reaches this function at all (see CalendarClassifier.organizerEmailForRelevance), so organizerEmail is null here exactly as it would be for a real self-organized calendar entry", () => {
    const result = decideRelevance(event({ title: "Stay at Bilbao House" }), emptyContext());
    expect(result.relevant).toBe(false);
  });

  it("drops every instance of a recurring series once it exceeds the standing-meeting cap, regardless of how strong the other signals are", () => {
    const result = decideRelevance(
      event({
        title: "Weekly Interview Sync",
        organizerEmail: "recruiter@company.com",
        externalAttendeeEmails: ["teammate@company.com"],
        meetingLink: "https://meet.google.com/abc-defg-hij",
        recurringSeriesInstanceCount: 4,
      }),
      emptyContext(),
    );
    expect(result.relevant).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.reasons.join(" ")).toMatch(/standing meeting/i);
  });

  it("still allows a recurring series within the cap", () => {
    const result = decideRelevance(
      event({
        title: "Interview Round 2",
        externalAttendeeEmails: ["recruiter@company.com"],
        recurringSeriesInstanceCount: 2,
      }),
      emptyContext(),
    );
    expect(result.relevant).toBe(true);
  });
});

describe("tierForConfidence", () => {
  it("buckets a near-certain score as tier_1", () => {
    expect(tierForConfidence(0.95)).toBe("tier_1");
  });

  it("buckets a mid score as tier_2", () => {
    expect(tierForConfidence(0.6)).toBe("tier_2");
  });

  it("buckets a low-but-relevant score as tier_3", () => {
    expect(tierForConfidence(0.42)).toBe("tier_3");
  });
});

describe("buildSyncWindow", () => {
  it("starts at midnight today (no backward lookback), ignoring the current time of day", () => {
    const now = new Date(2026, 7, 5, 14, 30, 0);
    const { timeMin } = buildSyncWindow(now);
    const expectedMin = new Date(2026, 7, 5, 0, 0, 0);
    expect(new Date(timeMin).getTime()).toBe(expectedMin.getTime());
  });

  it("ends exactly 60 days ahead of now", () => {
    const now = new Date(2026, 7, 5, 0, 0, 0);
    const { timeMax } = buildSyncWindow(now);
    const daysAhead = (new Date(timeMax).getTime() - now.getTime()) / 86_400_000;
    expect(daysAhead).toBeCloseTo(60, 5);
  });

  it("never reaches beyond 60 days ahead", () => {
    const now = new Date(2026, 7, 5, 0, 0, 0);
    const { timeMax } = buildSyncWindow(now);
    const daysAhead = (new Date(timeMax).getTime() - now.getTime()) / 86_400_000;
    expect(daysAhead).toBeLessThanOrEqual(60);
  });
});
