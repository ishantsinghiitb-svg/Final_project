import { describe, it, expect } from "vitest";
import { parseFromHeader } from "./emailParsing";
import { extractRole, extractRecruiterName } from "./EntityExtractor";
import { extractCompanyName } from "./CompanyExtractor";
import { isRelevant, explainRelevance } from "./RelevanceFilter";

describe("extractRole", () => {
  it("pulls the title out of an application-confirmation subject", () => {
    expect(extractRole("Your application for Product Intern at Jar")).toBe("Product Intern");
  });

  it("handles 'role of' phrasing", () => {
    expect(extractRole("Update on the role of Software Engineer")).toBe("Software Engineer");
  });

  it("reads a labelled Position: field from the body", () => {
    expect(extractRole("Congratulations!", "Position: Data Analyst\nLocation: Bengaluru")).toBe(
      "Data Analyst",
    );
  });

  it("falls back to a title-shaped subject fragment", () => {
    expect(extractRole("Groww | Software Intern")).toBe("Software Intern");
  });

  it("returns null rather than guessing on boilerplate", () => {
    expect(extractRole("Thank you for your application", "We received it.")).toBeNull();
    expect(extractRole("Weekly update")).toBeNull();
  });

  it("does not mistake generic phrases for a job title", () => {
    // "your application" contains no role keyword, so it must not be captured.
    expect(extractRole("We received your application")).toBeNull();
  });
});

describe("extractRecruiterName", () => {
  it("uses a personal-looking sender display name", () => {
    const from = parseFromHeader("Ayush Gupta <ayush@jar.app>");
    expect(extractRecruiterName(from)).toBe("Ayush Gupta");
  });

  it("rejects a team/brand display name", () => {
    const from = parseFromHeader("Jar Talent Team <careers@jar.app>");
    expect(extractRecruiterName(from)).toBeNull();
  });

  it("falls back to a sign-off name in the body", () => {
    const from = parseFromHeader("careers@acme.com");
    expect(
      extractRecruiterName(from, "Looking forward.\n\nBest regards,\nPriya Sharma\nRecruiter"),
    ).toBe("Priya Sharma");
  });
});

describe("extractCompanyName", () => {
  it("maps a legal entity to the brand a candidate recognises", () => {
    // The regression this module was reported for: mail from ChangeJar
    // Technologies must surface as "Jar", the brand the user applied to.
    const from = parseFromHeader("Careers <careers@changejar.com>");
    expect(extractCompanyName(from, "Interview invitation")).toBe("Jar");
  });

  it("strips legal suffixes", () => {
    const from = parseFromHeader("hr@acmetechnologies.com");
    expect(extractCompanyName(from, "Your application")).toBe("Acmetechnologies");
  });

  it("prefers the employer named in ATS body copy over the ATS vendor domain", () => {
    const from = parseFromHeader("Greenhouse <no-reply@greenhouse.io>");
    const company = extractCompanyName(
      from,
      "Thanks for applying",
      "Your application to Stripe for the Backend Engineer role has been received.",
    );
    expect(company).toBe("Stripe");
  });

  it("resolves recruiting-suffixed senders to the plain brand", () => {
    // The company shown in the Inbox must match what the Applications page
    // shows, so recruiting boilerplate in the sender's display name
    // ("Careers", "Recruiting", "Jobs") and corporate suffixes ("Invest
    // Tech") must never survive into the stored company_name.
    const cases: [string, string, string][] = [
      ["Google Careers <noreply@google.com>", "Your application", "Google"],
      ["Meta Recruiting <noreply@meta.com>", "Your application", "Meta"],
      ["Amazon Jobs <noreply@amazon.jobs>", "Your application", "Amazon"],
      ["Groww Invest Tech <hr@groww.in>", "Your application", "Groww"],
      ["ChangeJar <careers@changejar.com>", "Interview invitation", "Jar"],
    ];
    for (const [header, subject, expected] of cases) {
      expect(extractCompanyName(parseFromHeader(header), subject)).toBe(expected);
    }
  });

  it("never returns the generic mail host for a personal sender", () => {
    const from = parseFromHeader("Ayush Gupta <ayush.recruiter@gmail.com>");
    // Must not become "Gmail" — falls through to subject/display-name paths.
    expect(extractCompanyName(from, "Interview at Jar")).toBe("Jar");
  });
});

describe("isRelevant — hard exclusions", () => {
  const jobSubject = "Interview invitation for Software Engineer";

  it("drops bounce/delivery-failure mail even with a job-related subject", () => {
    const from = parseFromHeader("Mail Delivery Subsystem <mailer-daemon@googlemail.com>");
    expect(isRelevant(from, jobSubject)).toBe(false);
  });

  it("drops out-of-office auto-replies", () => {
    const from = parseFromHeader("recruiter@greenhouse.io");
    expect(isRelevant(from, "Out of office: re your application")).toBe(false);
  });

  it("drops OTP / security / receipt mail", () => {
    const from = parseFromHeader("no-reply@somebank.com");
    expect(isRelevant(from, "Your one-time password for login")).toBe(false);
    expect(isRelevant(from, "Security alert: new sign-in")).toBe(false);
    expect(isRelevant(from, "Invoice for your recent order")).toBe(false);
  });

  it("drops GitHub notification noise", () => {
    const from = parseFromHeader("notifications@github.com");
    expect(isRelevant(from, "Pull request assignment review")).toBe(false);
  });

  it("drops the user's own outgoing mail", () => {
    const from = parseFromHeader("me@gmail.com");
    expect(isRelevant(from, jobSubject, { googleEmail: "me@gmail.com" })).toBe(false);
    // …but the same subject from someone else still passes.
    const recruiter = parseFromHeader("recruiter@acme.com");
    expect(isRelevant(recruiter, jobSubject, { googleEmail: "me@gmail.com" })).toBe(true);
  });

  it("still allows genuine ATS mail", () => {
    const from = parseFromHeader("no-reply@greenhouse.io");
    expect(isRelevant(from, "Your application was received")).toBe(true);
  });

  it("does not hard-exclude a real employer just because it's also a consumer/fintech brand", () => {
    // Regression: EXCLUDED_DOMAINS previously listed razorpay.com, paytm.com,
    // phonepe.com, flipkart.com, swiggy.in, zomato.com, amazon.in, stripe.com
    // outright — but every one of those companies also hires and can send
    // genuine recruiting mail from that exact domain. A hard domain
    // exclusion can't distinguish "payment receipt" from "interview
    // invitation" from the same sender; only the message can.
    for (const domain of [
      "razorpay.com",
      "paytm.com",
      "phonepe.com",
      "flipkart.com",
      "swiggy.in",
      "zomato.com",
      "amazon.in",
      "stripe.com",
    ]) {
      const from = parseFromHeader(`hr@${domain}`);
      expect(isRelevant(from, "Interview invitation for Software Engineer")).toBe(true);
    }
  });

  it("still drops actual transactional mail from those same domains via the subject, not the domain", () => {
    const from = parseFromHeader("no-reply@razorpay.com");
    expect(isRelevant(from, "Payment received for your order")).toBe(false);
  });

  it("matches short keywords on word boundaries, not as a substring", () => {
    // "ppo" must not fire on "oppose" (contains "ppo" as a raw substring),
    // and "hr" must not fire on ordinary prose that happens to contain the
    // two letters adjacently.
    const from = parseFromHeader("someone@example.com");
    expect(isRelevant(from, "We strongly oppose this proposal")).toBe(false);
    expect(isRelevant(from, "Thursday afternoon plans")).toBe(false);
    // But the real, standalone tokens still match.
    expect(isRelevant(from, "PPO confirmation")).toBe(true);
    expect(isRelevant(from, "HR round feedback")).toBe(true);
  });

  it("explains self-sent rejection by name — the reported 'my test email never appeared' case", () => {
    // Root cause of the real-world report: a recruiter-STYLE email the user
    // sent to their OWN address. It is rejected by two independent layers
    // (the `-in:sent` query operator and this address check), which is why it
    // never reached the Inbox. Intentional, documented in RelevanceFilter's
    // header — emailing yourself is not a valid way to test detection.
    const me = "ishant@example.com";
    const decision = explainRelevance(parseFromHeader(me), "Product Intern Interview", {
      googleEmail: me,
    });
    expect(decision.relevant).toBe(false);
    expect(decision.rule).toBe("self_sent");

    // The identical subject from anyone else is accepted — proving the
    // subject/keywords were never the problem.
    const other = parseFromHeader("recruiter@somecompany.com");
    expect(isRelevant(other, "Product Intern Interview", { googleEmail: me })).toBe(true);
  });

  it("names the exact rule for every rejection path", () => {
    const rules = [
      [parseFromHeader("mailer-daemon@google.com"), "Interview", "excluded_local_part"],
      [parseFromHeader("hr@acme.com"), "Out of office: re your interview", "excluded_subject"],
      [parseFromHeader("jobs-alerts-noreply@acme.com"), "Interview", "bulk_sender"],
      [parseFromHeader("friend@acme.com"), "Lunch tomorrow", "no_signal"],
    ] as const;
    for (const [from, subject, expected] of rules) {
      const decision = explainRelevance(from, subject);
      expect(decision.relevant).toBe(false);
      expect(decision.rule).toBe(expected);
      expect(decision.detail.length).toBeGreaterThan(0);
    }
  });

  it("detects the expanded vocabulary from real recruiting subject lines", () => {
    const from = parseFromHeader("talent@example.com");
    const subjects = [
      "Product Internship opportunity at Acme",
      "Graduate Program 2027 — Applications open",
      "Campus Hiring drive at your college",
      "Your placement application has been received",
      "OA invite: complete within 48 hours",
      "You've been shortlisted for the next round",
      "Background verification initiated",
      "Reference check request",
      "Welcome to the People Team",
      "Career portal update",
    ];
    for (const subject of subjects) {
      expect(isRelevant(from, subject)).toBe(true);
    }
  });
});
