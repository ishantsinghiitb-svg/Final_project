import type { ServerSupabase } from "@/server/supabase";
import { GmailRepository } from "@/repositories/GmailRepository";

// ── Existing-application matching (Module 9A) ──
//
// Runs server-side, inside GmailSyncService, using the caller's authenticated
// `ServerSupabase` client (from requireUser) — NOT the ambient-client
// ApplicationRepository/ContactRepository, which are a client-side-only
// pattern in this codebase (RLS-scoped by whatever session is active in the
// browser; unauthenticated when used from server code). This mirrors the
// established precedent in src/server/ai/RecommendationsService.ts's
// fetchContext, which reads applications/resumes with its own raw queries
// against the passed-in authenticated client rather than through a
// client-side repository. A small amount of query-shape duplication with
// ContactRepository.findByEmail is the accepted cost of that split, not an
// oversight.
//
// Combines three signals and takes their UNION of candidate applications —
// never auto-picks a single winner when more than one is plausible:
//   1. Thread continuity (corroborating only — demoted, not used, when the
//      current subject clearly names a different role than the one already
//      linked to this thread, so one recruiter reusing a long thread across
//      multiple roles with the same candidate doesn't silently misattribute).
//   2. Recruiter contact email — exact match against application_contacts.
//   3. Normalized company name — reuses the same normalization philosophy as
//      the DB's normalize_company_name() (global_jobs dedup), applied here
//      to the plain-text applications.company_name column.

export type MatchResult =
  | { kind: "none" }
  | { kind: "single"; applicationId: string; confidence: number; reason: string }
  | { kind: "ambiguous"; candidateApplicationIds: string[]; reason: string };

// Legal/structural words that carry no identity. Broader than the original
// (inc|llc|ltd|corp|corporation|co) because the failures reported in practice
// were exactly the cases it missed: an application saved as "Groww" against
// mail resolving to "Groww Invest Tech", or "Razorpay" vs "Razorpay Software
// Private". Stripping these makes the two normalise to the same core token.
const COMPANY_NOISE_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "pvt",
  "private",
  "llp",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "technologies",
  "technology",
  "tech",
  "labs",
  "solutions",
  "services",
  "systems",
  "software",
  "global",
  "india",
  "group",
  "holdings",
  "invest",
  "ventures",
  "digital",
  "online",
  "the",
]);

function companyTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !COMPANY_NOISE_WORDS.has(t));
}

function normalizeCompanyName(name: string): string {
  return companyTokens(name).join(" ");
}

/**
 * True when two company names plausibly denote the same employer.
 *
 * Exact normalised equality is the strong case. Beyond that, a containment
 * check on the significant tokens handles the common real-world shape where
 * one side is the short brand the user typed and the other is the fuller
 * legal/product name from the email ("Groww" ⊂ "Groww Invest Tech"). Anchored
 * on the FIRST token being shared so "Acme Systems" and "Beta Systems" don't
 * collide once the noise word is stripped from both.
 */
function companiesMatch(a: string, b: string): boolean {
  const ta = companyTokens(a);
  const tb = companyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(" ") === tb.join(" ")) return true;

  if (ta[0] !== tb[0]) return false;
  const setA = new Set(ta);
  const setB = new Set(tb);
  return ta.every((t) => setB.has(t)) || tb.every((t) => setA.has(t));
}

const ROLE_WORD_PATTERN =
  /\b(engineer|developer|manager|analyst|designer|scientist|specialist|architect|intern|consultant)\b/i;

/** Weak, deliberately cautious heuristic — only flags a conflict when the subject clearly names a DIFFERENT role-sounding term with zero overlap with the known role, never a hard block. */
function rolesConflict(subject: string, applicationRole: string): boolean {
  const roleWords = applicationRole
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (roleWords.length === 0) return false;
  const subjectLower = subject.toLowerCase();
  const overlaps = roleWords.some((w) => subjectLower.includes(w));
  return !overlaps && ROLE_WORD_PATTERN.test(subjectLower);
}

type ApplicationCandidate = { id: string; company_name: string; role: string };

export async function matchApplication(
  supabase: ServerSupabase,
  userId: string,
  input: {
    fromAddress: string;
    companyName: string | null;
    gmailThreadId: string;
    subject: string;
  },
): Promise<MatchResult> {
  const candidates = new Map<string, { confidence: number; reason: string }>();

  // ── Signal 1: thread continuity ──
  const gmailRepo = new GmailRepository(supabase);
  const threadMessages = await gmailRepo.findMatchedMessagesByThread(userId, input.gmailThreadId);
  if (threadMessages.length > 0) {
    const linkedApplicationId = threadMessages[0].matched_application_id as string;
    const { data: linkedApp } = await supabase
      .from("applications")
      .select("id, role")
      .eq("id", linkedApplicationId)
      .maybeSingle();
    if (linkedApp && !rolesConflict(input.subject, linkedApp.role)) {
      candidates.set(linkedApp.id, {
        confidence: 0.9,
        reason: "Continues a Gmail thread already linked to this application.",
      });
    }
    // Role conflict: deliberately skip this signal rather than use it —
    // falls through to signals 2/3, which may independently find the same
    // application (fine) or correctly find a different one / none.
  }

  // ── Signal 2: recruiter contact email ──
  const { data: contacts, error: contactError } = await supabase
    .from("application_contacts")
    .select("application_id")
    .eq("user_id", userId)
    .ilike("email", input.fromAddress);
  if (contactError) throw contactError;
  for (const contact of contacts ?? []) {
    if (!candidates.has(contact.application_id)) {
      candidates.set(contact.application_id, {
        confidence: 0.85,
        reason: "Sender matches a recruiter contact on this application.",
      });
    }
  }

  // ── Signal 3: normalized company name ──
  if (input.companyName) {
    const normalizedTarget = normalizeCompanyName(input.companyName);
    if (normalizedTarget) {
      const { data: applications, error: appError } = await supabase
        .from("applications")
        .select("id, company_name, role")
        .eq("user_id", userId)
        .eq("archived", false);
      if (appError) throw appError;
      for (const app of (applications ?? []) as ApplicationCandidate[]) {
        if (companiesMatch(app.company_name, input.companyName) && !candidates.has(app.id)) {
          // An exact normalised hit is stronger evidence than a
          // containment/brand-variant hit, and is scored accordingly.
          const exact = normalizeCompanyName(app.company_name) === normalizedTarget;
          candidates.set(app.id, {
            confidence: exact ? 0.7 : 0.6,
            reason: `Company name matches your application to ${app.company_name}.`,
          });
        }
      }
    }
  }

  if (candidates.size === 0) return { kind: "none" };
  if (candidates.size === 1) {
    const [applicationId, match] = [...candidates.entries()][0];
    return { kind: "single", applicationId, confidence: match.confidence, reason: match.reason };
  }

  const sorted = [...candidates.entries()].sort((a, b) => b[1].confidence - a[1].confidence);
  return {
    kind: "ambiguous",
    candidateApplicationIds: sorted.map(([id]) => id),
    reason: "Matches more than one of your applications — please confirm which one.",
  };
}
