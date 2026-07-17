import { useQuery } from "@tanstack/react-query";
import { companyService } from "@/services/CompanyService";

export const companyKeys = {
  all: ["companies"] as const,
  detail: (id: string) => [...companyKeys.all, "detail", id] as const,
};

/** Fetches a company by ID. Pass undefined to skip the query entirely. */
export function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: companyKeys.detail(companyId ?? ""),
    queryFn: () => companyService.getCompany(companyId!),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1_000,
  });
}
