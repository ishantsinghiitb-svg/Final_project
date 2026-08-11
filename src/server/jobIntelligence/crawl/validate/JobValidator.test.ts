import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParsedJobPosting } from "../../types";
import { validateParsedJob } from "./JobValidator";

function job(overrides: Partial<ParsedJobPosting> = {}): ParsedJobPosting {
  return {
    source: "greenhouse",
    sourceJobId: "123",
    sourceUrl: "https://boards.test/jobs/123",
    companyName: "Acme",
    role: "Software Engineer",
    parserVersion: "test-1.0.0",
    ...overrides,
  };
}

function expectValid(input: ParsedJobPosting) {
  const result = validateParsedJob(input);
  if (!result.ok) throw new Error(`expected valid, got: ${result.reason}`);
  return result;
}

function expectInvalid(input: ParsedJobPosting) {
  const result = validateParsedJob(input);
  if (result.ok) throw new Error("expected invalid");
  return result;
}

describe("required identity", () => {
  it("accepts a well-formed posting", () => {
    expect(expectValid(job()).job.role).toBe("Software Engineer");
  });

  it("rejects an empty role", () => {
    expect(expectInvalid(job({ role: "  " })).reason).toMatch(/role/i);
  });

  it("rejects an empty company", () => {
    expect(expectInvalid(job({ companyName: "" })).reason).toMatch(/company/i);
  });

  it("rejects a one-character role", () => {
    expect(expectInvalid(job({ role: "X" })).reason).toMatch(/too short/i);
  });

  it("rejects a role long enough to be a whole page section", () => {
    expect(expectInvalid(job({ role: "x".repeat(500) })).reason).toMatch(/page section/i);
  });

  it.each(["Jobs", "Careers", "Apply now", "View job", "Untitled", "Test", "N/A", "---"])(
    "rejects navigation text %s as a role",
    (role) => {
      expect(expectInvalid(job({ role })).reason).toMatch(/navigation text|too short/i);
    },
  );

  it("keeps a real title that merely contains a chrome word", () => {
    expect(expectValid(job({ role: "Engineering Manager, Search" })).job.role).toBe(
      "Engineering Manager, Search",
    );
    expect(expectValid(job({ role: "Test Automation Engineer" })).job.role).toBeTruthy();
  });

  it.each(["Confidential", "Undisclosed", "Company", "Unknown", "N/A"])(
    "rejects placeholder employer %s",
    (companyName) => {
      expect(expectInvalid(job({ companyName })).reason).toMatch(/placeholder/i);
    },
  );

  it("rejects residual HTML in the role or company", () => {
    expect(expectInvalid(job({ role: "<div>Engineer</div>" })).reason).toMatch(/HTML/i);
    expect(expectInvalid(job({ companyName: "<span>Acme</span>" })).reason).toMatch(/HTML/i);
  });

  it("rejects a posting with neither a source id nor a source URL", () => {
    expect(expectInvalid(job({ sourceJobId: null, sourceUrl: null })).reason).toMatch(/deduped/i);
  });

  it("accepts a posting with only a source URL", () => {
    expect(expectValid(job({ sourceJobId: null })).job.sourceUrl).toBeTruthy();
  });

  it("rejects a missing source tag or parser version", () => {
    expect(expectInvalid(job({ source: "" })).reason).toMatch(/source/i);
    expect(expectInvalid(job({ parserVersion: "" })).reason).toMatch(/parser/i);
  });

  it("trims the accepted role and company", () => {
    const result = expectValid(job({ role: "  Engineer  ", companyName: "  Acme  " }));
    expect(result.job.role).toBe("Engineer");
    expect(result.job.companyName).toBe("Acme");
  });

  it("reports every fatal issue at once", () => {
    const result = expectInvalid(job({ role: "", companyName: "" }));
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("never mutates the input", () => {
    const input = job({ role: "  Engineer  " });
    validateParsedJob(input);
    expect(input.role).toBe("  Engineer  ");
  });
});

describe("description sanitizing", () => {
  it("drops a description that still contains markup", () => {
    const result = expectValid(job({ description: "<p>Still markup</p>" }));
    expect(result.job.description).toBeNull();
    expect(result.sanitized.map((issue) => issue.field)).toContain("description");
  });

  it("keeps clean text with punctuation that merely looks tag-ish", () => {
    const result = expectValid(job({ description: "Use a < b comparisons and >= operators." }));
    expect(result.job.description).toBe("Use a < b comparisons and >= operators.");
  });

  it("truncates an enormous description rather than rejecting the posting", () => {
    const result = expectValid(job({ description: "a".repeat(70_000) }));
    expect(result.job.description).toHaveLength(60_000);
    expect(result.sanitized[0].message).toMatch(/Truncated/);
  });
});

describe("URL sanitizing", () => {
  it("drops non-http URLs", () => {
    const result = expectValid(
      job({ companyUrl: "mailto:a@b.test", companyLogoUrl: "data:image/png;base64,xx" }),
    );
    expect(result.job.companyUrl).toBeNull();
    expect(result.job.companyLogoUrl).toBeNull();
    expect(result.sanitized).toHaveLength(2);
  });

  it("keeps valid http(s) URLs", () => {
    const result = expectValid(job({ url: "http://a.test/x", companyUrl: "https://b.test" }));
    expect(result.job.url).toBe("http://a.test/x");
    expect(result.job.companyUrl).toBe("https://b.test");
  });
});

describe("salary sanitizing", () => {
  it("swaps a reversed range", () => {
    const result = expectValid(job({ salaryMin: 200000, salaryMax: 100000 }));
    expect(result.job.salaryMin).toBe(100000);
    expect(result.job.salaryMax).toBe(200000);
    expect(result.sanitized[0].message).toMatch(/Swapped/);
  });

  it("drops an implausible salary", () => {
    const result = expectValid(job({ salaryMin: -5, salaryMax: 1e15 }));
    expect(result.job.salaryMin).toBeNull();
    expect(result.job.salaryMax).toBeNull();
  });

  it("keeps a normal range untouched", () => {
    const result = expectValid(job({ salaryMin: 100000, salaryMax: 150000 }));
    expect(result.job.salaryMin).toBe(100000);
    expect(result.sanitized).toHaveLength(0);
  });

  it("ignores NaN", () => {
    expect(expectValid(job({ salaryMin: Number.NaN })).job.salaryMin).toBeNull();
  });
});

describe("date sanitizing", () => {
  it("normalizes a valid date to ISO", () => {
    expect(expectValid(job({ postedAt: "2026-08-01" })).job.postedAt).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("drops an unparseable date", () => {
    const result = expectValid(job({ postedAt: "sometime" }));
    expect(result.job.postedAt).toBeNull();
    expect(result.sanitized[0].message).toMatch(/not a parseable date/);
  });

  it("drops a posted date implausibly far in the future", () => {
    expect(expectValid(job({ postedAt: "2099-01-01" })).job.postedAt).toBeNull();
  });

  it("sanitizes (nulls), but does NOT reject, an implausibly old posting", () => {
    // MAX_PAST_POSTED_MS (10 years) is the ONLY age-based date rule left. It
    // drops the field and keeps the posting — never rejects the whole job.
    const result = expectValid(job({ postedAt: "1999-01-01" }));
    expect(result.job.postedAt).toBeNull();
    expect(result.sanitized.some((s) => s.field === "postedAt")).toBe(true);
  });

  // ── Module 10B.2 correction (2026-08-09) ──────────────────────────────────
  // A validator-level "reject if posted_at > 30 days old" rule was added and
  // then removed: a live Dry Run against the real registry showed it
  // rejecting 2,702 of 3,890 discovered postings (69%) — real, valid jobs
  // from Databricks/OpenAI/Stripe/etc. whose ATS req simply stayed open past
  // 30 days, which is normal. The 30-day ACTIVE window is enforced by
  // `last_seen_at` (stamped at import time, advanced on every re-crawl) at
  // the DISCOVERY boundary, never by `posted_at` at ingestion. These tests
  // pin that `posted_at` age can no longer reject a posting, at any age.
  it.each([1, 30, 60, 90, 180, 400, 1000, 3126])(
    "does NOT reject a posting solely because it was posted %i day(s) ago",
    (daysAgo) => {
      const postedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
      const result = expectValid(job({ postedAt }));
      // Preserved verbatim: posted_at is historical fact, never rewritten by
      // an ingestion-time freshness judgement.
      expect(result.job.postedAt).toBe(postedAt);
    },
  );

  it("preserves an 8-year-old (but plausible) posted_at exactly as extracted", () => {
    // The real worst case observed in the audit: a SmartRecruiters
    // `releasedDate` from a reused/evergreen requisition, 3,126 days old.
    // Still under the 10-year implausibility threshold, so it is real data,
    // not a parser artifact — and must survive untouched.
    const eightYearsAgo = new Date(Date.now() - 3126 * 24 * 3600 * 1000).toISOString();
    const result = expectValid(job({ postedAt: eightYearsAgo }));
    expect(result.job.postedAt).toBe(eightYearsAgo);
    expect(result.sanitized).toHaveLength(0);
  });

  it("the word 'active window' never appears as a REJECT reason any more", () => {
    // Locks the fix: no posted_at value, however old (short of the 10-year
    // implausibility line, which sanitizes rather than rejects), can put the
    // posting in the `ok: false` branch.
    for (const daysAgo of [31, 45, 90, 365, 3000]) {
      const postedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
      const result = validateParsedJob(job({ postedAt }));
      expect(result.ok).toBe(true);
    }
  });

  it("NEVER treats a missing posted date as stale", () => {
    // Many real sources omit the date, and every extension-captured job
    // predates this rule — treating unknown age as "too old" would empty the
    // Jobs page.
    expect(expectValid(job({ postedAt: null })).job.postedAt).toBeNull();
    expect(expectValid(job({})).job.role).toBeTruthy();
  });

  it("does not treat an unparseable date as stale — it sanitizes it instead", () => {
    const result = expectValid(job({ postedAt: "sometime last spring" }));
    expect(result.job.postedAt).toBeNull();
  });

  it("allows a future expiry date — that is what an expiry IS", () => {
    const nextYear = new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString();
    expect(expectValid(job({ expiryDate: nextYear })).job.expiryDate).toBe(nextYear);
  });
});

describe("Module 10B.2: posted_at is never a fatal ingestion reason (regression)", () => {
  // A focused, explicit lock separate from "date sanitizing" above: even a
  // posting that fails EVERY OTHER optional check still isn't rejected for
  // its date. Guards against the age check being reintroduced anywhere else
  // in the fatal-issue path.
  it("a posting with a stale date but otherwise perfect fields imports cleanly", () => {
    const staleButValid = job({
      postedAt: new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString(),
      role: "Senior Backend Engineer",
      companyName: "Databricks",
    });
    const result = validateParsedJob(staleButValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job.role).toBe("Senior Backend Engineer");
      expect(result.job.companyName).toBe("Databricks");
    }
  });

  it("no `fatal`/reject path in the validator ever names the field 'postedAt'", () => {
    // A structural check on the source rather than behaviour: confirms the
    // fatal-rejection block was removed, not merely made unreachable.
    const source = readFileSync(
      fileURLToPath(new URL("./JobValidator.ts", import.meta.url)),
      "utf8",
    );
    const fatalSection = source.slice(0, source.indexOf("── Sanitizable fields"));
    expect(fatalSection).not.toMatch(/field:\s*"postedAt"/);
  });
});

describe("list cleaning", () => {
  it("trims, de-duplicates and drops empties", () => {
    const result = expectValid(job({ skills: ["  Go ", "Go", "", "Rust"] }));
    expect(result.job.skills).toEqual(["Go", "Rust"]);
  });

  it("caps very long lists", () => {
    const result = expectValid(job({ skills: Array.from({ length: 200 }, (_, i) => `s${i}`) }));
    expect(result.job.skills).toHaveLength(100);
  });

  it("turns an all-empty list into null", () => {
    expect(expectValid(job({ skills: ["", "   "] })).job.skills).toBeNull();
  });

  it("leaves absent lists as null", () => {
    expect(expectValid(job()).job.skills).toBeNull();
  });

  it("drops absurdly long individual entries", () => {
    expect(expectValid(job({ skills: ["Go", "x".repeat(600)] })).job.skills).toEqual(["Go"]);
  });
});
