import { describe, expect, it } from "vitest";
import { joinSpoken } from "./dictation";

// Dictation arrives as fragments that must read as one continuous answer.
// These pin the joining rule, which is the difference between
// "I led the redesign  of our referral flow" (doubled space) or
// "I led the redesignof our referral flow" (glued) and correct prose.

describe("joinSpoken", () => {
  it("returns the addition when there is no base yet", () => {
    expect(joinSpoken("", "In my last role")).toBe("In my last role");
  });

  it("returns the base when the addition is empty", () => {
    expect(joinSpoken("In my last role", "")).toBe("In my last role");
  });

  it("joins two fragments with exactly one space", () => {
    expect(joinSpoken("In my last role", "I led the redesign")).toBe(
      "In my last role I led the redesign",
    );
  });

  it("does not double the separator when the base already ends in whitespace", () => {
    expect(joinSpoken("In my last role ", "I led")).toBe("In my last role I led");
  });

  it("does not double the separator when the addition starts with whitespace", () => {
    expect(joinSpoken("In my last role", "  I led")).toBe("In my last role I led");
  });

  it("collapses whitespace on both sides of the seam", () => {
    expect(joinSpoken("In my last role\n", "\n I led")).toBe("In my last role I led");
  });

  it("is safe to fold repeatedly, as dictation actually accumulates", () => {
    const fragments = ["In my last role", "I led the referral redesign", "and it grew signups 22%"];
    expect(fragments.reduce(joinSpoken, "")).toBe(
      "In my last role I led the referral redesign and it grew signups 22%",
    );
  });

  it("preserves internal punctuation and spacing inside a fragment", () => {
    expect(joinSpoken("We ran an A/B test.", "It grew signups by 22%, measured weekly.")).toBe(
      "We ran an A/B test. It grew signups by 22%, measured weekly.",
    );
  });

  it("returns an empty string when both sides are empty or whitespace", () => {
    expect(joinSpoken("   ", "  ")).toBe("");
  });
});
