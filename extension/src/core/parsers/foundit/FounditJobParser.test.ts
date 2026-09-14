// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FounditJobParser } from "./FounditJobParser";

/**
 * Defense-in-depth regression: Foundit's JSON-LD reliably includes
 * `datePosted` (unlike Internshala's job pages), but a page that ever omits
 * it must not silently end up with a null `posted_at` when the "Posted N
 * days ago" stat chip is right there in the DOM — the same rule applied to
 * LinkedIn and Internshala in this same fix.
 */
function buildDetailDom(): void {
  document.body.innerHTML = `
    <div id="jdPageHeader">
      <h1>Backend Engineer</h1>
      <a href="/search/acme-india-jobs">Acme India</a>
      <a href="/search/jobs-in-bengaluru">Bengaluru</a>
    </div>
    <ul class="no-scrollbar">
      <li><span>Posted 3 days ago</span></li>
      <li><span>Over 50 applicants</span></li>
    </ul>
  `;
}

function addJsonLd(fields: Record<string, unknown>): void {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme India" },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressCountry: "India" },
    },
    ...fields,
  });
  document.body.appendChild(script);
}

describe("FounditJobParser — relative posted-date fallback when JSON-LD omits datePosted", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("derives postedAt from the 'Posted N days ago' stat chip when datePosted is absent", () => {
    buildDetailDom();
    addJsonLd({});

    const job = new FounditJobParser().tryParse({
      document,
      url: "https://www.foundit.in/job/backend-engineer-acme-india-12345678",
    });

    expect(job).not.toBeNull();
    expect(job?.postedAgo).toBe("3 days ago");
    expect(job?.postedAt).not.toBeNull();
    const ageMs = Date.now() - new Date(job?.postedAt as string).getTime();
    expect(ageMs).toBeGreaterThan(2.9 * 24 * 3_600_000);
    expect(ageMs).toBeLessThan(3.1 * 24 * 3_600_000);
  });

  it("prefers JSON-LD datePosted (DD-MM-YYYY) over the relative-text fallback when present", () => {
    buildDetailDom();
    addJsonLd({ datePosted: "01-09-2026" });

    const job = new FounditJobParser().tryParse({
      document,
      url: "https://www.foundit.in/job/backend-engineer-acme-india-12345678",
    });

    expect(job?.postedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("FounditJobParser — full field extraction", () => {
  const URL = "https://www.foundit.in/job/backend-engineer-acme-india-59142082";

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts title, company, location, description, posted date, source job id, source/platform and logo together", () => {
    document.body.innerHTML = `
      <div id="jdPageHeader">
        <h1>Backend Engineer</h1>
        <a href="/search/acme-india-jobs">Acme India</a>
        <a href="/search/jobs-in-bengaluru">Bengaluru</a>
      </div>
      <div id="jobCompany">
        <img src="https://cdn.foundit.in/logos/acme-india.png" alt="Acme India logo">
      </div>
      <div id="jobDescription">
        <div class="break-words">
          <p>We are hiring a backend engineer to build our payments platform.</p>
        </div>
      </div>
      <ul class="no-scrollbar">
        <li><span>Posted 5 days ago</span></li>
        <li><span>Over 120 applicants</span></li>
      </ul>
    `;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@type": "JobPosting",
      title: "Backend Engineer",
      identifier: { "@type": "PropertyValue", value: "59142082" },
      hiringOrganization: { "@type": "Organization", name: "Acme India" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Bengaluru",
          addressRegion: "Karnataka",
          addressCountry: "India",
        },
      },
      datePosted: "08-09-2026",
      employmentType: "FULL_TIME",
    });
    document.body.appendChild(script);

    const job = new FounditJobParser().tryParse({ document, url: URL });

    expect(job).not.toBeNull();
    // Title / company.
    expect(job?.title).toBe("Backend Engineer");
    expect(job?.companyName).toBe("Acme India");
    // Location — the two India signals that matter for downstream visibility.
    expect(job?.city).toBe("Bengaluru");
    expect(job?.state).toBe("Karnataka");
    expect(job?.country).toBe("India");
    // Description — real content, not empty.
    expect(job?.description).toContain("payments platform");
    expect(job?.descriptionHtml).toContain("payments platform");
    // Posted date — DD-MM-YYYY JSON-LD form parsed correctly.
    expect(job?.postedAt).toBe("2026-09-08T00:00:00.000Z");
    // Source job id / URL identity.
    expect(job?.sourceJobId).toBe("59142082");
    expect(job?.source).toBe("foundit");
    expect(job?.sourceUrl).toBe(URL);
    // Logo.
    expect(job?.companyLogoUrl).toBe("https://cdn.foundit.in/logos/acme-india.png");
  });

  it("falls back to the URL's trailing numeric id when JSON-LD has no identifier", () => {
    document.body.innerHTML = `
      <div id="jdPageHeader">
        <h1>Backend Engineer</h1>
        <a href="/search/acme-india-jobs">Acme India</a>
      </div>
    `;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@type": "JobPosting",
      title: "Backend Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme India" },
    });
    document.body.appendChild(script);

    const job = new FounditJobParser().tryParse({ document, url: URL });
    expect(job?.sourceJobId).toBe("59142082");
  });
});
