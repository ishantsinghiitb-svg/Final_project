import { describe, it, expect } from "vitest";
import { buildSuggestions } from "./SuggestionBuilder";
import type { ClassificationResult } from "./EmailClassifier";
import type { GmailMessageCategory } from "@/features/gmail/types";

// ── Summary quality (Module 9A) ──
//
// Guards the contract that every card answers WHAT happened, WHY it matters
// and WHAT ACTION is required — and, just as importantly, that purely
// informational mail carries NO action line, so the presence of one is itself
// a signal rather than decoration.
//
// Also pins the removal of the old generic template ("We found what looks
// like a job application update from X"), which said nothing the user
// couldn't already see from the subject line.

type SummaryBlock = {
  headline: string;
  reason: string;
  action: string | null;
};

type Overrides = {
  company?: string | null;
  role?: string | null;
  recruiter?: string | null;
  scheduledAtIso?: string | null;
  assessmentPlatform?: string | null;
  meetingLink?: string | null;
  /**
   * "single" exercises the status/interview/reminder drafts that require an
   * existing application; "none" exercises the create_application path. Some
   * categories only produce a draft under one of the two — see
   * draftsFor/summaryOf below.
   */
  match?: "single" | "none";
};

function draftsFor(category: GmailMessageCategory, overrides: Overrides = {}) {
  const classification: ClassificationResult = {
    category,
    confidence: 0.9,
    extracted: {
      meetingLink: overrides.meetingLink ?? null,
      scheduledAtIso: overrides.scheduledAtIso ?? null,
      timezoneConfident: true,
      rawDateText: null,
      assessmentPlatform: overrides.assessmentPlatform ?? null,
      hasIcsAttachment: false,
    },
  };

  return buildSuggestions({
    classification,
    match:
      (overrides.match ?? "single") === "single"
        ? { kind: "single", applicationId: "app-1", confidence: 0.9, reason: "matched" }
        : { kind: "none" },
    companyName: overrides.company === undefined ? "Groww" : overrides.company,
    role: overrides.role === undefined ? "Product Intern" : overrides.role,
    recruiterName: overrides.recruiter ?? null,
    receivedAtIso: "2026-08-05T09:00:00.000Z",
    subject: "A subject",
    attachments: [],
    onKnownAtsDomain: false,
  });
}

function summaryOf(category: GmailMessageCategory, overrides: Overrides = {}): SummaryBlock {
  const drafts = draftsFor(category, overrides);
  expect(drafts.length).toBeGreaterThan(0);
  const payload = drafts[0].payload as Record<string, unknown>;
  return payload.summary as unknown as SummaryBlock;
}

describe("suggestion summaries — what / why / action", () => {
  it("never emits the old generic template", () => {
    // application_confirmation / recruiter_reply only yield a draft on the
    // unmatched (create_application) path — matched to an existing
    // application they are informational and correctly produce nothing.
    const cases: [GmailMessageCategory, Overrides][] = [
      ["interview_invitation", {}],
      ["online_assessment", {}],
      ["offer", {}],
      ["rejection", {}],
      ["application_confirmation", { match: "none" }],
      ["recruiter_reply", { match: "none" }],
    ];
    for (const [category, overrides] of cases) {
      const summary = summaryOf(category, overrides);
      expect(summary.reason).not.toMatch(/we found what looks like/i);
      expect(summary.reason.length).toBeGreaterThan(10);
    }
  });

  it("states the action for an interview invitation", () => {
    const summary = summaryOf("interview_invitation", {
      scheduledAtIso: "2026-08-14T10:00:00.000Z",
    });
    expect(summary.headline).toBe("Interview Invitation");
    expect(summary.reason).toContain("Groww");
    expect(summary.reason).toContain("Product Intern");
    expect(summary.action).toMatch(/confirm your availability/i);
  });

  it("names the assessment platform and its deadline", () => {
    const summary = summaryOf("online_assessment", {
      assessmentPlatform: "HackerRank",
      scheduledAtIso: "2026-08-12T18:00:00.000Z",
    });
    expect(summary.reason).toContain("HackerRank");
    expect(summary.action).toMatch(/complete the assessment before/i);
  });

  it("tells the user to accept or decline an offer by the deadline", () => {
    const summary = summaryOf("offer", { scheduledAtIso: "2026-08-15T18:00:00.000Z" });
    expect(summary.headline).toBe("Offer");
    expect(summary.action).toMatch(/accept or decline before/i);
  });

  it("omits the action line entirely for informational mail", () => {
    // These need nothing from the user — an action line here would be noise
    // and would dilute the signal on the cards that DO need attention.
    const cases: [GmailMessageCategory, Overrides][] = [
      ["application_confirmation", { match: "none" }],
      ["rejection", {}],
      ["offer_accepted", {}],
    ];
    for (const [category, overrides] of cases) {
      expect(summaryOf(category, overrides).action).toBeNull();
    }
  });

  it("generates no suggestion at all for informational mail already tied to an application", () => {
    // A "we received your application" note about an application you already
    // track proposes no action, so it must produce NO card rather than an
    // empty one. This is the quiet half of summary quality: saying nothing
    // when there is nothing to say.
    for (const category of [
      "application_confirmation",
      "recruiter_viewed",
      "recruiter_reply",
    ] as GmailMessageCategory[]) {
      expect(draftsFor(category, { match: "single" })).toHaveLength(0);
    }
  });

  it("degrades gracefully when the date could not be extracted", () => {
    const summary = summaryOf("interview_invitation", { scheduledAtIso: null });
    // Must still say something actionable rather than inventing a date.
    expect(summary.action).toMatch(/availability/i);
    expect(summary.action).not.toMatch(/null|undefined|Invalid Date/i);
  });

  it("does not emit 'null' or 'undefined' into user-facing copy", () => {
    const summary = summaryOf("interview_invitation", {
      company: null,
      role: null,
      recruiter: null,
      scheduledAtIso: null,
    });
    expect(summary.reason).not.toMatch(/null|undefined/);
    expect(summary.action ?? "").not.toMatch(/null|undefined/);
  });
});
