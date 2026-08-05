import { describe, it, expect } from "vitest";
import { classify } from "./EmailClassifier";
import { parseFromHeader } from "./emailParsing";

// Coverage for the categories added in migration 20260809000001. The
// original EmailClassifier.test.ts still covers the pre-existing ten.

const from = parseFromHeader("Talent Team <careers@acme.com>");

function run(subject: string, bodyText = "", hasIcsAttachment = false) {
  return classify({ from, subject, bodyText, hasIcsAttachment });
}

describe("expanded classification vocabulary", () => {
  it("separates a scheduled interview from an invitation", () => {
    const result = run(
      "Interview confirmation",
      "Your interview is scheduled for next Tuesday. Interview confirmation attached.",
    );
    expect(result.category).toBe("interview_scheduled");
  });

  it("detects a reschedule", () => {
    const result = run(
      "Interview rescheduled",
      "We need to reschedule your interview. Here is a new time for your interview.",
    );
    expect(result.category).toBe("interview_rescheduled");
  });

  it("detects an interview reminder", () => {
    const result = run(
      "Reminder: upcoming interview",
      "Reminder — your interview tomorrow at 10am.",
    );
    expect(result.category).toBe("interview_reminder");
  });

  it("does not call a non-interview reminder an interview reminder", () => {
    // "reminder" alone must not be enough — this is the guard that keeps
    // every reminder email in the inbox from becoming an interview.
    const result = run("Reminder", "Just a reminder to submit your timesheet.");
    expect(result.category).not.toBe("interview_reminder");
  });

  it("detects an OA invitation", () => {
    const result = run(
      "You have been invited to take an assessment",
      "You have been invited to complete the online assessment. Assessment link inside.",
    );
    expect(result.category).toBe("oa_invitation");
  });

  it("detects offer accepted and declined distinctly", () => {
    expect(
      run("Offer accepted", "Thank you for accepting the offer. Offer accepted.").category,
    ).toBe("offer_accepted");
    expect(run("Offer declined", "You have declined the offer. Offer declined.").category).toBe(
      "offer_declined",
    );
  });

  it("detects a waitlist", () => {
    const result = run(
      "Update on your application",
      "We'd like to keep your application on file — you are waitlisted for future opportunities.",
    );
    expect(result.category).toBe("waitlist");
  });

  it("detects background verification", () => {
    const result = run(
      "Background verification",
      "We are initiating your background verification. Please verify your documents.",
    );
    expect(result.category).toBe("background_verification");
  });

  it("detects a reference check", () => {
    const result = run(
      "Reference check",
      "Please provide references — we need your referees for the reference check.",
    );
    expect(result.category).toBe("reference_check");
  });

  it("detects joining formalities", () => {
    const result = run(
      "Joining formalities",
      "Welcome aboard! Please complete the joining formalities. Your joining date is 1 September.",
    );
    expect(result.category).toBe("joining_formalities");
  });

  it("detects recruiter-viewed notifications", () => {
    const result = run(
      "Your application was viewed",
      "A recruiter viewed your application and your profile was viewed.",
    );
    expect(result.category).toBe("recruiter_viewed");
  });

  it("detects an application submission", () => {
    const result = run(
      "Application submitted",
      "You have applied — your application was submitted successfully.",
    );
    expect(result.category).toBe("application_submitted");
  });

  it("never lets the generic recruiter catch-all outrank a specific category", () => {
    // Body contains both generic recruiter words and explicit offer language.
    const result = run(
      "Regarding your application",
      "Your recruiter and the hiring team are pleased to offer you the role. Offer of employment attached.",
    );
    expect(result.category).toBe("offer");
  });

  it("still returns unknown when nothing matches confidently", () => {
    expect(run("Hello", "Just checking in.").category).toBe("unknown");
  });
});
