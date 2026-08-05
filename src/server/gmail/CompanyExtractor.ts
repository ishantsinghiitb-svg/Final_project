import type { ParsedFromHeader } from "./emailParsing";
import { ATS_DOMAINS, ASSESSMENT_DOMAINS, JOB_BOARD_DOMAINS } from "./RelevanceFilter";

// ── Company-entity extraction (Module 9A) ──
//
// Resolves the BRAND a candidate actually recognises, not whatever string
// happens to sit in the From header. The distinction matters: a company's
// mail often goes out under its legal entity or an internal product domain
// ("ChangeJar Technologies" / changejar.com) while the candidate applied to,
// and thinks in terms of, the brand ("Jar"). Showing the legal entity reads
// as a wrong answer even though it's technically the same company.
//
// Priority is deliberately NOT "sender domain first" (the previous rule —
// it's what produced "ChangeJar"). Sender display name in particular is the
// LAST resort, per product direction: it's the field most polluted by
// recruiting boilerplate ("Acme Talent Team", "Careers @ Acme") and is
// frequently the ATS vendor's name rather than the employer's on
// platform-sent mail. Ordering instead runs strongest-evidence-first:
// explicit ATS metadata, then in-copy brand mentions, then the domain, then
// the display name.
//
// Everything here stays best-effort and is always shown editable before
// anything is created — a miss means the user corrects one field, never a
// wrong value silently committed.

const KNOWN_PLATFORM_DOMAINS = new Set([
  ...ATS_DOMAINS,
  ...ASSESSMENT_DOMAINS,
  ...JOB_BOARD_DOMAINS,
]);

/**
 * Legal-entity / internal-domain → candidate-facing brand. Only for cases
 * where the two genuinely differ and the brand is unguessable from the
 * string itself (no amount of suffix-stripping turns "changejar" into
 * "Jar"). Keys are matched case-insensitively against both the extracted
 * name and the sender domain's primary label.
 */
const COMPANY_ALIASES: Record<string, string> = {
  changejar: "Jar",
  "changejar technologies": "Jar",
  "jar app": "Jar",
  billionbrainsgarage: "Groww",
  "billionbrains garage": "Groww",
  nextbillion: "Groww",
  one97: "Paytm",
  "one97 communications": "Paytm",
  "bundl technologies": "Swiggy",
  bundl: "Swiggy",
  "ani technologies": "Ola",
  "sprinklr india": "Sprinklr",
  "flipkart internet": "Flipkart",
  "aditya birla fashion": "ABFRL",
  "haptik technologies": "Haptik",
  "thence digital": "Thence",
};

// Corporate/legal suffixes that are never part of the brand a candidate
// recognises. Stripped from the tail of an extracted name.
const LEGAL_SUFFIX_PATTERN =
  /\b(?:pvt\.?|private|ltd\.?|limited|llp|inc\.?|incorporated|corp\.?|corporation|co\.?|company|gmbh|s\.?a\.?|b\.?v\.?|plc|technologies|technology|tech|labs|solutions|services|systems|software|global|india|group|holdings)\b/gi;

const DISPLAY_NAME_NOISE_WORDS = [
  "careers",
  "recruiting",
  "recruitment",
  "talent acquisition",
  "talent team",
  "talent",
  "hiring team",
  "hiring",
  "hr team",
  "people team",
  "hr",
  "team",
  "jobs",
  "notifications",
  "notification",
  "no-reply",
  "noreply",
  "do not reply",
  "via",
];

/** Generic mail hosts that say nothing about the employer. */
const GENERIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "rediffmail.com",
  "zoho.com",
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) =>
      // Preserve intentional internal capitalisation (SDE, HDFC, McKinsey);
      // only fix all-lowercase tokens, which is what domain labels give us.
      /[A-Z]/.test(word.slice(1)) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Normalised lookup key: lowercase, punctuation-free, single-spaced. */
function aliasKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyAlias(name: string): string {
  return COMPANY_ALIASES[aliasKey(name)] ?? name;
}

function stripLegalSuffixes(name: string): string {
  const stripped = name
    .replace(LEGAL_SUFFIX_PATTERN, " ")
    .replace(/[,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Never strip a name down to nothing — "Tech Mahindra" must survive even
  // though "tech" is on the suffix list.
  return stripped.length >= 2 ? stripped : name.trim();
}

/** Final cleanup applied to every candidate before it's returned. */
function finalize(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 60) return null;

  // Alias check runs BEFORE and AFTER suffix-stripping: "ChangeJar
  // Technologies" needs stripping first, bare "changejar" matches directly.
  const aliasedRaw = applyAlias(trimmed);
  if (aliasedRaw !== trimmed) return aliasedRaw;

  const stripped = stripLegalSuffixes(trimmed);
  const aliased = applyAlias(stripped);
  const result = titleCase(aliased);
  return result.length >= 2 ? result : null;
}

function cleanDisplayName(name: string): string | null {
  let cleaned = name;
  for (const word of DISPLAY_NAME_NOISE_WORDS) {
    cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, "gi"), " ");
  }
  cleaned = cleaned
    .replace(/[|\-–—@()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function isKnownPlatformDomain(domain: string): boolean {
  return [...KNOWN_PLATFORM_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

function isGenericMailDomain(domain: string): boolean {
  return GENERIC_MAIL_DOMAINS.has(domain);
}

function domainToCompanyName(domain: string): string | null {
  // Drop a leading mail subdomain so "careers.acme.com" → "acme", and take
  // the registrable label rather than blindly the first one.
  const labels = domain.split(".").filter(Boolean);
  if (labels.length === 0) return null;
  const noise = new Set(["mail", "email", "careers", "jobs", "hire", "hiring", "smtp", "mx", "no"]);
  const meaningful = labels.filter((l) => !noise.has(l));
  const primary = meaningful[0] ?? labels[0];
  if (!primary || primary.length < 2) return null;
  return primary.replace(/-/g, " ");
}

// ── ATS metadata: the employer name travels in the copy, not the sender ──
//
// Platform-sent mail (Greenhouse/Lever/Workday/…) always comes from the
// vendor's domain, so the employer has to come from the message itself.
// These patterns target the phrasings those platforms actually emit.
const ATS_COMPANY_PATTERNS = [
  /\byour application (?:to|at|with|for)\s+([A-Z][\w& .'-]{1,40}?)(?:\s+(?:for|has|is|was|team)\b|[.!,]|$)/,
  /\bapplication (?:to|at|with)\s+([A-Z][\w& .'-]{1,40}?)(?:\s+(?:for|has|is|was)\b|[.!,]|$)/,
  /\bthe team at\s+([A-Z][\w& .'-]{1,40}?)(?:[.!,]|$)/,
  /\b(?:interview|role|position|opportunity) (?:at|with)\s+([A-Z][\w& .'-]{1,40}?)(?:[.!,]|$)/,
  /\bjoin(?:ing)?\s+([A-Z][\w& .'-]{1,40}?)(?:\s+as\b|[.!,]|$)/,
  /^([A-Z][\w& .'-]{1,40}?)\s+(?:careers|recruiting|talent|hiring)\b/i,
];

function extractFromAtsBody(bodyText: string): string | null {
  const head = bodyText.slice(0, 1500);
  for (const pattern of ATS_COMPANY_PATTERNS) {
    const candidate = head.match(pattern)?.[1]?.trim();
    if (candidate) return candidate;
  }
  return null;
}

// "Interview at Acme", "Update on your application with Acme",
// "Software Engineer - Acme Corp"
const SUBJECT_COMPANY_PATTERNS = [
  /\bat\s+([A-Z][\w& .'-]{1,40})(?:[.!,]|$)/,
  /\bwith\s+([A-Z][\w& .'-]{1,40})(?:[.!,]|$)/,
  /[-|–]\s*([A-Z][\w& .'-]{1,40})\s*$/,
];

function extractFromSubject(subject: string): string | null {
  for (const pattern of SUBJECT_COMPANY_PATTERNS) {
    const candidate = pattern.exec(subject)?.[1]?.trim();
    if (candidate && candidate.length >= 2 && candidate.length <= 60) return candidate;
  }
  return null;
}

/**
 * Best-effort company name, strongest evidence first:
 *  1. ATS/platform mail → the employer named in the body copy (the sender
 *     domain is the vendor's, so it's actively misleading here).
 *  2. The sender's own corporate domain (not a platform, not a generic mail
 *     host) — a company's own mail system rarely disagrees with itself.
 *  3. A brand mentioned in the body of non-platform mail.
 *  4. A pattern match in the subject line ("at Acme", "- Acme Corp").
 *  5. The sender display name, recruiting-noise stripped — LAST, because it
 *     is the least reliable field (see the header comment).
 * Every candidate passes through alias mapping + legal-suffix stripping.
 * Returns null rather than a low-confidence guess.
 */
export function extractCompanyName(
  from: ParsedFromHeader,
  subject: string,
  bodyText = "",
): string | null {
  const onPlatform = isKnownPlatformDomain(from.domain);

  if (onPlatform) {
    const fromBody = finalize(extractFromAtsBody(bodyText));
    if (fromBody) return fromBody;
    const fromSubject = finalize(extractFromSubject(subject));
    if (fromSubject) return fromSubject;
  }

  if (!onPlatform && !isGenericMailDomain(from.domain)) {
    const fromDomain = finalize(domainToCompanyName(from.domain));
    if (fromDomain) return fromDomain;
  }

  const fromBody = finalize(extractFromAtsBody(bodyText));
  if (fromBody) return fromBody;

  const fromSubject = finalize(extractFromSubject(subject));
  if (fromSubject) return fromSubject;

  if (from.displayName) {
    const cleaned = cleanDisplayName(from.displayName);
    const finalized = finalize(cleaned);
    if (finalized) return finalized;
  }

  return null;
}
