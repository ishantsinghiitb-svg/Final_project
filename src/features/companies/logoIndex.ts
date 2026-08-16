import { useMemo } from "react";
import { useAllApplications } from "@/features/applications/hooks";
import { useSavedJobs } from "@/features/jobs/hooks";

/**
 * Company logo lookup by name, for surfaces whose own rows carry a company
 * name but no logo column.
 *
 * The product rule is that a company image must always be the best VERIFIED
 * one already in the system, and only fall back to the generated placeholder
 * when nothing verified exists. Rendering and the placeholder fallback stay
 * where they already were, in `CompanyMark` — this only answers "do we already
 * hold a logo for this company?" so callers can hand `CompanyMark` a
 * `logoUrl`. It deliberately does not fetch anything new, does not guess a
 * favicon from a domain, and does not introduce a second rendering path.
 *
 * The Inbox is the motivating case: Gmail suggestions carry `company_name`
 * only, so every row drew tinted initials even when the same company was
 * sitting in the user's own applications with a real logo attached.
 *
 * Matching is exact-on-normalized-name. Fuzzy matching is deliberately avoided:
 * showing one company's logo against another company's email is worse than
 * showing initials.
 */

/** Lowercase, strip punctuation and common legal suffixes, collapse whitespace. */
export function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’"()]/g, " ")
    .replace(
      /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company|technologies|technology|labs|solutions)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export type CompanyLogoIndex = (companyName: string | null | undefined) => string | null;

/**
 * Builds the index from data the dashboard has already loaded (applications
 * and saved jobs), so it costs no extra request on any page that uses it.
 */
export function useCompanyLogoIndex(): CompanyLogoIndex {
  const { data: applications = [] } = useAllApplications();
  const { data: savedJobs } = useSavedJobs();

  const index = useMemo(() => {
    const map = new Map<string, string>();

    const add = (name: string | null | undefined, logo: string | null | undefined) => {
      if (!name || !logo) return;
      const key = normalizeCompanyKey(name);
      if (!key || map.has(key)) return;
      map.set(key, logo);
    };

    for (const app of applications) add(app.company_name, app.company_logo_url);
    for (const job of savedJobs?.data ?? []) add(job.company_name, job.company_logo_url);

    return map;
  }, [applications, savedJobs]);

  return useMemo(
    () => (companyName: string | null | undefined) => {
      if (!companyName) return null;
      return index.get(normalizeCompanyKey(companyName)) ?? null;
    },
    [index],
  );
}
