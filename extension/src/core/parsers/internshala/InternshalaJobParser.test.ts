// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InternshalaJobParser } from "./InternshalaJobParser";
import { freshnessCutoffIso } from "../../../../../src/features/jobs/postedWindow";

/**
 * 2026-09-13 regression, two related bugs on the same page shape:
 *
 * 1. Internshala job/internship pages don't always carry a JobPosting
 *    JSON-LD `datePosted` (see this class's own header comment), and the
 *    parser never converted the reliably-present "Posted N days ago" chip
 *    into an absolute date — so `posted_at` stayed null and the Jobs page's
 *    freshness filter hid the row.
 * 2. The parser never populated `country`, so a posting whose own location
 *    text is just a bare city name ("Bengaluru") or "Work From Home" carried
 *    no India signal the shared discovery filter could recognize, even
 *    though Internshala is an India-only platform (the server crawler's own
 *    InternshalaAdapter already makes this same inference).
 */
function buildDetailDom(options: { locationText: string; postedText: string }): void {
  document.body.innerHTML = `
    <div id="details_container">
      <div class="detail_view">
        <div class="individual_internship" internshipid="99887766">
          <h1 class="heading_title">Marketing Intern</h1>
          <div class="company_name"><a href="/company/acme-startup">Acme Startup</a></div>
          <div id="location_names">${options.locationText}</div>
        </div>
      </div>
    </div>
    <div class="tags_container_outer">
      <span class="status-success">${options.postedText}</span>
    </div>
  `;
}

const DETAIL_URL =
  "https://internshala.com/internship/detail/marketing-intern-in-bengaluru-at-acme1234/99887766";

describe("InternshalaJobParser — country inference and relative posted-date fallback", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("sets country to India from a bare city location with no country word in it", () => {
    buildDetailDom({ locationText: "Bengaluru", postedText: "Posted 2 days ago" });

    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });

    expect(job).not.toBeNull();
    expect(job?.location).toBe("Bengaluru");
    expect(job?.country).toBe("India");
  });

  it("sets country to India even for a Work From Home posting", () => {
    buildDetailDom({ locationText: "Work from home", postedText: "Posted just now" });

    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });

    expect(job?.country).toBe("India");
  });

  it("sets country to India for Mumbai", () => {
    buildDetailDom({ locationText: "Mumbai", postedText: "Posted 1 day ago" });
    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });
    expect(job?.country).toBe("India");
  });

  it("sets country to India for Delhi", () => {
    buildDetailDom({ locationText: "Delhi", postedText: "Posted 1 day ago" });
    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });
    expect(job?.country).toBe("India");
  });

  it("still sets country to India even for a location string naming a foreign place — this is a deliberate platform-level inference, not per-posting geography", () => {
    // Internshala only ever lists Indian postings (verified by product scope,
    // and mirrored from the server crawler's own InternshalaAdapter, which
    // makes the exact same unconditional inference — see its `country` field).
    // The parser does not, and should not, try to detect a foreign location
    // from free text on a platform where one is never expected to exist. This
    // test documents that behavior explicitly rather than leaving it implicit:
    // if Internshala ever legitimately listed a foreign posting, this would
    // need a real fix (reading a genuine foreign signal from the page), not a
    // silent location-text keyword scan added here.
    buildDetailDom({ locationText: "New York, USA", postedText: "Posted 1 day ago" });
    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });
    expect(job?.location).toBe("New York, USA");
    expect(job?.country).toBe("India");
  });

  it("leaves country null when there is no location at all (never guessed)", () => {
    document.body.innerHTML = `
      <div id="details_container">
        <div class="detail_view">
          <div class="individual_internship" internshipid="99887766">
            <h1 class="heading_title">Marketing Intern</h1>
            <div class="company_name"><a href="/company/acme-startup">Acme Startup</a></div>
          </div>
        </div>
      </div>
    `;

    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });
    expect(job?.location).toBeNull();
    expect(job?.country).toBeNull();
  });

  it("derives postedAt from 'Posted N days ago' when JSON-LD has no datePosted", () => {
    buildDetailDom({ locationText: "Bengaluru", postedText: "Posted 2 days ago" });

    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });

    expect(job?.postedAgo).toBe("2 days ago");
    expect(job?.postedAt).not.toBeNull();
    const ageMs = Date.now() - new Date(job?.postedAt as string).getTime();
    expect(ageMs).toBeGreaterThan(1.9 * 24 * 3_600_000);
    expect(ageMs).toBeLessThan(2.1 * 24 * 3_600_000);
  });

  it("prefers JSON-LD datePosted over the relative-text fallback when both are present", () => {
    buildDetailDom({ locationText: "Bengaluru", postedText: "Posted 2 days ago" });
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@type": "JobPosting",
      title: "Marketing Intern",
      hiringOrganization: { "@type": "Organization", name: "Acme Startup" },
      datePosted: "2026-09-01T00:00:00.000Z",
    });
    document.body.appendChild(script);

    const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });
    expect(job?.postedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("InternshalaJobParser — posted-date boundary against the real 30-day freshness cutoff", () => {
  // A fixed instant for the whole block, so "N days ago" and the freshness
  // cutoff are computed against the exact same `now` — no wall-clock skew,
  // no flakiness at the boundary. `freshnessCutoffIso` is imported directly
  // from its real production module (src/features/jobs/postedWindow.ts) so
  // this test is checked against the ACTUAL cutoff the Jobs page uses, not a
  // hand-copied duplicate of the 30-day constant that could silently drift.
  // This only crosses into `src/` inside a test file (never shipped in the
  // extension bundle), so it does not reintroduce the app-dependency
  // extension parsers otherwise avoid.
  const NOW = new Date("2026-09-13T12:00:00.000Z");
  const CUTOFF = freshnessCutoffIso(NOW);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function isFreshEnoughToBeVisible(postedAt: string | null): boolean {
    return postedAt !== null && postedAt >= CUTOFF;
  }

  it.each([
    ["Posted 2 days ago", 2, true],
    ["Posted 10 days ago", 10, true],
    ["Posted 30 days ago", 30, true], // inclusive boundary — still fresh
    ["Posted 31 days ago", 31, false],
  ])(
    "'%s' -> ~%i day(s) old, freshness-visible=%s",
    (postedText, expectedDays, expectedVisible) => {
      buildDetailDom({ locationText: "Bengaluru", postedText: postedText as string });

      const job = new InternshalaJobParser().tryParse({ document, url: DETAIL_URL });

      expect(job?.postedAt).not.toBeNull();
      const ageMs = NOW.getTime() - new Date(job?.postedAt as string).getTime();
      const ageDays = ageMs / (24 * 3_600_000);
      expect(ageDays).toBeCloseTo(expectedDays as number, 1);
      expect(isFreshEnoughToBeVisible(job?.postedAt ?? null)).toBe(expectedVisible);
    },
  );
});
