import type { Company } from "@/types";
import { CompanyRepository } from "@/repositories/CompanyRepository";

const companyRepo = new CompanyRepository();

/**
 * CompanyService
 *
 * Thin read wrapper over CompanyRepository. Currently only used to fill in
 * "Company Size" on the Application Detail page when the linked GlobalJob
 * has a company_id — most jobs don't (see JobRepository/upsert_global_job,
 * which never sets it), so callers should treat this as best-effort.
 */
export class CompanyService {
  async getCompany(id: string): Promise<Company | null> {
    return companyRepo.findById(id);
  }
}

export const companyService = new CompanyService();
