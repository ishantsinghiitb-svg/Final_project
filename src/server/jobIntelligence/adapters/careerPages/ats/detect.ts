// ── Module 10B.1: careers URL → ATS board ──
//
// This is what makes "future companies must be added by configuration only"
// true: an operator registers a company with the careers URL they already
// have, and the provider + board token are derived from it. No per-company
// code, no per-company migration.
//
// A registry entry may still override detection through its `config` jsonb
// (`{"ats":"greenhouse","boardToken":"stripe"}`) for the case a company hosts
// its board behind a vanity domain that carries no ATS fingerprint.

import type { AtsBoard, AtsProviderId } from "./types";

const PROVIDER_IDS: readonly AtsProviderId[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "jsonld",
];

export function isAtsProviderId(value: unknown): value is AtsProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Adapter-specific overrides read off a registry entry's `config` column. */
export type CareerPagesConfig = {
  ats?: AtsProviderId;
  boardToken?: string;
};

export function readCareerPagesConfig(config: unknown): CareerPagesConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const record = config as Record<string, unknown>;
  const ats = isAtsProviderId(record.ats) ? record.ats : undefined;
  const boardToken =
    typeof record.boardToken === "string" && record.boardToken.trim()
      ? record.boardToken.trim()
      : undefined;
  return { ats, boardToken };
}

type HostRule = {
  provider: AtsProviderId;
  /** Matches the host (exact or as a suffix after a dot). */
  host: string;
  /** Reads the board token out of a matching URL; null when the URL carries none. */
  token: (url: URL) => string | null;
};

function firstPathSegment(url: URL): string | null {
  const segment = url.pathname.split("/").filter(Boolean)[0];
  return segment ? decodeURIComponent(segment) : null;
}

/** Path segment at `index`, skipping known non-token prefixes. */
function pathSegmentAt(url: URL, index: number): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const segment = segments[index];
  return segment ? decodeURIComponent(segment) : null;
}

function subdomain(url: URL, root: string): string | null {
  const host = url.host.toLowerCase();
  if (!host.endsWith(`.${root}`)) return null;
  const prefix = host.slice(0, -(root.length + 1));
  const label = prefix.split(".").pop() ?? "";
  return label && label !== "www" ? label : null;
}

const HOST_RULES: readonly HostRule[] = [
  // boards.greenhouse.io/stripe · job-boards.greenhouse.io/stripe ·
  // boards.eu.greenhouse.io/stripe · boards-api.greenhouse.io/v1/boards/stripe/jobs
  {
    provider: "greenhouse",
    host: "greenhouse.io",
    token: (url) => {
      const segments = url.pathname.split("/").filter(Boolean);
      const boardsIndex = segments.indexOf("boards");
      if (boardsIndex >= 0 && segments[boardsIndex + 1])
        return decodeURIComponent(segments[boardsIndex + 1]);
      return firstPathSegment(url);
    },
  },
  { provider: "lever", host: "lever.co", token: (url) => firstPathSegment(url) },
  { provider: "ashby", host: "ashbyhq.com", token: (url) => firstPathSegment(url) },
  {
    provider: "smartrecruiters",
    host: "smartrecruiters.com",
    token: (url) => {
      // api.smartrecruiters.com/v1/companies/Visa/postings
      const segments = url.pathname.split("/").filter(Boolean);
      const companiesIndex = segments.indexOf("companies");
      if (companiesIndex >= 0 && segments[companiesIndex + 1]) {
        return decodeURIComponent(segments[companiesIndex + 1]);
      }
      return firstPathSegment(url);
    },
  },
  {
    provider: "workable",
    host: "workable.com",
    // apply.workable.com/acme/ — "apply"/"www" are hosts, not tokens.
    token: (url) => firstPathSegment(url) ?? subdomain(url, "workable.com"),
  },
  { provider: "recruitee", host: "recruitee.com", token: (url) => subdomain(url, "recruitee.com") },
];

function matchesHost(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

export type AtsDetection = { ok: true; board: AtsBoard } | { ok: false; reason: string };

/**
 * Resolves a registry entry to a concrete ATS board. Explicit config wins over
 * URL detection; an unrecognized host falls back to the `jsonld` provider
 * rather than failing, because a plain careers page is a legitimate — if
 * lower-yield — crawl target.
 */
export function detectAtsBoard(
  careersUrl: string,
  companyName: string,
  config: unknown = {},
): AtsDetection {
  const overrides = readCareerPagesConfig(config);

  let url: URL;
  try {
    url = new URL(careersUrl);
  } catch {
    return { ok: false, reason: `Careers URL is not a valid URL: "${careersUrl}"` };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, reason: `Careers URL must be http(s): "${careersUrl}"` };
  }

  const base = { careersUrl, companyName };

  if (overrides.ats) {
    const token = overrides.boardToken ?? detectToken(url, overrides.ats) ?? "";
    if (overrides.ats !== "jsonld" && !token) {
      return {
        ok: false,
        reason: `config.ats is "${overrides.ats}" but no board token could be resolved — set config.boardToken.`,
      };
    }
    return { ok: true, board: { ...base, provider: overrides.ats, token } };
  }

  const host = url.host.toLowerCase();
  for (const rule of HOST_RULES) {
    if (!matchesHost(host, rule.host)) continue;
    const token = overrides.boardToken ?? rule.token(url);
    if (!token) {
      return {
        ok: false,
        reason: `URL looks like ${rule.provider} but carries no board token: "${careersUrl}"`,
      };
    }
    return { ok: true, board: { ...base, provider: rule.provider, token } };
  }

  // Unknown host: treat the page itself as the board and read JSON-LD from it.
  return { ok: true, board: { ...base, provider: "jsonld", token: url.host } };
}

function detectToken(url: URL, provider: AtsProviderId): string | null {
  const rule = HOST_RULES.find((candidate) => candidate.provider === provider);
  if (!rule) return null;
  return rule.token(url) ?? pathSegmentAt(url, 0);
}
