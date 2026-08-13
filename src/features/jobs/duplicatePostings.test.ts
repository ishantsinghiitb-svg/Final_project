import { describe, expect, it } from "vitest";
import {
  duplicateGroupKey,
  groupExactDuplicatePostings,
  isSameDuplicateGroup,
} from "./duplicatePostings";
import type { GlobalJob } from "@/types";

function job(overrides: Partial<GlobalJob> = {}): GlobalJob {
  return {
    id: "job-1",
    company_id: "company-1",
    company_name: "HighRadius",
    role: "Senior Product Manager",
    location: "Hyderabad, Telangana, India",
    fingerprint: "fp-abc",
    source: "greenhouse",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  } as GlobalJob;
}

describe("duplicateGroupKey", () => {
  it("builds a key from company_id + role + location + fingerprint", () => {
    expect(duplicateGroupKey(job())).toBe(
      "company-1|senior product manager|hyderabad, telangana, india|fp-abc",
    );
  });

  it("is case- and whitespace-insensitive for role and location", () => {
    const a = duplicateGroupKey(
      job({ role: "  Senior Product Manager  ", location: "Hyderabad,  Telangana,  India" }),
    );
    const b = duplicateGroupKey(job());
    expect(a).toBe(b);
  });

  it("returns null when company_id is missing — never groups an unidentified company", () => {
    expect(duplicateGroupKey(job({ company_id: undefined }))).toBeNull();
  });

  it("returns null when fingerprint is missing", () => {
    expect(duplicateGroupKey(job({ fingerprint: null }))).toBeNull();
    expect(duplicateGroupKey(job({ fingerprint: undefined }))).toBeNull();
  });

  it("returns null when role is empty", () => {
    expect(duplicateGroupKey(job({ role: "   " }))).toBeNull();
  });

  it("treats missing and empty location the same way (both normalize to '')", () => {
    const a = duplicateGroupKey(job({ location: undefined }));
    const b = duplicateGroupKey(job({ location: "" }));
    const c = duplicateGroupKey(job({ location: "   " }));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("isSameDuplicateGroup", () => {
  it("is true for two postings sharing every field", () => {
    expect(isSameDuplicateGroup(job({ id: "a" }), job({ id: "b" }))).toBe(true);
  });

  it("is false when the fingerprint differs — even with identical title/company/location", () => {
    // The decisive non-regression case: title+company+location match is NOT
    // sufficient evidence on its own (the investigation's "ambiguous" class).
    expect(
      isSameDuplicateGroup(
        job({ id: "a", fingerprint: "fp-1" }),
        job({ id: "b", fingerprint: "fp-2" }),
      ),
    ).toBe(false);
  });

  it("is false when the location differs", () => {
    expect(
      isSameDuplicateGroup(
        job({ id: "a" }),
        job({ id: "b", location: "Bengaluru, Karnataka, India" }),
      ),
    ).toBe(false);
  });

  it("is false when the company differs", () => {
    expect(isSameDuplicateGroup(job({ id: "a" }), job({ id: "b", company_id: "company-2" }))).toBe(
      false,
    );
  });

  it("is false when either job is missing a groupable field", () => {
    expect(isSameDuplicateGroup(job({ fingerprint: null }), job())).toBe(false);
  });
});

describe("groupExactDuplicatePostings", () => {
  it("groups two postings that share company+role+location+fingerprint (the real HighRadius case)", () => {
    const a = job({ id: "a", source_job_id: "7707536003" });
    const b = job({ id: "b", source_job_id: "7589664003", created_at: "2026-08-02T00:00:00Z" });
    const groups = groupExactDuplicatePostings([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("a"); // earliest created_at
    expect(groups[0].duplicates.map((d) => d.id)).toEqual(["b"]);
  });

  it("picks the EARLIEST created_at as primary regardless of input order", () => {
    const earlier = job({ id: "earlier", created_at: "2026-01-01T00:00:00Z" });
    const later = job({ id: "later", created_at: "2026-06-01T00:00:00Z" });
    const forward = groupExactDuplicatePostings([later, earlier]);
    const reversed = groupExactDuplicatePostings([earlier, later]);
    expect(forward[0].primary.id).toBe("earlier");
    expect(reversed[0].primary.id).toBe("earlier");
  });

  it("breaks a created_at tie deterministically by id", () => {
    const a = job({ id: "b-job", created_at: "2026-01-01T00:00:00Z" });
    const b = job({ id: "a-job", created_at: "2026-01-01T00:00:00Z" });
    const groups = groupExactDuplicatePostings([a, b]);
    expect(groups[0].primary.id).toBe("a-job");
  });

  it("does NOT group merely because title/company/location match — fingerprint must also agree", () => {
    const a = job({ id: "a", fingerprint: "fp-1" });
    const b = job({ id: "b", fingerprint: "fp-2" });
    const groups = groupExactDuplicatePostings([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.duplicates.length === 0)).toBe(true);
  });

  it("leaves an ungroupable job (no company_id) as its own singleton", () => {
    const a = job({ id: "a", company_id: undefined });
    const b = job({ id: "b", company_id: undefined });
    const groups = groupExactDuplicatePostings([a, b]);
    // Two DIFFERENT jobs with no company_id must never collapse into one card.
    expect(groups).toHaveLength(2);
  });

  it("handles a group of three (Druva 'Senior Staff Software Engineer' shape)", () => {
    const jobs = [
      job({ id: "1", created_at: "2026-03-01T00:00:00Z" }),
      job({ id: "2", created_at: "2026-02-01T00:00:00Z" }),
      job({ id: "3", created_at: "2026-04-01T00:00:00Z" }),
    ];
    const groups = groupExactDuplicatePostings(jobs);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("2");
    expect(groups[0].duplicates.map((d) => d.id).sort()).toEqual(["1", "3"]);
  });

  it("preserves list order: a group appears at the position of its first-seen member", () => {
    const other = job({ id: "other", role: "Designer", fingerprint: "fp-other" });
    const dupA = job({ id: "dupA", created_at: "2026-01-01T00:00:00Z" });
    const dupB = job({ id: "dupB", created_at: "2026-01-02T00:00:00Z" });
    const groups = groupExactDuplicatePostings([dupA, other, dupB]);
    expect(groups.map((g) => g.primary.id)).toEqual(["dupA", "other"]);
  });

  it("never drops or duplicates a job — every input job appears exactly once across all groups", () => {
    const jobs = [
      job({ id: "a" }),
      job({ id: "b" }),
      job({ id: "c", fingerprint: "fp-different" }),
      job({ id: "d", company_id: undefined }),
    ];
    const groups = groupExactDuplicatePostings(jobs);
    const seen = groups.flatMap((g) => [g.primary.id, ...g.duplicates.map((d) => d.id)]);
    expect(seen.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupExactDuplicatePostings([])).toEqual([]);
  });

  it("does not mutate the input array or its job objects", () => {
    const a = job({ id: "a" });
    const b = job({ id: "b" });
    const input = [a, b];
    const snapshot = JSON.stringify(input);
    groupExactDuplicatePostings(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
