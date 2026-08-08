import { describe, expect, it } from "vitest";
import {
  cleanText,
  extractSkillsFromText,
  inferEmploymentType,
  inferWorkMode,
  parseSalaryText,
} from "./utils";

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  hello   world  \n")).toBe("hello world");
  });
  it("handles null/undefined", () => {
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });
});

describe("parseSalaryText", () => {
  it("parses a USD range with commas", () => {
    const result = parseSalaryText("$120,000 - $150,000 per year");
    expect(result).toEqual({ min: 120000, max: 150000, currency: "USD", period: "Yearly" });
  });

  it("parses Indian lakh shorthand", () => {
    const result = parseSalaryText("₹8L - ₹12L per annum");
    expect(result.min).toBe(800000);
    expect(result.max).toBe(1200000);
    expect(result.currency).toBe("INR");
    expect(result.period).toBe("Yearly");
  });

  it("parses Indian crore shorthand", () => {
    const result = parseSalaryText("₹1.2Cr fixed");
    expect(result.min).toBe(12000000);
    expect(result.max).toBe(12000000);
  });

  it("parses an hourly rate", () => {
    const result = parseSalaryText("$25/hr");
    expect(result.period).toBe("Hourly");
    expect(result.min).toBe(25);
  });

  // Regression (Module 10B.1): the period patterns used to carry a single
  // leading `\b` across the whole alternation, so a slash form preceded by a
  // SPACE never matched — Internshala writes stipends exactly that way.
  it.each([
    ["₹ 12,000 - 17,000 /month", "Monthly"],
    ["₹12,000/month", "Monthly"],
    ["$120,000 / year", "Yearly"],
    ["$25 /hr", "Hourly"],
    ["£300 / day", "Daily"],
    ["€900 /week", "Weekly"],
  ])("reads the period from %s", (text, period) => {
    expect(parseSalaryText(text).period).toBe(period);
  });

  it("returns all-null for unparseable text", () => {
    expect(parseSalaryText("Competitive salary")).toEqual({
      min: null,
      max: null,
      currency: null,
      period: null,
    });
  });

  it("returns all-null for empty input", () => {
    expect(parseSalaryText("")).toEqual({ min: null, max: null, currency: null, period: null });
  });

  it("single number produces min === max", () => {
    const result = parseSalaryText("$50,000 per year");
    expect(result.min).toBe(50000);
    expect(result.max).toBe(50000);
  });
});

describe("inferWorkMode", () => {
  it("detects remote", () => {
    expect(inferWorkMode("This is a fully remote role")).toBe("Remote");
  });
  it("detects hybrid (checked before remote)", () => {
    expect(inferWorkMode("Hybrid remote-friendly role")).toBe("Hybrid");
  });
  it("detects onsite", () => {
    expect(inferWorkMode("This is an on-site position")).toBe("Onsite");
  });
  it("returns null when ambiguous", () => {
    expect(inferWorkMode("Great opportunity to grow")).toBeNull();
  });
});

describe("inferEmploymentType", () => {
  it("detects internship before full-time when both words appear", () => {
    expect(inferEmploymentType("Full-Time Internship")).toBe("Internship");
  });
  it("detects contract", () => {
    expect(inferEmploymentType("6-month contract role")).toBe("Contract");
  });
  it("detects part-time", () => {
    expect(inferEmploymentType("Part-time position")).toBe("Part-Time");
  });
  it("returns null when absent", () => {
    expect(inferEmploymentType("Software Engineer")).toBeNull();
  });
});

describe("extractSkillsFromText", () => {
  const vocabulary = ["React", "Node.js", "Python", "C++", "SQL"];

  it("matches vocabulary skills mentioned in text, word-boundary safe", () => {
    const result = extractSkillsFromText(
      "We use React and Python daily. SQL knowledge is a plus.",
      vocabulary,
    );
    expect(result).toEqual(["React", "Python", "SQL"]);
  });

  it("does not false-positive substrings (e.g. SQL inside NoSQL)", () => {
    const result = extractSkillsFromText("Familiarity with NoSQL databases is nice to have", [
      "SQL",
    ]);
    expect(result).toEqual([]);
  });

  it("matches symbol-bearing skill names via substring", () => {
    const result = extractSkillsFromText("Experience with C++ and Node.js required", vocabulary);
    expect(result).toEqual(["Node.js", "C++"]);
  });

  it("returns empty array for empty text", () => {
    expect(extractSkillsFromText("", vocabulary)).toEqual([]);
  });
});
