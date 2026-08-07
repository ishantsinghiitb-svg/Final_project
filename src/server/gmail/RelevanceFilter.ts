import type { ParsedFromHeader } from "./emailParsing";

// ── Stage 0: relevance gate (Module 9A) ──
//
// Two layers, deliberately: an allow-list bounds what's ever fetched at all
// (buildSyncQuery, used in the Gmail `messages.list` search — mail that
// doesn't match is never even retrieved), and isRelevant is a second,
// finer-grained in-app check applied to every candidate before it's
// persisted — necessary because `history.list` (incremental sync) has no
// query filter of its own, so history-derived candidates only ever went
// through Gmail's own topic-agnostic history log, not the search query.
//
// The largest realistic false-positive source isn't off-topic mail — it's
// bulk job-alert/marketing digests ("new jobs matching your profile") that
// readily collide with job-related keywords without being real recruiter
// communication. That's why isRelevant checks a denylist of known bulk-sender
// patterns BEFORE ever consulting the keyword allow-list.
//
// ⚠️ SELF-SENT MAIL IS INTENTIONALLY IGNORED — and this surprises people.
//
// Mail whose sender address equals the connected Google account's own address
// is rejected, by TWO independent layers:
//   1. `buildSyncQuery()` appends `-in:sent`, so Gmail itself never returns
//      it during the initial backfill.
//   2. `decideRelevance()`'s `self_sent` rule rejects it by address, which is
//      what catches it on the incremental (history.list) path — history has
//      no query filter of its own.
//
// WHY: an application email YOU sent that nobody has replied to is not a
// recruiter update. Without this rule, every "here is my CV" mail you send
// comes back as a create_application suggestion for an application you
// already know about. Your own outgoing mail belongs on the application
// timeline, not in the review queue.
//
// CONSEQUENCE FOR TESTING: emailing yourself is therefore NOT a valid way to
// test detection — a self-addressed message lands in both Sent and Inbox and
// is rejected by both layers above. To test, have the mail arrive from a
// different address. This is working as designed, not a bug.

// First-connection lookback. Deliberately short: importing years of history
// makes onboarding slow, burns Gmail quota, and surfaces long-dead threads
// that bury the mail the user actually cares about. 30 days is enough to
// pick up an in-flight job search. This bounds the INITIAL backfill only —
// once backfill_complete flips true, incremental history.list sync continues
// indefinitely and is unaffected by this value.
const DEFAULT_LOOKBACK_DAYS = 30;

// Platforms whose domain alone is a strong, unambiguous relevance signal —
// transactional notifications from these are legitimate even when they carry
// bulk-mail markers (e.g. a List-Unsubscribe header for compliance).
export const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkday.com",
  "workday.com",
  "icims.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "jobvite.com",
  "taleo.net",
  "successfactors.com",
  "bamboohr.com",
  "workable.com",
  "darwinbox.com",
  "darwinbox.in",
  "rippling.com",
  "teamtailor.com",
  "recruitee.com",
  "breezy.hr",
  "keka.com",
  "zohorecruit.com",
  "freshteam.com",
  "peoplestrong.com",
  "hirist.com",
  "superset.work",
  "joinsuperset.com",
  // RippleHire — a distinct product from Rippling (already listed above);
  // easy to conflate by name alone, so called out explicitly.
  "ripplehire.com",
];

export const ASSESSMENT_DOMAINS = [
  "hackerrank.com",
  "codility.com",
  "testgorilla.com",
  "mettl.com", // Mercer | Mettl
  "hackerearth.com",
  "codesignal.com",
  "hirevue.com",
];

// Job boards are a WEAKER signal than ATS/assessment domains — a message
// from these domains can just as easily be a bulk job-alert digest, so they
// participate in the search query (worth fetching metadata for) but are NOT
// treated as an automatic allow the way ATS_DOMAINS is; isRelevant still
// requires them to pass the keyword/denylist check below.
export const JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "naukri.com",
  "internshala.com",
  "unstop.com",
  "wellfound.com",
  "foundit.in",
  // Y Combinator's job board.
  "workatastartup.com",
];

const KNOWN_JOB_DOMAINS = new Set([...ATS_DOMAINS, ...ASSESSMENT_DOMAINS]);

// Subject-line vocabulary that marks hiring communication. Broad on purpose
// (recall matters more than precision here) — the hard-exclusion layer above
// and the classifier's own confidence threshold downstream are what keep
// false positives out, so this list doesn't have to be conservative. Every
// entry is matched with a WORD-BOUNDARY check (see keywordMatch below), not
// substring containment — several short tokens here (ppo, sde, oa, hr) would
// otherwise false-positive inside unrelated words ("ppo" inside "oppose",
// "hr" inside almost anything with those two letters adjacent).
export const JOB_KEYWORDS = [
  // Core lifecycle
  "interview",
  "interview invitation",
  "interview scheduled",
  "interview rescheduled",
  "interview reminder",
  "application",
  "applied",
  "application received",
  "application submitted",
  "application update",
  "candidate",
  "candidacy",
  "recruiter",
  "recruiter reply",
  "recruitment",
  "hiring",
  "hiring manager",
  "talent",
  "talent acquisition",
  "people team",
  "shortlisted",
  "selected",
  "selection",
  "next round",
  "availability",
  "onboarding",
  "joining",
  "background check",
  "background verification",
  "reference check",
  // Roles / programmes
  "intern",
  "internship",
  "placement",
  "job",
  "career",
  "careers",
  "career portal",
  "opening",
  "position",
  "role",
  "opportunity",
  "vacancy",
  "graduate program",
  "graduate programme",
  "campus",
  "campus hiring",
  "referral",
  "ppo",
  "sde",
  "swe",
  "analyst",
  "associate",
  "designer",
  "manager",
  // Assessment / process
  "assessment",
  "online assessment",
  "oa",
  "coding challenge",
  "coding test",
  "coding round",
  "online test",
  "technical screen",
  "technical interview",
  "technical round",
  "manager round",
  "phone screen",
  "onsite",
  "virtual interview",
  "take-home",
  "take home",
  "assignment",
  "case study",
  "aptitude",
  "hackathon",
  "hackerrank",
  "codility",
  "testgorilla",
  "hackerearth",
  "codesignal",
  "hirevue",
  "mettl",
  "mercer mettl",
  "ripplehire",
  "google form",
  // Scheduling — the mechanics of arranging a round. Meeting-tool names are
  // strong signals in a recruiting context and weak elsewhere; the classifier
  // downstream still has to find a category, so a stray calendar invite only
  // gets as far as being fetched, not suggested.
  "scheduling",
  "reschedule",
  "rescheduled",
  "calendly",
  "google meet",
  "zoom",
  "microsoft teams",
  "availability",
  // Application lifecycle states
  "application status",
  "application closed",
  "application withdrawn",
  "shortlist",
  "waitlist",
  "rejected",
  "document request",
  "full-time",
  "full time",
  // Outcome / compensation
  "offer",
  "offer letter",
  "job offer",
  "offer accepted",
  "offer declined",
  "joining formalities",
  "ctc",
  "stipend",
  "compensation",
  "hr",
  "hr round",
];

/**
 * Word-boundary keyword match — see the JOB_KEYWORDS header comment for why
 * this isn't plain `.includes()`. Exported (Module 9B) for
 * CalendarRelevanceFilter.ts, which needs the identical word-boundary
 * semantics against event titles/descriptions — pure text-vocabulary logic,
 * no Gmail coupling.
 */
export function keywordMatch(lowerSubject: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(lowerSubject);
}

// Sender local-part patterns for bulk job-alert/digest mail specifically —
// narrow and specific on purpose, so this never catches an individual
// recruiter's real message.
const BULK_LOCAL_PART_PATTERNS = [
  /^jobs?-?alerts?-?noreply/i,
  /^jobs?-?noreply/i,
  /^digest/i,
  /^newsletter/i,
  /^no-?reply-?jobs?/i,
  /^talent-?alerts?/i,
];

// ── Hard exclusions ──
//
// Mail that must NEVER become a suggestion no matter how many job keywords
// it happens to contain. These run before every allow-list check, including
// the ATS-domain auto-allow: a bounce notice about a message you sent to a
// Greenhouse address still comes *from* Greenhouse's infrastructure, and an
// out-of-office auto-reply from a recruiter is literally recruiter mail —
// both would otherwise sail straight through. Keyword allow-listing can't
// express "this is machine noise", so it gets its own layer.

/** Sender local-parts that are structurally never a person or an ATS update. */
const EXCLUDED_LOCAL_PARTS = [
  /^mailer-?daemon/i,
  /^postmaster/i,
  /^bounce/i,
  /^bounces?-/i,
  /^delivery-?(?:status|subsystem)/i,
  /^auto-?(?:reply|responder)/i,
  /^security(?:-?alert)?(?:-?noreply)?$/i,
  /^billing/i,
  /^invoice/i,
  /^receipts?$/i,
  /^statements?$/i,
  /^otp/i,
  /^verify/i,
  /^verification/i,
  /^marketing/i,
  /^promo(?:tions?)?/i,
  /^offers?-?noreply/i,
  /^unsubscribe/i,
];

/**
 * Subject shapes that mark machine/transactional mail regardless of who sent
 * it. This is the ONLY place transactional noise is excluded — there is no
 * domain list (see the note above), so these patterns carry that weight and
 * are correspondingly thorough.
 */
const EXCLUDED_SUBJECT_PATTERNS = [
  // Delivery failures / bounces
  /\b(?:undeliverable|undelivered|delivery (?:has )?failed|delivery status notification|returned mail|mail delivery (?:failed|subsystem)|address not found|message blocked|failure notice)\b/i,
  /^(?:auto(?:matic)? reply|automatic response)\b/i,
  // Out of office / autoresponder
  /\b(?:out of (?:the )?office|on vacation|on leave|away from (?:my |the )?(?:desk|office)|annual leave|auto-?responder)\b/i,
  // Security / account plumbing
  /\b(?:security alert|new sign-?in|suspicious (?:sign-?in|activity)|password (?:reset|changed)|verify your (?:email|account)|two-?factor|2fa)\b/i,
  /\b(?:one[- ]?time (?:password|code)|otp|verification code|confirm your email)\b/i,
  // Money / commerce / logistics
  /\b(?:invoice|receipt|payment (?:received|due|failed|successful)|order (?:confirmed|confirmation|shipped|delivered|placed)|your statement|transaction alert|credited|debited|refund(?:ed)?|cashback|wallet|emi|due date)\b/i,
  /\b(?:out for delivery|shipment|tracking (?:id|number)|courier|dispatched|delivered on)\b/i,
  // Bulk / marketing
  /\b(?:newsletter|unsubscribe|weekly digest|daily digest|webinar|promo(?:tion)?|sale ends|% off|limited time|flash sale|deal of the day)\b/i,
  // Dev-tool notification noise that mentions "review"/"assignment" freely.
  // Replaces the old blanket github.com/gitlab.com domain exclusion — these
  // catch the notifications without also blocking those companies' recruiters.
  /\b(?:pull request|merge request|new issue|commit|workflow run|build (?:failed|passed)|deployment|CI (?:failed|passed)|starred your|forked your)\b/i,
];

// ── No domain-level company exclusion, by design ──
//
// There is deliberately NO list of excluded sender domains here. An earlier
// version had one, and it was wrong twice over: it blocked razorpay.com,
// paytm.com, flipkart.com, amazon.in and friends outright, even though every
// one of those is a real employer whose recruiting mail comes from that exact
// domain — and the same argument applies to github.com, google.com and any
// other company someone might apply to. A sender domain says who sent the
// mail, never what the mail is about, so it cannot distinguish "your payment
// receipt" from "your interview is confirmed" when both come from the same
// company.
//
// Transactional noise is therefore judged on the MESSAGE — the sender
// local-part patterns and subject patterns below — which is the level where
// the distinction actually exists.

function isKnownJobDomain(domain: string): boolean {
  return [...KNOWN_JOB_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Public form of the ATS/assessment-domain check — used as confidence evidence. */
export function isKnownAtsDomain(domain: string): boolean {
  return isKnownJobDomain(domain);
}

function isBulkSender(address: string): boolean {
  const localPart = address.split("@")[0] ?? "";
  return BULK_LOCAL_PART_PATTERNS.some((pattern) => pattern.test(localPart));
}

/** True for mail that must never produce a suggestion, whatever else it looks like. */
export function isExcluded(from: ParsedFromHeader, subject: string): boolean {
  const localPart = from.address.split("@")[0] ?? "";
  if (EXCLUDED_LOCAL_PARTS.some((p) => p.test(localPart))) return true;
  if (EXCLUDED_SUBJECT_PATTERNS.some((p) => p.test(subject))) return true;
  return false;
}

// A deliberately smaller subset of JOB_KEYWORDS for the Gmail-side search
// query. JOB_KEYWORDS is broad because it's evaluated locally and costs
// nothing; embedding all of it in a `q=` parameter would produce an
// unwieldy (and slower) server-side query for no recall benefit — these
// high-signal stems already match the same mail, and anything they over-
// fetch is caught by the full local check in isRelevant().
const QUERY_KEYWORDS = [
  "interview",
  "application",
  "candidate",
  "recruiter",
  "hiring",
  "internship",
  "assessment",
  "offer letter",
  "shortlisted",
  "opportunity",
  "coding test",
  "assignment",
  "onboarding",
  "joining",
];

/** Builds the bounded `messages.list` search query — the outer bound on what's ever fetched at all. */
export function buildSyncQuery(lookbackDays: number = DEFAULT_LOOKBACK_DAYS): string {
  const allDomains = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS, ...JOB_BOARD_DOMAINS];
  const domainClause = `from:(${allDomains.join(" OR ")})`;
  const keywordClause = `subject:(${QUERY_KEYWORDS.map((k) => `"${k}"`).join(" OR ")})`;
  // `-in:sent` drops the user's own outgoing mail at the Gmail level so it
  // isn't even fetched (isRelevant re-checks by address for history.list
  // candidates, which carry no such operator).
  return `(${domainClause} OR ${keywordClause}) -in:sent newer_than:${lookbackDays}d`;
}

export type RelevanceDecision =
  | { relevant: true; rule: "known_job_domain" | "keyword_match"; detail: string }
  | {
      relevant: false;
      rule: "excluded_local_part" | "excluded_subject" | "self_sent" | "bulk_sender" | "no_signal";
      detail: string;
    };

/**
 * The in-app relevance check — applied to every candidate (from either the
 * initial query-bounded fetch or an incremental history.list page) before
 * its full content is ever fetched or a row is persisted.
 *
 * This is the SINGLE source of truth for the decision — `isRelevant` (the
 * hot-path boolean callers actually branch on) and `explainRelevance` (the
 * diagnostic version that names which rule fired, added while investigating
 * a "message never appeared in Inbox" report) both delegate here rather than
 * keeping two copies of the same branching logic that could silently drift
 * apart.
 *
 * Order matters: hard exclusions and the user's own outgoing mail are
 * checked BEFORE the ATS-domain auto-allow, because both categories can
 * legitimately originate from a job-related domain (a bounce from an ATS,
 * an application you sent to a recruiter) and would otherwise be allowed
 * through on the strength of the domain alone.
 */
function decideRelevance(
  from: ParsedFromHeader,
  subject: string,
  options: { googleEmail?: string | null } = {},
): RelevanceDecision {
  const localPart = from.address.split("@")[0] ?? "";

  const matchedLocalPart = EXCLUDED_LOCAL_PARTS.find((p) => p.test(localPart));
  if (matchedLocalPart) {
    return {
      relevant: false,
      rule: "excluded_local_part",
      detail: `sender local-part matched ${matchedLocalPart}`,
    };
  }
  const matchedSubjectPattern = EXCLUDED_SUBJECT_PATTERNS.find((p) => p.test(subject));
  if (matchedSubjectPattern) {
    return {
      relevant: false,
      rule: "excluded_subject",
      detail: `subject matched ${matchedSubjectPattern}`,
    };
  }

  // The user's own outgoing mail. An application you sent that nobody has
  // replied to is not a recruiter update — it belongs on the application
  // timeline, not in the review queue.
  const self = options.googleEmail?.trim().toLowerCase();
  if (self && from.address === self) {
    return {
      relevant: false,
      rule: "self_sent",
      detail: `sender address "${from.address}" equals the connected account's own address — see the self-sent-mail note in this file's header comment`,
    };
  }

  if (isKnownJobDomain(from.domain)) {
    return {
      relevant: true,
      rule: "known_job_domain",
      detail: `"${from.domain}" is a known ATS/assessment/job-board domain`,
    };
  }
  if (isBulkSender(from.address)) {
    return {
      relevant: false,
      rule: "bulk_sender",
      detail: `sender local-part "${localPart}" matches a bulk job-alert pattern`,
    };
  }

  const lowerSubject = subject.toLowerCase();
  const matchedKeyword = JOB_KEYWORDS.find((keyword) => keywordMatch(lowerSubject, keyword));
  if (matchedKeyword) {
    return {
      relevant: true,
      rule: "keyword_match",
      detail: `subject contains job keyword "${matchedKeyword}"`,
    };
  }

  return {
    relevant: false,
    rule: "no_signal",
    detail: "sender isn't a known job domain and the subject matched no job keyword",
  };
}

export function isRelevant(
  from: ParsedFromHeader,
  subject: string,
  options: { googleEmail?: string | null } = {},
): boolean {
  return decideRelevance(from, subject, options).relevant;
}

/** Diagnostic form of {@link isRelevant} — names the exact rule that decided the outcome. */
export function explainRelevance(
  from: ParsedFromHeader,
  subject: string,
  options: { googleEmail?: string | null } = {},
): RelevanceDecision {
  return decideRelevance(from, subject, options);
}
