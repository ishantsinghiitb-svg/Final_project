import { describe, expect, it, vi } from "vitest";
import { createUniversalJob } from "../../core/parsers/types";
import { SupportedSite } from "../../core/site-detection/types";

// ── B3: the extension's payload always satisfies upsert_global_job's
// server-side required-field gate ──────────────────────────────────────────
//
// B3 (see supabase/migrations/20260901000001_module13_secure_global_job_writes.sql)
// hardens `upsert_global_job` itself — field-length bounds, a per-user rate
// limit, and a company-identity re-check on the UPDATE path — WITHOUT
// changing this file at all: the extension keeps calling the RPC exactly as
// before. The one thing worth pinning here, permanently, is the contract the
// server already relies on and this file is the sole producer of: `source`,
// `company_name`, and `role` must never be sent empty, and at least one of
// `source_job_id` / `fingerprint` must be present — a future refactor of
// UniversalJob or this mapping that silently broke that would turn every
// legitimate sync into a server-side rejection.

const rpc = vi.fn(async () => ({ data: { id: "job-1" }, error: null }));
vi.mock("./client", () => ({ getSupabaseClient: () => ({ rpc }) }));

// Imported after the mock so it picks up the mocked client.
const { upsertGlobalJob } = await import("./jobs-api");

function payloadOf(call: number) {
  const args = rpc.mock.calls[call] as [string, { payload: Record<string, unknown> }];
  expect(args[0]).toBe("upsert_global_job");
  return args[1].payload;
}

describe("upsertGlobalJob — payload always satisfies the server's required-field gate", () => {
  it("sends non-empty source/company_name/role and the source_job_id identity", async () => {
    const job = createUniversalJob({
      source: SupportedSite.LinkedIn,
      title: "Senior Backend Engineer",
      companyName: "Acme Corp",
      sourceUrl: "https://www.linkedin.com/jobs/view/1234567890",
      parserVersion: "linkedin-1",
    });
    job.sourceJobId = "1234567890";

    await upsertGlobalJob(job);

    const payload = payloadOf(0);
    expect(payload.source).toBe("linkedin");
    expect(payload.company_name).toBe("Acme Corp");
    expect(payload.role).toBe("Senior Backend Engineer");
    expect(payload.source).not.toBe("");
    expect(payload.company_name).not.toBe("");
    expect(payload.role).not.toBe("");
    expect(payload.source_job_id).toBe("1234567890");
  });

  it("falls back to fingerprint as the identity when source_job_id is unavailable", async () => {
    const job = createUniversalJob({
      source: SupportedSite.Internshala,
      title: "Marketing Intern",
      companyName: "Startup Inc",
      sourceUrl: "https://internshala.com/internship/detail/xyz",
      parserVersion: "internshala-1",
    });
    job.sourceJobId = null;
    job.fingerprint = "abc123fingerprint";

    await upsertGlobalJob(job);

    const payload = payloadOf(1);
    expect(payload.source_job_id).toBeNull();
    expect(payload.fingerprint).toBe("abc123fingerprint");
  });

  it("never renames or drops the identity/description_html fields the A1 and B3 fixes depend on", async () => {
    const job = createUniversalJob({
      source: SupportedSite.Naukri,
      title: "Data Analyst",
      companyName: "Data Co",
      sourceUrl: "https://naukri.com/job/1",
      parserVersion: "naukri-1",
    });
    job.sourceJobId = "n-1";
    job.descriptionHtml = "<p>Analyze data.</p>";

    await upsertGlobalJob(job);

    const payload = payloadOf(2);
    // These exact keys are what the SQL function reads via payload->>'...' —
    // a rename here silently breaks sync without a single type error, since
    // the RPC payload is an untyped jsonb object.
    expect(Object.keys(payload)).toContain("description_html");
    expect(payload.description_html).toBe("<p>Analyze data.</p>");
  });
});
