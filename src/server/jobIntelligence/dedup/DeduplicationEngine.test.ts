import { describe, expect, it } from "vitest";
import { resolveDuplicate, type DedupCandidate, type DedupIncoming } from "./DeduplicationEngine";

function candidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    id: "candidate-1",
    source: "linkedin",
    sourceJobId: null,
    fingerprint: null,
    normalizedCompany: "Google",
    normalizedRole: "Product Intern",
    normalizedLocation: "bangalore",
    ...overrides,
  };
}

function incoming(overrides: Partial<DedupIncoming> = {}): DedupIncoming {
  return {
    source: "greenhouse",
    sourceJobId: null,
    fingerprint: "fp-incoming",
    normalizedCompany: "Google",
    normalizedRole: "Product Intern",
    normalizedLocation: "bangalore",
    ...overrides,
  };
}

describe("resolveDuplicate", () => {
  it("tier 1: exact (source, sourceJobId) match wins even when fingerprints differ", () => {
    const c = candidate({ source: "greenhouse", sourceJobId: "gh-1", fingerprint: "fp-other" });
    const result = resolveDuplicate(incoming({ source: "greenhouse", sourceJobId: "gh-1" }), [c]);
    expect(result).toEqual({ tier: "external_id", matchId: "candidate-1" });
  });

  it("does not match tier 1 across different sources with the same sourceJobId", () => {
    const c = candidate({ source: "linkedin", sourceJobId: "gh-1" });
    const result = resolveDuplicate(incoming({ source: "greenhouse", sourceJobId: "gh-1" }), [c]);
    expect(result.tier).not.toBe("external_id");
  });

  it("tier 2: fingerprint match wins when tier 1 misses", () => {
    const c = candidate({ source: "naukri", fingerprint: "fp-shared" });
    const result = resolveDuplicate(incoming({ fingerprint: "fp-shared" }), [c]);
    expect(result).toEqual({ tier: "fingerprint", matchId: "candidate-1" });
  });

  it("tier 3: merges cross-platform when company+role+location match plus a corroborating signal", () => {
    const c = candidate({ postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(incoming({ postedAt: "2026-08-02T00:00:00Z" }), [c]);
    expect(result).toEqual({ tier: "cross_platform", matchId: "candidate-1", confidence: 90 });
  });

  it("tier 3: company+role+location alone (score 80) is NOT enough to merge", () => {
    const c = candidate();
    const result = resolveDuplicate(incoming(), [c]);
    expect(result).toEqual({ tier: "none" });
  });

  it("tier 3: overlapping salary range is a valid second corroborating signal", () => {
    const c = candidate({ salaryMin: 50000, salaryMax: 70000 });
    const result = resolveDuplicate(incoming({ salaryMin: 60000, salaryMax: 80000 }), [c]);
    expect(result).toEqual({ tier: "cross_platform", matchId: "candidate-1", confidence: 90 });
  });

  it("tier 3: non-overlapping salary ranges do not corroborate", () => {
    const c = candidate({ salaryMin: 50000, salaryMax: 60000 });
    const result = resolveDuplicate(incoming({ salaryMin: 90000, salaryMax: 100000 }), [c]);
    expect(result).toEqual({ tier: "none" });
  });

  it("tier 3: a conflicting employment type hard-gates the candidate out", () => {
    const c = candidate({ employmentType: "Contract", postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(
      incoming({ employmentType: "Full-Time", postedAt: "2026-08-01T00:00:00Z" }),
      [c],
    );
    expect(result).toEqual({ tier: "none" });
  });

  it("tier 3: a conflicting work mode hard-gates the candidate out", () => {
    const c = candidate({ workMode: "Onsite", postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(
      incoming({ workMode: "Remote", postedAt: "2026-08-01T00:00:00Z" }),
      [c],
    );
    expect(result).toEqual({ tier: "none" });
  });

  it("tier 3: absence on either side of work mode/employment type is neutral, not disqualifying", () => {
    const c = candidate({ workMode: null, postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(
      incoming({ workMode: "Remote", postedAt: "2026-08-01T00:00:00Z" }),
      [c],
    );
    expect(result.tier).toBe("cross_platform");
  });

  it("tier 3: never attempted without a resolvable location on the incoming payload", () => {
    const c = candidate({ postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(
      incoming({ normalizedLocation: null, postedAt: "2026-08-01T00:00:00Z" }),
      [c],
    );
    expect(result).toEqual({ tier: "none" });
  });

  it("tier 3: a mismatched company never merges regardless of corroborating signals", () => {
    const c = candidate({ normalizedCompany: "Meta", postedAt: "2026-08-01T00:00:00Z" });
    const result = resolveDuplicate(incoming({ postedAt: "2026-08-01T00:00:00Z" }), [c]);
    expect(result).toEqual({ tier: "none" });
  });

  it("returns none for an empty candidate pool", () => {
    expect(resolveDuplicate(incoming(), [])).toEqual({ tier: "none" });
  });

  describe("Module 10B.3: source-ID-aware guard", () => {
    it("same source + same source_job_id resolves to the same canonical job (tier 1, unaffected)", () => {
      const c = candidate({ source: "greenhouse", sourceJobId: "7697979003" });
      const result = resolveDuplicate(
        incoming({ source: "greenhouse", sourceJobId: "7697979003", fingerprint: "fp-shared" }),
        [c],
      );
      expect(result).toEqual({ tier: "external_id", matchId: "candidate-1" });
    });

    it("same source + different verified source_job_ids + same fingerprint does NOT merge (tier 2 blocked)", () => {
      const c = candidate({
        source: "greenhouse",
        sourceJobId: "7701540003",
        fingerprint: "fp-shared",
      });
      const result = resolveDuplicate(
        incoming({ source: "greenhouse", sourceJobId: "7697979003", fingerprint: "fp-shared" }),
        [c],
      );
      // Two distinct canonical jobs: the caller creates a new row for "none".
      expect(result).toEqual({ tier: "none" });
    });

    it("same source + different verified source_job_ids does NOT merge via tier 3 either, even with corroborating signals", () => {
      const c = candidate({
        source: "greenhouse",
        sourceJobId: "7701540003",
        fingerprint: "fp-other",
        postedAt: "2026-08-01T00:00:00Z",
      });
      const result = resolveDuplicate(
        incoming({
          source: "greenhouse",
          sourceJobId: "7697979003",
          fingerprint: "fp-incoming",
          postedAt: "2026-08-02T00:00:00Z",
        }),
        [c],
      );
      expect(result).toEqual({ tier: "none" });
    });

    it("the HighRadius production case: three same-source reqs with identical title/company/location each become their own job", () => {
      const req1 = candidate({ id: "req-1", source: "greenhouse", sourceJobId: "7701545003" });
      const req2 = candidate({ id: "req-2", source: "greenhouse", sourceJobId: "7701540003" });
      const incomingReq3 = incoming({
        source: "greenhouse",
        sourceJobId: "7697979003",
        fingerprint: "fp-implementation-consultant",
      });
      const result = resolveDuplicate(incomingReq3, [req1, req2]);
      expect(result).toEqual({ tier: "none" });
    });

    it("does not block a fingerprint match when the CANDIDATE has no verified source_job_id", () => {
      // A candidate with no captured id (e.g. an older row) can't be proven
      // distinct, so the fallback fingerprint match is preserved.
      const c = candidate({ source: "greenhouse", sourceJobId: null, fingerprint: "fp-shared" });
      const result = resolveDuplicate(
        incoming({ source: "greenhouse", sourceJobId: "7697979003", fingerprint: "fp-shared" }),
        [c],
      );
      expect(result).toEqual({ tier: "fingerprint", matchId: "candidate-1" });
    });

    it("does not block a fingerprint match when the INCOMING posting has no source_job_id", () => {
      const c = candidate({
        source: "greenhouse",
        sourceJobId: "7697979003",
        fingerprint: "fp-shared",
      });
      const result = resolveDuplicate(
        incoming({ source: "greenhouse", sourceJobId: null, fingerprint: "fp-shared" }),
        [c],
      );
      expect(result).toEqual({ tier: "fingerprint", matchId: "candidate-1" });
    });

    it("cross-source fingerprint dedup is completely unaffected (legitimate tier 2 use case)", () => {
      // Different sources — the guard only ever fires when source === incoming.source.
      const c = candidate({ source: "linkedin", sourceJobId: "li-999", fingerprint: "fp-shared" });
      const result = resolveDuplicate(
        incoming({ source: "greenhouse", sourceJobId: "7697979003", fingerprint: "fp-shared" }),
        [c],
      );
      expect(result).toEqual({ tier: "fingerprint", matchId: "candidate-1" });
    });

    it("cross-platform (tier 3) merging across different sources is unaffected", () => {
      const c = candidate({
        source: "naukri",
        sourceJobId: "naukri-1",
        fingerprint: "fp-other",
        postedAt: "2026-08-01T00:00:00Z",
      });
      const result = resolveDuplicate(
        incoming({
          source: "greenhouse",
          sourceJobId: "gh-1",
          fingerprint: "fp-incoming",
          postedAt: "2026-08-02T00:00:00Z",
        }),
        [c],
      );
      expect(result).toEqual({ tier: "cross_platform", matchId: "candidate-1", confidence: 90 });
    });
  });

  it("picks the highest-scoring candidate when multiple qualify", () => {
    const weak = candidate({ id: "weak", postedAt: "2026-08-01T00:00:00Z" });
    const strong = candidate({
      id: "strong",
      postedAt: "2026-08-01T00:00:00Z",
      salaryMin: 60000,
      salaryMax: 80000,
    });
    const result = resolveDuplicate(
      incoming({ postedAt: "2026-08-01T00:00:00Z", salaryMin: 65000, salaryMax: 75000 }),
      [weak, strong],
    );
    expect(result).toEqual({ tier: "cross_platform", matchId: "strong", confidence: 100 });
  });
});
