import { describe, expect, it } from "vitest";
import { toAdminUpsertPayload } from "./SupabaseJobIntelligenceStore";
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
