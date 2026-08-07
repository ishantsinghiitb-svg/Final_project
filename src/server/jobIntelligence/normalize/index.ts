import { generateFingerprint } from "@/features/jobs/fingerprint";
import type { NormalizedJobPosting, ParsedJobPosting } from "../types";
import { normalizeCompanyName } from "./company";
import { normalizeRoleTitle } from "./role";
import { normalizeLocationText } from "./location";

export { normalizeCompanyName, type NormalizedCompany } from "./company";
export { normalizeRoleTitle, type NormalizedRole } from "./role";
export { normalizeLocationText } from "./location";

/**
 * The Normalizer stage: Parser output → NormalizedJobPosting. Attaches
 * normalized company/role/location plus the fallback dedup fingerprint
 * (byte-identical algorithm to the extension's — see fingerprint.ts) without
 * ever mutating the original parsed fields.
 */
export async function normalizeParsedJob(parsed: ParsedJobPosting): Promise<NormalizedJobPosting> {
  const company = normalizeCompanyName(parsed.companyName);
  const role = normalizeRoleTitle(parsed.role);
  const normalizedLocation = normalizeLocationText(parsed.city ?? parsed.location ?? null);

  const fingerprint = await generateFingerprint(
    parsed.role,
    parsed.companyName,
    parsed.location ?? null,
  );

  return {
    ...parsed,
    normalizedCompany: company.canonicalName,
    normalizedRole: role.normalized,
    normalizedLocation,
    fingerprint,
  };
}
