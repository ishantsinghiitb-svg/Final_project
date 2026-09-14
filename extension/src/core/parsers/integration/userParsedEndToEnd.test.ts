// @vitest-environment jsdom
//
// ── End-to-end simulation: extension capture -> Jobs page visibility ──
//
// Traces the REAL production code for every stage except the two that
// genuinely require a live browser or a live Postgres instance:
//
//   page capture        -> real parser (LinkedInParser / InternshalaJobParser /
//                           FounditJobParser), fed a jsdom fixture
//   parser output        -> real UniversalJob
//   normalized job        -> real JobNormalizer.normalize
//   (validation)          -> real JobValidator.validate
//   API request           -> real upsertGlobalJob (extension/src/shared/supabase/jobs-api.ts),
//                           with only the Supabase client's `.rpc` mocked to
//                           CAPTURE the exact payload sent, the same mocking
//                           shape jobs-api.test.ts already uses
//   upsert_global_job     -> SIMULATED: `simulateInsertBranch` mirrors, field
//                           for field, the RPC's INSERT branch (a fresh
//                           capture always takes INSERT, never the UPDATE/
//                           COALESCE branch) as read directly from
//                           supabase/migrations/20260901000001_module13_secure_global_job_writes.sql.
//                           This is the one stage with no live Postgres
//                           available in this environment; every field this
//                           simulation touches was verified against that
//                           migration's literal SQL, not assumed.
//   global_jobs row       -> the SimulatedRow produced above
//   applyDiscoveryVisibility -> `wouldBeVisible` mirrors, clause for clause,
//                           the real predicate in
//                           src/repositories/JobRepository.ts#applyDiscoveryVisibility,
//                           built from the SAME production regex/constant
//                           sources (src/features/jobs/indiaPlaces.ts,
//                           src/features/jobs/postedWindow.ts) rather than a
//                           hand-copied duplicate that could drift
//   Jobs page visibility  -> the boolean `wouldBeVisible` returns
//
// No canonical gate is bypassed anywhere in this file: nothing here changes
// what counts as visible, it only exercises the real one against a
// realistic captured payload.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UniversalJob } from "../types";
import { JobNormalizer } from "../../normalization/JobNormalizer";
import { JobValidator } from "../../validation/JobValidator";
import { LinkedInParser } from "../linkedin/LinkedInParser";
import { InternshalaJobParser } from "../internshala/InternshalaJobParser";
import { FounditJobParser } from "../foundit/FounditJobParser";
import {
  exactMatchAlternation,
  indiaCityPattern,
  indiaStatePattern,
} from "../../../../../src/features/jobs/indiaPlaces";
import { freshnessCutoffIso } from "../../../../../src/features/jobs/postedWindow";

// Explicit parameter types (even though the stub body ignores them) so
// `rpc.mock.calls[n]` is naturally typed as `[string, { payload: ... }]`
// instead of `[]` — avoids the unsound `as [...]` cast down in
// `runPipeline`, which TypeScript otherwise (rightly) flags as a type it
// cannot verify actually overlaps.
const rpc = vi.fn(async (_fn: string, _args: { payload: Record<string, unknown> }) => ({
  data: { id: "job-1" },
  error: null,
}));
vi.mock("../../../shared/supabase/client", () => ({ getSupabaseClient: () => ({ rpc }) }));

// Imported after the mock so it picks up the mocked client, same pattern as
// extension/src/shared/supabase/jobs-api.test.ts.
const { upsertGlobalJob } = await import("../../../shared/supabase/jobs-api");

const NOW = new Date("2026-09-13T12:00:00.000Z");

// ── Simulated RPC INSERT branch (see file header) ──

type SimulatedRow = {
  isManualImport: boolean;
  isClosed: boolean;
  expiryDate: string | null;
  postedAt: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

function simulateInsertBranch(payload: Record<string, unknown>): SimulatedRow {
  return {
    isManualImport: Boolean((payload.is_manual_import as boolean | null | undefined) ?? false),
    isClosed: Boolean((payload.is_closed as boolean | null | undefined) ?? false),
    expiryDate: (payload.expiry_date as string | null | undefined) ?? null,
    postedAt: (payload.posted_at as string | null | undefined) ?? null,
    location: (payload.location as string | null | undefined) ?? null,
    city: (payload.city as string | null | undefined) ?? null,
    state: (payload.state as string | null | undefined) ?? null,
    country: (payload.country as string | null | undefined) ?? null,
  };
}

// ── Simulated applyDiscoveryVisibility (see file header) ──

// Mirrors indiaDiscoveryFilter's own private COUNTRY_TOKENS
// (src/features/jobs/indiaPlaces.ts) — not exported, so duplicated here with
// this pointer so the two are kept in sync deliberately, not by accident.
const COUNTRY_TOKENS = ["india", "in", "bharat"];

function matchesIndiaDiscoveryFilter(row: SimulatedRow): boolean {
  const countryPattern = new RegExp(exactMatchAlternation(COUNTRY_TOKENS), "i");
  if (row.country && countryPattern.test(row.country)) return true;
  if (row.location && /india/i.test(row.location)) return true;
  if (row.city && /india/i.test(row.city)) return true;
  if (row.city && new RegExp(indiaCityPattern(), "i").test(row.city)) return true;
  if (row.state && new RegExp(indiaStatePattern(), "i").test(row.state)) return true;
  return false;
}

function wouldBeVisible(row: SimulatedRow, now: Date): boolean {
  if (row.isManualImport) return false;
  if (row.isClosed) return false;
  if (row.expiryDate && new Date(row.expiryDate).getTime() < now.getTime()) return false;
  if (!row.postedAt) return false;
  if (row.postedAt < freshnessCutoffIso(now)) return false;
  return matchesIndiaDiscoveryFilter(row);
}

// ── Pipeline runner ──

async function runPipeline(job: UniversalJob): Promise<{
  visible: boolean;
  row: SimulatedRow;
  payload: Record<string, unknown>;
}> {
  const normalized = JobNormalizer.normalize(job);
  const validation = JobValidator.validate(normalized);
  expect(validation.valid).toBe(true);

  await upsertGlobalJob(normalized);
  const lastCall = rpc.mock.calls[rpc.mock.calls.length - 1];
  expect(lastCall[0]).toBe("upsert_global_job");
  const payload = lastCall[1].payload;

  const row = simulateInsertBranch(payload);
  return { visible: wouldBeVisible(row, NOW), row, payload };
}

beforeEach(() => {
  rpc.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Full isolation between fixtures. `BaseParser.readJsonLd` queries
  // `document.querySelectorAll('script[type="application/ld+json"]')`
  // document-wide (not scoped to <body>), and the LinkedIn fixture builder
  // appends its JSON-LD to <head> while the others append to <body> — so
  // clearing only one of the two would leak a stale JSON-LD block from one
  // platform's test into the next platform's fixture.
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

// ── LinkedIn ──

type LinkedInFixtureOptions = {
  city: string;
  state?: string;
  country: string;
  postedAgo: string;
  /** Omitted by default so the postedAt fallback (via postedAgo) is exercised, matching the real regression scenario. */
  datePosted?: string;
};

/**
 * Supplies city/state/country via JSON-LD `jobLocation.address` — the
 * PRIMARY, structured source `LinkedInParser.readLocationParts` reads first
 * (see LinkedInParser.ts) — rather than via the free-text top-card line.
 * `parseTopCard`'s own DOM-only location fallback needs a real "·"-joined
 * line to work (exactly as LinkedIn renders it live) and is exercised
 * directly, in isolation, by LinkedInParser.test.ts; reproducing that exact
 * joined-line shape here would test the same fallback twice for no added
 * value, when what this file needs is a reliable, realistic way to control
 * city/state/country per scenario. `postedAgo` still comes from the DOM
 * (structured leaf `<span>`s, read via `parsePrimaryDescriptionSegments`),
 * which is the actual mechanism this fix's postedAt fallback depends on.
 */
function buildLinkedInDom(options: LinkedInFixtureOptions): void {
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
          <span>${options.postedAgo}</span>
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
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Senior Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: options.city,
        addressRegion: options.state ?? null,
        addressCountry: options.country,
      },
    },
    ...(options.datePosted ? { datePosted: options.datePosted } : {}),
  });
  document.head.appendChild(script);
}

function parseLinkedInFixture(options: LinkedInFixtureOptions): UniversalJob {
  document.head.innerHTML = "";
  buildLinkedInDom(options);
  const job = new LinkedInParser().tryParse({
    document,
    url: "https://www.linkedin.com/jobs/view/1234567890/",
  });
  expect(job).not.toBeNull();
  return job as UniversalJob;
}

describe("End-to-end: LinkedIn user-parsed job -> Jobs page visibility", () => {
  it("an India, fresh, valid job becomes visible", async () => {
    const job = parseLinkedInFixture({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postedAgo: "13 hours ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("India");
    expect(visible).toBe(true);
  });

  it("a stale job (posted 45 days ago) stays hidden", async () => {
    const job = parseLinkedInFixture({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postedAgo: "45 days ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).not.toBeNull();
    expect(visible).toBe(false);
  });

  it("a clearly foreign job (London, United Kingdom) stays hidden", async () => {
    const job = parseLinkedInFixture({
      city: "London",
      state: "England",
      country: "United Kingdom",
      postedAgo: "1 hour ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("United Kingdom");
    expect(visible).toBe(false);
  });

  it("a job with no parseable posted date at all stays hidden", async () => {
    const job = parseLinkedInFixture({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postedAgo: "Reposted",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).toBeNull();
    expect(visible).toBe(false);
  });

  it("FINDING: a US job whose city name happens to contain the substring 'india' (Indianapolis, Indiana) is NOT reliably hidden", async () => {
    // This is a genuine, pre-existing limitation of the DISPLAY-side filter
    // (indiaDiscoveryFilter), not something introduced or missed by the
    // Issue 1/2 fixes, and it applies identically to every source (crawler
    // rows included) because the filter is shared. It exists because the
    // filter is a permissive OR of independent substring/exact matches with
    // no two-sided "reject if a foreign signal is ALSO present" logic — unlike
    // the ingestion-side isIndiaJobLocation classifier, which IS two-sided but
    // is never invoked on this write path (the extension has no ingestion
    // gate at all; see the investigation report). Documented here rather than
    // silently patched: fixing it would mean changing shared eligibility
    // logic, which is a third, distinct change outside the two approved
    // issues and needs its own explicit sign-off.
    const job = parseLinkedInFixture({
      city: "Indianapolis",
      state: "Indiana",
      country: "United States",
      postedAgo: "1 hour ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("United States");
    expect(row.city).toBe("Indianapolis");
    // Documents the ACTUAL current behavior — this is `true`, not `false`.
    expect(visible).toBe(true);
  });
});

// ── Internshala ──

function buildInternshalaDom(options: {
  locationText: string | null;
  postedText: string | null;
}): void {
  document.body.innerHTML = `
    <div id="details_container">
      <div class="detail_view">
        <div class="individual_internship" internshipid="99887766">
          <h1 class="heading_title">Marketing Intern</h1>
          <div class="company_name"><a href="/company/acme-startup">Acme Startup</a></div>
          ${options.locationText ? `<div id="location_names">${options.locationText}</div>` : ""}
        </div>
      </div>
      <div class="internship_details">
        <div class="about_heading">About the internship</div>
        <div class="text-container">
          <p>Join our marketing team to run campaigns across digital channels.</p>
        </div>
      </div>
    </div>
    ${
      options.postedText
        ? `<div class="tags_container_outer"><span class="status-success">${options.postedText}</span></div>`
        : ""
    }
  `;
}

const INTERNSHALA_URL =
  "https://internshala.com/internship/detail/marketing-intern-in-bengaluru-at-acme1234/99887766";

function parseInternshalaFixture(options: {
  locationText: string | null;
  postedText: string | null;
}): UniversalJob {
  buildInternshalaDom(options);
  const job = new InternshalaJobParser().tryParse({ document, url: INTERNSHALA_URL });
  expect(job).not.toBeNull();
  return job as UniversalJob;
}

describe("End-to-end: Internshala user-parsed job -> Jobs page visibility", () => {
  it("an India, fresh, valid job becomes visible", async () => {
    const job = parseInternshalaFixture({
      locationText: "Bengaluru",
      postedText: "Posted 2 days ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("India");
    expect(visible).toBe(true);
  });

  it("a stale job (posted 45 days ago) stays hidden", async () => {
    const job = parseInternshalaFixture({
      locationText: "Bengaluru",
      postedText: "Posted 45 days ago",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).not.toBeNull();
    expect(visible).toBe(false);
  });

  it("has no non-India rejection case by construction — the platform-level India inference means the only location-driven rejection is 'no location at all'", async () => {
    // Internshala only ever lists Indian postings, so the parser sets
    // country="India" whenever ANY location text is present (see
    // InternshalaJobParser.test.ts) — there is no location string this
    // parser would read as "foreign". The equivalent rejection case for this
    // source is a posting with no location at all, tested below.
    const job = parseInternshalaFixture({ locationText: null, postedText: "Posted 1 day ago" });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBeNull();
    expect(visible).toBe(false);
  });

  it("a job with no parseable posted date at all stays hidden", async () => {
    const job = parseInternshalaFixture({ locationText: "Bengaluru", postedText: null });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).toBeNull();
    expect(visible).toBe(false);
  });
});

// ── Foundit ──

type FounditFixtureOptions = {
  city: string;
  state?: string;
  country: string;
  datePosted?: string;
  descriptionText?: string;
};

/**
 * `FounditJobParser.readLocation` reads `city` EXCLUSIVELY from the DOM's
 * own location link (`#jdPageHeader a[href*='/search/jobs-in-']`) — it never
 * falls back to JSON-LD's `addressLocality` when that DOM anchor is absent
 * (see foundit.selectors.ts / FounditJobParser.ts#readLocation). `country`,
 * conversely, comes ONLY from JSON-LD. A realistic fixture — and the only
 * way to control `city` and `country` consistently in the same test case —
 * must set BOTH to agree, exactly as a real Foundit page would (its own DOM
 * chip and its own JSON-LD both describe the same actual posting).
 */
function buildFounditDom(options: FounditFixtureOptions): void {
  const slug = options.city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  document.body.innerHTML = `
    <div id="jdPageHeader">
      <h1>Backend Engineer</h1>
      <a href="/search/acme-india-jobs">Acme India</a>
      <a href="/search/jobs-in-${slug}">${options.city}</a>
    </div>
    <div id="jobDescription">
      <div class="break-words">
        <p>${options.descriptionText ?? "We are hiring a backend engineer to build our payments platform."}</p>
      </div>
    </div>
  `;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme India" },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: options.city,
        addressRegion: options.state ?? null,
        addressCountry: options.country,
      },
    },
    ...(options.datePosted ? { datePosted: options.datePosted } : {}),
  });
  document.body.appendChild(script);
}

const FOUNDIT_URL = "https://www.foundit.in/job/backend-engineer-acme-india-59142082";

function parseFounditFixture(options: FounditFixtureOptions): UniversalJob {
  document.body.innerHTML = "";
  buildFounditDom(options);
  const job = new FounditJobParser().tryParse({ document, url: FOUNDIT_URL });
  expect(job).not.toBeNull();
  return job as UniversalJob;
}

describe("End-to-end: Foundit user-parsed job -> Jobs page visibility", () => {
  it("an India, fresh, valid job becomes visible", async () => {
    const job = parseFounditFixture({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      datePosted: "12-09-2026",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("India");
    expect(visible).toBe(true);
  });

  it("a stale job (posted 45 days ago) stays hidden", async () => {
    const job = parseFounditFixture({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      datePosted: "30-07-2026",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).not.toBeNull();
    expect(visible).toBe(false);
  });

  it("a clearly foreign job (New York, United States) stays hidden", async () => {
    const job = parseFounditFixture({
      city: "New York",
      state: "New York",
      country: "United States",
      datePosted: "12-09-2026",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("United States");
    expect(row.city).toBe("New York");
    expect(visible).toBe(false);
  });

  it("FINDING: a US job in Indianapolis, Indiana is NOT reliably hidden (same pre-existing substring gap as LinkedIn)", async () => {
    const job = parseFounditFixture({
      city: "Indianapolis",
      state: "Indiana",
      country: "United States",
      datePosted: "12-09-2026",
    });
    const { visible, row } = await runPipeline(job);
    expect(row.country).toBe("United States");
    expect(row.city).toBe("Indianapolis");
    expect(visible).toBe(true);
  });

  it("a job with no parseable posted date at all stays hidden", async () => {
    // No `datePosted` in JSON-LD and no "Posted N ... ago" stat chip in the
    // DOM at all — the parser has no date signal of any kind.
    const job = parseFounditFixture({ city: "Bengaluru", state: "Karnataka", country: "India" });
    const { visible, row } = await runPipeline(job);
    expect(row.postedAt).toBeNull();
    expect(visible).toBe(false);
  });
});
