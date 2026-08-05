import type { ParsedFromHeader } from "./emailParsing";

// ── Role + recruiter extraction (Module 9A) ──
//
// The missing half of entity extraction. Company came from CompanyExtractor
// from the start; role never did — the suggestion pipeline hardcoded
// `role: null`, which made every create_application suggestion fail its
// accept-time validation ("Company and role are required"). Extracting a
// real role here is what turns Accept from permanently-blocked into
// one-click, and it's also the difference between a card that says
// "New Application — we found something from Jar" and one that says
// "Jar · Product Internship".
//
// Same posture as the rest of the module: confident patterns only, null
// rather than a guess. A null role no longer blocks Accept (the accept path
// now falls back to a neutral placeholder the user can edit), so a miss
// costs the user one edit, never a wrong value silently committed.

// Seniority/discipline vocabulary that makes a phrase look like a real job
// title rather than an arbitrary capitalised noun phrase.
const ROLE_KEYWORDS = [
  "intern",
  "internship",
  "trainee",
  "apprentice",
  "graduate",
  "engineer",
  "developer",
  "programmer",
  "architect",
  "scientist",
  "analyst",
  "associate",
  "consultant",
  "manager",
  "designer",
  "researcher",
  "specialist",
  "strategist",
  "marketer",
  "recruiter",
  "accountant",
  "administrator",
  "executive",
  "officer",
  "lead",
  "head",
  "director",
  "president",
  "sde",
  "swe",
  "sdet",
  "mts",
  "pm",
  "tpm",
  "em",
  "ux",
  "ui",
  "qa",
  "devops",
  "sre",
  "ml",
  "ai",
  "data",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "fullstack",
  "full-stack",
  "mobile",
  "android",
  "ios",
  "web",
  "cloud",
  "security",
  "product",
  "business",
  "operations",
  "finance",
  "sales",
  "content",
  "growth",
];

// Phrases that reliably introduce a job title in recruiting mail. Ordered
// most-explicit first — an "application for X" beats a bare "X role".
const ROLE_PATTERNS: RegExp[] = [
  /\b(?:application|applied|apply(?:ing)?)\s+(?:for|to)\s+(?:the\s+)?(?:role\s+of\s+|position\s+of\s+|post\s+of\s+)?["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:\s+(?:role|position|opening|posting|at|with|in|team)\b|[.!,;\n]|$)/i,
  /\b(?:role|position|post|opening|vacancy|profile)\s+of\s+["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:\s+(?:at|with|in)\b|[.!,;\n]|$)/i,
  /\b(?:for|regarding|re:)\s+(?:the\s+)?["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?\s+(?:role|position|opening|internship|posting)\b/i,
  /\b(?:hiring|recruiting|considered|shortlisted|selected)\s+(?:you\s+)?(?:for|as)\s+(?:a|an|the)?\s*["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:\s+(?:at|with|in|role|position)\b|[.!,;\n]|$)/i,
  /\b(?:as\s+(?:a|an)\s+)["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:\s+(?:at|with|in)\b|[.!,;\n]|$)/i,
  /\bjob\s+title\s*[:-]\s*["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:[.!,;\n]|$)/i,
  /\bposition\s*[:-]\s*["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:[.!,;\n]|$)/i,
  /\brole\s*[:-]\s*["“]?([\w][\w/&+.,'’()\- ]{2,60}?)["”]?(?:[.!,;\n]|$)/i,
];

// Words that mean the captured phrase is boilerplate, not a title.
const ROLE_STOPWORDS = [
  "your application",
  "the application",
  "this application",
  "our team",
  "the team",
  "the company",
  "the following",
  "more information",
  "next steps",
  "further details",
  "the interview",
  "an interview",
  "the assessment",
  "the offer",
  "the process",
  "us",
  "you",
  "it",
];

function looksLikeRole(candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  if (lower.length < 3 || lower.length > 60) return false;
  if (ROLE_STOPWORDS.some((s) => lower === s || lower === `${s}.`)) return false;
  // Must contain at least one recognisable job-title token — this is what
  // keeps "your application" and "the following details" out.
  if (!ROLE_KEYWORDS.some((k) => new RegExp(`\\b${k}\\b`, "i").test(lower))) return false;
  // Reject sentence-like captures.
  if (lower.split(/\s+/).length > 8) return false;
  return true;
}

function tidyRole(candidate: string): string {
  return candidate
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, "")
    .replace(/\b(?:role|position|opening|posting|vacancy)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      /[A-Z]/.test(word.slice(1)) || word.length <= 3
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * Best-effort job title from the subject line first (recruiting mail almost
 * always puts it there), then the top of the body. Returns null rather than
 * a guess — callers treat null as "ask the user", not "fail".
 */
export function extractRole(subject: string, bodyText = ""): string | null {
  const sources = [subject, bodyText.slice(0, 2000)];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of ROLE_PATTERNS) {
      const candidate = pattern.exec(source)?.[1];
      if (!candidate) continue;
      const tidied = tidyRole(candidate);
      if (looksLikeRole(tidied)) return tidied;
    }
  }

  // Fallback: a bare title-shaped fragment in the subject, e.g.
  // "Software Engineer Intern - Acme" or "Acme | Product Design Intern".
  for (const fragment of subject.split(/[-|–—:]/)) {
    const tidied = tidyRole(fragment);
    if (looksLikeRole(tidied)) return tidied;
  }

  return null;
}

// ── Recruiter name ──

// Inter-word separators are spaces/tabs, never `\s` — `\s` matches newlines,
// which made the sign-off capture run past the name onto the next line and
// return "Priya Sharma\nRecruiter" (the job title) as the recruiter's name.
const PERSONAL_NAME_PATTERN = /^[A-Z][a-z'’-]{1,20}(?:[ \t]+[A-Z][a-z'’-]{1,20}){1,2}$/;

const SIGN_OFF_PATTERN =
  /\b(?:best regards|warm regards|kind regards|best wishes|regards|thanks(?:[ \t]+and[ \t]+regards)?|thank you|sincerely|cheers|best)[ \t]*[,!.]?[ \t]*\r?\n+[ \t]*([A-Z][a-z'’-]{1,20}(?:[ \t]+[A-Z][a-z'’-]{1,20}){0,2})[ \t]*(?:\r?\n|$)/i;

// Display names that are clearly a team/brand rather than a person.
const NON_PERSON_MARKERS =
  /\b(?:team|careers?|recruit(?:ing|ment)?|talent|hiring|hr|jobs?|noreply|no-reply|notifications?|support|admin|info|help|desk|bot|mailer|do\s*not\s*reply)\b/i;

/**
 * The human who sent this, when there is one. Prefers a personal-looking
 * sender display name, falling back to a sign-off name in the body — both
 * gated so a "Acme Talent Team" display name or a boilerplate footer never
 * gets presented to the user as a named recruiter.
 */
export function extractRecruiterName(from: ParsedFromHeader, bodyText = ""): string | null {
  const display = from.displayName?.trim();
  if (display && !NON_PERSON_MARKERS.test(display) && PERSONAL_NAME_PATTERN.test(display)) {
    return display;
  }

  const signOff = SIGN_OFF_PATTERN.exec(bodyText.slice(0, 4000))?.[1]?.trim();
  if (signOff && !NON_PERSON_MARKERS.test(signOff) && PERSONAL_NAME_PATTERN.test(signOff)) {
    return signOff;
  }

  return null;
}
