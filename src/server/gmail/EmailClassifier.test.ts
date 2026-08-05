import { describe, expect, it } from "vitest";
import { classify, MIN_CONFIDENCE } from "./EmailClassifier";
import { parseFromHeader } from "./emailParsing";

const genericFrom = parseFromHeader("Recruiter <recruiter@acme-corp.com>");

function classifyBody(
  subject: string,
  bodyText: string,
  overrides: Partial<Parameters<typeof classify>[0]> = {},
) {
  return classify({ from: genericFrom, subject, bodyText, hasIcsAttachment: false, ...overrides });
}

describe("classify — category detection", () => {
  it("detects a rejection", () => {
    const result = classifyBody(
      "Update on your application",
      "Unfortunately, we have decided to move forward with other candidates at this time.",
    );
    expect(result.category).toBe("rejection");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  });

  it("detects an offer", () => {
    const result = classifyBody(
      "Your offer from Acme",
      "We are pleased to offer you the position. Please find the compensation package attached.",
    );
    expect(result.category).toBe("offer");
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  });

  it("detects an online assessment from a known platform domain, even with sparse body text", () => {
    const from = parseFromHeader("HackerRank <no-reply@hackerrank.com>");
    const result = classify({
      from,
      subject: "Complete your coding test",
      bodyText: "Please complete the assessment within 7 days.",
      hasIcsAttachment: false,
    });
    expect(result.category).toBe("online_assessment");
    expect(result.extracted.assessmentPlatform).toBe("HackerRank");
  });

  it("detects an interview invitation with a meeting link", () => {
    const result = classifyBody(
      "Interview invitation",
      "We would like to schedule a call. Join here: https://zoom.us/j/1234567890",
    );
    expect(result.category).toBe("interview_invitation");
    expect(result.extracted.meetingLink).toBe("https://zoom.us/j/1234567890");
  });

  it("leans toward interview_invitation from an ICS attachment alone", () => {
    const result = classifyBody("Meeting invite", "See attached calendar invite for details.", {
      hasIcsAttachment: true,
    });
    expect(result.category).toBe("interview_invitation");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("detects an assignment / take-home", () => {
    const result = classifyBody(
      "Your take-home assignment",
      "Please complete the attached take-home assignment and submit within 5 days.",
    );
    expect(result.category).toBe("assignment");
  });

  it("detects a follow-up-required email", () => {
    const result = classifyBody(
      "Following up",
      "Following up on our conversation — please confirm your availability and reply by Friday.",
    );
    expect(result.category).toBe("follow_up_required");
  });

  it("detects an application confirmation", () => {
    const result = classifyBody(
      "We received your application",
      "Thank you for applying. Your application has been received and is under review.",
    );
    expect(result.category).toBe("application_confirmation");
  });

  it("detects a generic application update", () => {
    const result = classifyBody(
      "Application status update",
      "This is an update on your application status with our team.",
    );
    expect(result.category).toBe("application_update");
  });

  it("returns unknown for an unrelated email", () => {
    const result = classifyBody("Let's catch up", "Are you free for coffee next week?");
    expect(result.category).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("returns unknown for a bulk job-alert digest that reached the classifier (defense in depth beyond RelevanceFilter)", () => {
    const result = classifyBody(
      "3 new jobs matching your profile",
      "Check out these new opportunities curated just for you this week.",
    );
    expect(result.category).toBe("unknown");
  });
});

describe("classify — date/time extraction", () => {
  it("resolves an explicit date+time+timezone in the body to a confident UTC instant", () => {
    const result = classifyBody(
      "Interview invitation",
      "Let's meet on August 12, 2026 at 2:00 PM EST to discuss the role.",
    );
    expect(result.extracted.timezoneConfident).toBe(true);
    expect(result.extracted.scheduledAtIso).toBe("2026-08-12T19:00:00.000Z");
  });

  it("leaves scheduledAtIso null when no timezone is stated, but keeps the raw text for display", () => {
    const result = classifyBody(
      "Interview invitation",
      "Let's meet on August 12, 2026 at 2:00 PM to discuss the role.",
    );
    expect(result.extracted.timezoneConfident).toBe(false);
    expect(result.extracted.scheduledAtIso).toBeNull();
    expect(result.extracted.rawDateText).toContain("August 12, 2026");
  });

  it("prefers an ICS DTSTART over prose parsing when both are present and disagree", () => {
    // Deliberately different from the ICS time below, so a passing assertion
    // actually proves ICS won rather than the two coincidentally agreeing.
    const result = classify({
      from: genericFrom,
      subject: "Interview invitation",
      bodyText:
        "Let's meet on September 1, 2026 at 9:00 AM PST — see the attached calendar invite.",
      hasIcsAttachment: true,
      icsRawText: "BEGIN:VEVENT\nDTSTART:20260812T190000Z\nEND:VEVENT",
    });
    expect(result.extracted.scheduledAtIso).toBe("2026-08-12T19:00:00.000Z");
    expect(result.extracted.timezoneConfident).toBe(true);
  });
});
