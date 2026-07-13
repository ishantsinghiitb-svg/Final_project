import { supabase } from "@/lib/supabase";
import type { Company } from "@/types";
import type { CompanyRow, CompanyInsert } from "@/types/database";

// ── Column map note ───────────────────────────────────────────────────────────
// The DB column is `headquarters`; the Company domain type exposes it as
// `location`. The `toCompany` mapper resolves this naming discrepancy so
// callers always work with the domain model.

const COMPANY_COLUMNS =
  "id, name, website, logo_url, industry, size, headquarters, created_at, updated_at";

export class CompanyRepository {
  // ── Private mapper ──────────────────────────────────────────────────────────

  private toCompany(row: CompanyRow): Company {
    return {
      id: row.id,
      name: row.name,
      website: row.website ?? undefined,
      logo_url: row.logo_url ?? undefined,
      industry: row.industry ?? undefined,
      size: row.size ?? undefined,
      location: row.headquarters ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Company | null> {
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toCompany(data as unknown as CompanyRow) : null;
  }

  async findByName(name: string): Promise<Company | null> {
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_COLUMNS)
      .ilike("name", name)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toCompany(data as unknown as CompanyRow) : null;
  }

  async findAll(): Promise<Company[]> {
    const { data, error } = await supabase
      .from("companies")
      .select(COMPANY_COLUMNS)
      .order("name");
    if (error) throw error;
    return (data ?? []).map((row) => this.toCompany(row as unknown as CompanyRow));
  }

  // ── Write (used by job ingestion pipeline in Sprint 2+) ───────────────────

  /**
   * Upserts a company by id.
   * Accepts `location` (domain name) and maps it to `headquarters` (DB column).
   */
  async upsert(company: Partial<Company>): Promise<Company | null> {
    // Map domain field `location` → DB column `headquarters`
    const { location, ...rest } = company;
    const payload: CompanyInsert = {
      name: rest.name ?? "",     // name is required in CompanyInsert
      id: rest.id,
      website: rest.website ?? null,
      logo_url: rest.logo_url ?? null,
      industry: rest.industry ?? null,
      size: rest.size ?? null,
      headquarters: location ?? null,
    };

    const { data, error } = await supabase
      .from("companies")
      .upsert(payload)
      .select(COMPANY_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toCompany(data as unknown as CompanyRow) : null;
  }
}
