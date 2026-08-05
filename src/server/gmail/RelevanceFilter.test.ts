import { describe, expect, it } from "vitest";
import { isRelevant, buildSyncQuery } from "./RelevanceFilter";
import { parseFromHeader } from "./emailParsing";

describe("isRelevant", () => {
  it("allows a known ATS domain regardless of subject wording", () => {
    const from = parseFromHeader("Greenhouse <notifications@greenhouse.io>");
    expect(isRelevant(from, "A message with no job-related words at all")).toBe(true);
  });

  it("allows a known assessment domain", () => {
    const from = parseFromHeader("HackerRank <no-reply@hackerrank.com>");
    expect(isRelevant(from, "Your coding test is ready")).toBe(true);
  });

  it("denies a bulk job-alert digest sender even with a matching keyword in the subject", () => {
    const from = parseFromHeader("LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>");
    expect(
      isRelevant(from, "3 new jobs matching your profile — apply to your next interview"),
    ).toBe(false);
  });

  it("denies a generic newsletter sender with no job-related subject", () => {
    const from = parseFromHeader("Weekly Newsletter <newsletter@randomsite.com>");
    expect(isRelevant(from, "This week in tech")).toBe(false);
  });

  it("allows a non-listed sender whose subject contains a job keyword", () => {
    const from = parseFromHeader("Jane Recruiter <jane@acme-corp.com>");
    expect(isRelevant(from, "Interview invitation for Software Engineer role")).toBe(true);
  });

  it("denies a non-listed sender whose subject has no job-related signal", () => {
    const from = parseFromHeader("Jane <jane@acme-corp.com>");
    expect(isRelevant(from, "Let's catch up sometime")).toBe(false);
  });
});

describe("buildSyncQuery", () => {
  it("includes a newer_than bound using the given lookback", () => {
    expect(buildSyncQuery(90)).toContain("newer_than:90d");
  });

  it("defaults to a 30-day lookback on first connection", () => {
    // Deliberately short — see DEFAULT_LOOKBACK_DAYS. This bounds the INITIAL
    // backfill only; incremental history.list sync is unaffected and
    // continues indefinitely once backfill completes.
    expect(buildSyncQuery()).toContain("newer_than:30d");
  });

  it("excludes the user's own sent mail at the Gmail query level", () => {
    expect(buildSyncQuery()).toContain("-in:sent");
  });

  it("includes both a from: domain clause and a subject: keyword clause", () => {
    const query = buildSyncQuery();
    expect(query).toContain("from:(");
    expect(query).toContain("subject:(");
    expect(query).toContain("greenhouse.io");
    expect(query).toContain("interview");
  });
});
