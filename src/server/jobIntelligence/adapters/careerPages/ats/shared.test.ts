import { describe, expect, it } from "vitest";
import {
  inferExperienceLevelFromTitle,
  looksRemote,
  mapEmploymentType,
  mapWorkMode,
  pickBoolean,
  pickString,
  splitLocationText,
  toIsoDate,
} from "./shared";

describe("mapEmploymentType", () => {
  it.each([
    ["FullTime", "Full-Time"],
    ["Full-time", "Full-Time"],
    ["Regular Full Time (Salary)", "Full-Time"],
    ["Permanent", "Full-Time"],
    ["PartTime", "Part-Time"],
    ["part time", "Part-Time"],
    ["Contract", "Contract"],
    ["Contractor", "Contract"],
    ["Temporary", "Temporary"],
    ["Intern", "Internship"],
    ["Internship", "Internship"],
    ["Freelance", "Freelance"],
  ])("%s → %s", (input, expected) => {
    expect(mapEmploymentType(input)).toBe(expected);
  });

  it("prefers the most specific match — a full-time internship is an Internship", () => {
    expect(mapEmploymentType("Full Time Internship")).toBe("Internship");
  });

  it("returns null for empty or unrecognized input", () => {
    expect(mapEmploymentType("")).toBeNull();
    expect(mapEmploymentType(null)).toBeNull();
    expect(mapEmploymentType("Seasonal Volunteer")).toBeNull();
  });
});

describe("mapWorkMode", () => {
  it.each([
    ["Remote", "Remote"],
    ["Hybrid", "Hybrid"],
    ["Onsite", "Onsite"],
    ["On-site", "Onsite"],
    ["In Office", "Onsite"],
    ["Fully remote role", "Remote"],
  ])("%s → %s", (input, expected) => {
    expect(mapWorkMode(input)).toBe(expected);
  });

  it("prefers Hybrid over Remote when both words appear", () => {
    expect(mapWorkMode("Hybrid remote")).toBe("Hybrid");
  });

  it("returns null when absent", () => {
    expect(mapWorkMode(null)).toBeNull();
    expect(mapWorkMode("Flexible")).toBeNull();
  });
});

describe("inferExperienceLevelFromTitle", () => {
  it.each([
    ["Senior Software Engineer", "Senior-Level"],
    ["Sr. Data Scientist", "Senior-Level"],
    ["Staff Engineer", "Staff"],
    ["Principal Architect", "Principal"],
    ["Engineering Lead", "Lead"],
    ["Director of Product", "Lead"],
    ["Junior Developer", "Junior"],
    ["Associate Analyst", "Junior"],
    ["Marketing Intern", "Intern"],
    ["Software Engineering Internship", "Intern"],
  ])("%s → %s", (title, expected) => {
    expect(inferExperienceLevelFromTitle(title)).toBe(expected);
  });

  it("returns null for a title with no seniority marker", () => {
    expect(inferExperienceLevelFromTitle("Software Engineer")).toBeNull();
    expect(inferExperienceLevelFromTitle("")).toBeNull();
  });

  it("puts Intern ahead of Senior when a title contains both", () => {
    expect(inferExperienceLevelFromTitle("Senior Intern Program")).toBe("Intern");
  });
});

describe("splitLocationText", () => {
  it("splits city, state, country", () => {
    expect(splitLocationText("Bengaluru, Karnataka, India")).toEqual({
      location: "Bengaluru, Karnataka, India",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
    });
  });

  it("splits city, country when the last token is a known country", () => {
    expect(splitLocationText("Dublin, Ireland")).toEqual({
      location: "Dublin, Ireland",
      city: "Dublin",
      state: null,
      country: "Ireland",
    });
  });

  it("treats a two-part non-country tail as a state", () => {
    expect(splitLocationText("New York, NY")).toEqual({
      location: "New York, NY",
      city: "New York",
      state: "NY",
      country: null,
    });
  });

  it("treats a lone token as a city, not an invented country", () => {
    expect(splitLocationText("London")).toEqual({
      location: "London",
      city: "London",
      state: null,
      country: null,
    });
  });

  it("recognizes a lone country token", () => {
    expect(splitLocationText("India").country).toBe("India");
    expect(splitLocationText("India").city).toBeNull();
  });

  it("returns all-null for empty input", () => {
    expect(splitLocationText("")).toEqual({
      location: null,
      city: null,
      state: null,
      country: null,
    });
    expect(splitLocationText(null).location).toBeNull();
  });
});

describe("looksRemote", () => {
  it("detects remote phrasing across several fields", () => {
    expect(looksRemote("Remote — US")).toBe(true);
    expect(looksRemote(null, "Work from home")).toBe(true);
    expect(looksRemote("Anywhere")).toBe(true);
  });

  it("is false for an office location", () => {
    expect(looksRemote("Mumbai", "Software Engineer")).toBe(false);
  });
});

describe("toIsoDate", () => {
  it("normalizes ISO strings", () => {
    expect(toIsoDate("2026-08-06T12:10:12-04:00")).toBe("2026-08-06T16:10:12.000Z");
  });

  it("accepts epoch milliseconds", () => {
    expect(toIsoDate(1786127138000)).toBe(new Date(1786127138000).toISOString());
  });

  it("returns null for anything unparseable", () => {
    expect(toIsoDate("soon")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate({})).toBeNull();
  });
});

describe("pickString / pickBoolean", () => {
  const source = { a: { b: { c: "deep", n: 5, flag: true } } };

  it("reads a nested value", () => {
    expect(pickString(source, "a", "b", "c")).toBe("deep");
    expect(pickString(source, "a", "b", "n")).toBe("5");
    expect(pickBoolean(source, "a", "b", "flag")).toBe(true);
  });

  it("returns null for a missing path instead of throwing", () => {
    expect(pickString(source, "a", "z", "c")).toBeNull();
    expect(pickString(null, "a")).toBeNull();
    expect(pickBoolean(source, "a", "b", "c")).toBeNull();
  });
});
