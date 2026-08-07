import { describe, expect, it } from "vitest";
import { normalizeParsedJob } from "./index";
import { generateFingerprint } from "@/features/jobs/fingerprint";
import type { ParsedJobPosting } from "../types";

function makePosting(overrides: Partial<ParsedJobPosting> = {}): ParsedJobPosting {
  return {
    source: "test-platform",
    sourceJobId: "abc123",
    companyName: "Google Careers",
    role: "Product Internship",
    location: "Bangalore, India",
    city: "Bangalore",
    parserVersion: "test-1",
    ...overrides,
  };
}

describe("normalizeParsedJob", () => {
  it("attaches normalized company/role/location without mutating the originals", async () => {
    const parsed = makePosting();
    const normalized = await normalizeParsedJob(parsed);

    expect(normalized.companyName).toBe("Google Careers");
    expect(normalized.role).toBe("Product Internship");
    expect(normalized.normalizedCompany).toBe("Google");
    expect(normalized.normalizedRole).toBe("Product Intern");
    expect(normalized.normalizedLocation).toBe("bangalore");
  });

  it("computes a fingerprint byte-identical to the shared extension-mirroring helper", async () => {
    const parsed = makePosting();
    const normalized = await normalizeParsedJob(parsed);
    const expected = await generateFingerprint(
      parsed.role,
      parsed.companyName,
      parsed.location ?? null,
    );
    expect(normalized.fingerprint).toBe(expected);
  });

  it("normalizedLocation is null when neither city nor location is present", async () => {
    const parsed = makePosting({ location: null, city: null });
    const normalized = await normalizeParsedJob(parsed);
    expect(normalized.normalizedLocation).toBeNull();
  });
});
