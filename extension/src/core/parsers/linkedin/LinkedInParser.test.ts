// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { LinkedInParser } from "./LinkedInParser";

/**
 * 2026-09-13 regression: LinkedIn's authenticated /jobs/* DOM frequently has
 * NEITHER a JobPosting JSON-LD block NOR a `<time datetime>` attribute — only
 * the visible "13 hours ago" text in the top card's tertiary line. Before this
 * fix, `postedAt` stayed null in that (common) case, and the Jobs page's
 * freshness filter (`.gte("posted_at", freshnessCutoffIso())`) treats a NULL
 * `posted_at` as "not fresh" — so every such capture silently vanished from
 * the product even though it was captured minutes ago. This fixture has
 * neither structured source on purpose, to prove the DOM-only path now still
 * produces a usable `posted_at`.
 */
function buildJobPageDom(options: { postedAgo: string; location: string }): void {
  document.body.innerHTML = `
    <div id="wrapper">
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <h1 class="job-details-jobs-unified-top-card__job-title">
          <a href="/jobs/view/1234567890/">Senior Backend Engineer</a>
        </h1>
        <div class="job-details-jobs-unified-top-card__company-name">
          <a href="/company/acme-corp/">Acme Corp</a>
        </div>
        <div class="job-details-jobs-unified-top-card__primary-description-container">
          <span>${options.location}</span><span>${options.postedAgo}</span>
        </div>
      </div>
      <div class="description-section">
        <div class="heading-wrapper"><h2>About the job</h2></div>
        <div class="jobs-description__content">
          <p>We are looking for a senior backend engineer to join our growing platform team.</p>
        </div>
      </div>
    </div>
  `;
}

describe("LinkedInParser — posted date derived from relative text when structured sources are absent", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("derives postedAt from the visible '13 hours ago' text when there is no JSON-LD and no <time datetime>", () => {
    buildJobPageDom({ postedAgo: "13 hours ago", location: "Bengaluru, Karnataka, India" });

    const job = new LinkedInParser().tryParse({
      document,
      url: "https://www.linkedin.com/jobs/view/1234567890/",
    });

    expect(job).not.toBeNull();
    expect(job?.postedAgo).toBe("13 hours ago");
    expect(job?.postedAt).not.toBeNull();

    const ageMs = Date.now() - new Date(job?.postedAt as string).getTime();
    // Allow generous slack for test execution time; the key assertion is that
    // it is roughly 13 hours old, not null and not "now".
    expect(ageMs).toBeGreaterThan(12 * 3_600_000);
    expect(ageMs).toBeLessThan(14 * 3_600_000);
  });

  it("prefers a real JSON-LD datePosted over the relative-text fallback when both are present", () => {
    buildJobPageDom({ postedAgo: "13 hours ago", location: "Bengaluru, Karnataka, India" });
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@type": "JobPosting",
      title: "Senior Backend Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      datePosted: "2026-09-01T00:00:00.000Z",
    });
    document.head.appendChild(script);

    const job = new LinkedInParser().tryParse({
      document,
      url: "https://www.linkedin.com/jobs/view/1234567890/",
    });

    expect(job?.postedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("still returns a job with null postedAt (never fabricated) when there is no date signal of any kind", () => {
    buildJobPageDom({ postedAgo: "Reposted", location: "Bengaluru, Karnataka, India" });

    const job = new LinkedInParser().tryParse({
      document,
      url: "https://www.linkedin.com/jobs/view/1234567890/",
    });

    expect(job).not.toBeNull();
    expect(job?.postedAt).toBeNull();
  });
});
