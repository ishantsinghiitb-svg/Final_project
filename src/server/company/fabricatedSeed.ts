// ── Module 11C-1: identifying fabricated seed postings ──
//
// The 11C investigation found seven postings live in production that are not
// real listings: `source = 'Careers'`, every URL under `careers.example.com`,
// attributed to Amazon, Google, Microsoft, Flipkart, Swiggy, Razorpay and
// Atlassian. One carries a fabricated ₹17–26 LPA salary range. They are test
// fixtures that reached production, and each created a `companies` row.
//
// The predicate below is deliberately narrow — an RFC 2606 reserved host on the
// posting URL. That is a definitional non-address: `example.com`, `example.org`,
// `example.net` and `.invalid`/`.test`/`.localhost` exist precisely so that
// nothing real can occupy them. A posting whose apply URL is unreachable BY
// DEFINITION cannot be a genuine listing, so this needs no heuristics and can
// never catch a real employer.
//
// Note what is NOT part of the test: `source = 'Careers'`. Matching on the
// source label would be matching on a coincidence of how these rows were
// seeded, and would risk deleting a genuine posting that happened to carry it.

/** Hosts reserved by RFC 2606/6761 — never resolvable, never a real employer. */
const RESERVED_HOSTS = ["example.com", "example.org", "example.net", "example.edu"];
const RESERVED_TLDS = [".invalid", ".test", ".localhost", ".example"];

/** True when a hostname is reserved and therefore cannot serve a real posting. */
export function isReservedHost(hostname: string): boolean {
  const host = (hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!host) return false;
  if (host === "localhost") return true;
  if (RESERVED_HOSTS.some((reserved) => host === reserved || host.endsWith(`.${reserved}`))) {
    return true;
  }
  return RESERVED_TLDS.some((tld) => host.endsWith(tld));
}

export type SeedJobCandidate = {
  url: string | null | undefined;
  sourceUrl?: string | null | undefined;
};

/**
 * True when a posting is a fabricated fixture rather than a real listing.
 *
 * Requires the posting's OWN url (or source_url) to be a reserved host. A
 * posting with no URL at all is NOT flagged: missing data is not evidence of
 * fabrication, and deleting on absence would be unsafe.
 */
export function isFabricatedSeedJob(job: SeedJobCandidate): boolean {
  const urls = [job.url, job.sourceUrl].map((u) => (u ?? "").trim()).filter(Boolean);
  if (urls.length === 0) return false;
  return urls.some((raw) => {
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return isReservedHost(new URL(withScheme).hostname);
    } catch {
      return false;
    }
  });
}
