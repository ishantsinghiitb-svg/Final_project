import { describe, expect, it } from "vitest";
import { formatLocationDisplay } from "./locationDisplay";

describe("formatLocationDisplay", () => {
  it("removes an empty middle segment — the real production shape", () => {
    expect(formatLocationDisplay("Bengaluru, , India")).toBe("Bengaluru, India");
    expect(formatLocationDisplay("Chennai, , India")).toBe("Chennai, India");
    expect(formatLocationDisplay("London, , United Kingdom")).toBe("London, United Kingdom");
    expect(formatLocationDisplay("Hyderabad, , India")).toBe("Hyderabad, India");
  });

  it("removes a trailing empty segment", () => {
    expect(formatLocationDisplay("Bengaluru,")).toBe("Bengaluru");
    expect(formatLocationDisplay("Bengaluru, ")).toBe("Bengaluru");
  });

  it("removes a leading empty segment", () => {
    expect(formatLocationDisplay(", Bengaluru")).toBe("Bengaluru");
  });

  it("collapses multiple consecutive empty segments", () => {
    expect(formatLocationDisplay("Bengaluru,  , , India")).toBe("Bengaluru, India");
  });

  it("returns '' for input that is entirely empty segments — never invents a value", () => {
    expect(formatLocationDisplay(",,,")).toBe("");
    expect(formatLocationDisplay(", ,  ,")).toBe("");
  });

  it("returns '' for null, undefined, empty, and whitespace-only input", () => {
    expect(formatLocationDisplay(null)).toBe("");
    expect(formatLocationDisplay(undefined)).toBe("");
    expect(formatLocationDisplay("")).toBe("");
    expect(formatLocationDisplay("   ")).toBe("");
  });

  it("passes an already-clean location through completely unchanged", () => {
    expect(formatLocationDisplay("Bangalore")).toBe("Bangalore");
    expect(formatLocationDisplay("Bangalore, Karnataka")).toBe("Bangalore, Karnataka");
    expect(formatLocationDisplay("Redwood City, CA (Hybrid)")).toBe("Redwood City, CA (Hybrid)");
    expect(formatLocationDisplay("Remote")).toBe("Remote");
  });

  it("preserves a legitimate multi-location string split on ';' — parts never merge or reorder", () => {
    const input = "New York, New York, United States; San Francisco, California, United States";
    expect(formatLocationDisplay(input)).toBe(input);
  });

  it("still cleans empty segments WITHIN each ';'-separated part", () => {
    expect(formatLocationDisplay("Bengaluru, , India; Chennai, , India")).toBe(
      "Bengaluru, India; Chennai, India",
    );
  });

  it("does not touch a non-comma separator it doesn't understand — never guesses", () => {
    // A real production value: "or" is not a delimiter this formatter knows,
    // so the string must pass through exactly as captured.
    expect(formatLocationDisplay("New York, NY or San Mateo, CA")).toBe(
      "New York, NY or San Mateo, CA",
    );
  });

  it("trims incidental whitespace around segments without altering their content", () => {
    expect(formatLocationDisplay("Bengaluru ,  Karnataka ,  India")).toBe(
      "Bengaluru, Karnataka, India",
    );
  });
});
