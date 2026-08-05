import type { GmailMessageCategory } from "@/features/gmail/types";
import type { ParsedFromHeader } from "./emailParsing";
import { ATS_DOMAINS, ASSESSMENT_DOMAINS } from "./RelevanceFilter";

// ── Stage 1: deterministic classification (Module 9A) ──
//
// Sender/domain/subject/body rules only — no AI. Each category has a scoring
// function; the highest-scoring category above MIN_CONFIDENCE wins. Below
// that threshold, classify() returns "unknown" with its raw score attached
// so the caller (GmailSyncService) knows whether Stage 2 (AI fallback) is
// worth trying — never a forced best-guess category.
//
// Structured extraction (meeting link, date/time/timezone, assessment
// platform) intentionally stays narrow: an ICS DTSTART or an explicit
// "Month Day, Year HH:MM TZABBREV" pattern in the body is resolved with
// confidence; anything vaguer ("let's chat Tuesday afternoon") is left
// unresolved rather than guessed — the accept-time UI always shows an
// editable date/time/timezone field regardless, so a miss here just means
// the user fills it in themselves, not a wrong value silently committed.

export const MIN_CONFIDENCE = 0.55;

export type ExtractedDetails = {
  meetingLink: string | null;
  scheduledAtIso: string | null;
  timezoneConfident: boolean;
  rawDateText: string | null;
  assessmentPlatform: string | null;
  hasIcsAttachment: boolean;
};

export type ClassificationResult = {
  category: GmailMessageCategory;
  confidence: number;
  extracted: ExtractedDetails;
};

type ClassifyContext = {
  from: ParsedFromHeader;
  subject: string;
  bodyText: string;
  hasIcsAttachment: boolean;
  icsDtStartRaw: string | null;
};

// ── Meeting link extraction ──

const MEETING_LINK_PATTERNS = [
  /https:\/\/[\w.-]*zoom\.us\/j\/\S+/i,
  /https:\/\/meet\.google\.com\/\S+/i,
  /https:\/\/teams\.microsoft\.com\/\S+/i,
  /https:\/\/[\w.-]*webex\.com\/\S+/i,
];

function extractMeetingLink(text: string): string | null {
  for (const pattern of MEETING_LINK_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/[.,)]+$/, "");
  }
  return null;
}

// ── Assessment platform detection (name + Google Forms link pattern) ──

const ASSESSMENT_PLATFORM_NAMES: Record<string, string> = {
  "hackerrank.com": "HackerRank",
  "codility.com": "Codility",
  "testgorilla.com": "TestGorilla",
  "mettl.com": "Mercer | Mettl",
  "hackerearth.com": "HackerEarth",
  "codesignal.com": "CodeSignal",
  "hirevue.com": "HireVue",
};

const GOOGLE_FORM_PATTERN = /https:\/\/(forms\.gle|docs\.google\.com\/forms)\/\S+/i;

function detectAssessmentPlatform(from: ParsedFromHeader, bodyText: string): string | null {
  for (const domain of Object.keys(ASSESSMENT_PLATFORM_NAMES)) {
    if (from.domain === domain || from.domain.endsWith(`.${domain}`)) {
      return ASSESSMENT_PLATFORM_NAMES[domain];
    }
  }
  if (GOOGLE_FORM_PATTERN.test(bodyText)) return "Google Forms";
  return null;
}

// ── Conservative timezone-abbreviation table ──
// Fixed offsets, not DST-aware — acceptable given every extracted date/time
// is always re-confirmed by the user in an editable field at accept-time,
// never silently committed. IST here means India Standard Time (this
// product's overwhelmingly common usage) — known, accepted ambiguity with
// Irish/Israel Standard Time.
const TZ_OFFSET_MINUTES: Record<string, number> = {
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
  GMT: 0,
  UTC: 0,
  IST: 330,
  BST: 60,
};

const DATE_TIME_PATTERN =
  /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\D{1,12}?(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|IST|BST)?\b/;

/** ICS `DTSTART` is an unambiguous absolute instant when present — always preferred over prose parsing. */
const ICS_DTSTART_PATTERN = /DTSTART(?:;TZID=[\w/_+-]+)?:(\d{8}T\d{6}Z?)/;

function parseIcsDtStart(raw: string): string | null {
  const match = raw.match(ICS_DTSTART_PATTERN);
  if (!match) return null;
  const [, stamp] = match;
  const isUtc = stamp.endsWith("Z");
  const digits = isUtc ? stamp.slice(0, -1) : stamp;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(9, 11)}:${digits.slice(11, 13)}:${digits.slice(13, 15)}${isUtc ? "Z" : ""}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractDateTime(bodyText: string): {
  scheduledAtIso: string | null;
  timezoneConfident: boolean;
  rawDateText: string | null;
} {
  const match = bodyText.match(DATE_TIME_PATTERN);
  if (!match) return { scheduledAtIso: null, timezoneConfident: false, rawDateText: null };

  const [raw, datePart, timePart, tzAbbrev] = match;
  const rawTrimmed = raw.trim();
  if (!tzAbbrev) return { scheduledAtIso: null, timezoneConfident: false, rawDateText: rawTrimmed };

  const offsetMinutes = TZ_OFFSET_MINUTES[tzAbbrev.toUpperCase()];
  if (offsetMinutes === undefined) {
    return { scheduledAtIso: null, timezoneConfident: false, rawDateText: rawTrimmed };
  }

  const wallClockAsUtcMs = Date.parse(`${datePart} ${timePart} UTC`);
  if (Number.isNaN(wallClockAsUtcMs)) {
    return { scheduledAtIso: null, timezoneConfident: false, rawDateText: rawTrimmed };
  }

  const utcMs = wallClockAsUtcMs - offsetMinutes * 60_000;
  return {
    scheduledAtIso: new Date(utcMs).toISOString(),
    timezoneConfident: true,
    rawDateText: rawTrimmed,
  };
}

// ── Category scoring rules ──
// Checked in priority order (most distinctive/highest-stakes phrases first)
// so a message that loosely mentions several topics still lands on its
// single best-fitting category rather than an arbitrary first match.

const REJECTION_PHRASES = [
  "unfortunately",
  "regret to inform",
  "not moving forward",
  "will not be moving forward",
  "decided not to proceed",
  "other candidates",
  "pursue other candidates",
  "not selected",
];

const OFFER_PHRASES = [
  "pleased to offer",
  "offer of employment",
  "job offer",
  "extend an offer",
  "welcome to the team",
  "compensation package",
];

const INTERVIEW_PHRASES = [
  "interview",
  "schedule a call",
  "next round",
  "meet the team",
  "technical screen",
  "phone screen",
];

const ASSIGNMENT_PHRASES = ["assignment", "take-home", "take home", "case study", "project task"];

const FOLLOW_UP_PHRASES = [
  "following up",
  "please respond by",
  "confirm your availability",
  "let us know by",
  "reply by",
  "kindly revert",
];

const APPLICATION_CONFIRMATION_PHRASES = [
  "thank you for applying",
  "we received your application",
  "application has been received",
  "application confirmation",
  "successfully submitted",
];

const APPLICATION_UPDATE_PHRASES = [
  "application status",
  "update on your application",
  "status update",
];

function scorePhrases(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  const hits = phrases.filter((p) => lower.includes(p)).length;
  if (hits === 0) return 0;
  return Math.min(0.5 + hits * 0.2, 0.95);
}

// ── Expanded vocabulary (see migration 20260809000001) ──
//
// These split categories that were previously conflated. The distinctions
// are the ones a candidate acts on differently: an interview INVITATION
// needs a reply, a SCHEDULED confirmation needs nothing, a RESCHEDULE
// changes a date already in the calendar, and a REMINDER is pure timing.
// Scored alongside the originals in one flat candidate list — the most
// specific phrasing wins on score rather than on rule ordering.

const INTERVIEW_SCHEDULED_PHRASES = [
  "interview is scheduled",
  "interview has been scheduled",
  "your interview is confirmed",
  "interview confirmation",
  "confirmed your interview",
  "is now scheduled",
];

const INTERVIEW_RESCHEDULED_PHRASES = [
  "rescheduled",
  "reschedule",
  "new time for your interview",
  "interview has been moved",
  "change of schedule",
  "updated interview time",
];

const INTERVIEW_REMINDER_PHRASES = [
  "reminder",
  "upcoming interview",
  "interview tomorrow",
  "starts in",
  "don't forget your interview",
];

const OA_INVITATION_PHRASES = [
  "invited to take",
  "invitation to complete",
  "you have been invited",
  "complete the online assessment",
  "start your assessment",
  "assessment link",
  "take the test",
];

const APPLICATION_SUBMITTED_PHRASES = [
  "application submitted",
  "you applied",
  "you have applied",
  "your application was submitted",
  "submitted successfully",
];

const RECRUITER_VIEWED_PHRASES = [
  "viewed your application",
  "viewed your profile",
  "your application was viewed",
  "recruiter viewed",
  "your profile was viewed",
];

const OFFER_ACCEPTED_PHRASES = [
  "you have accepted",
  "offer accepted",
  "acceptance of the offer",
  "thank you for accepting",
  "we are delighted you accepted",
];

const OFFER_DECLINED_PHRASES = [
  "you have declined",
  "offer declined",
  "declined the offer",
  "sorry to hear you",
  "withdrawn your acceptance",
];

const WAITLIST_PHRASES = [
  "waitlist",
  "wait list",
  "waitlisted",
  "on hold",
  "keep your application on file",
  "future opportunities",
  "talent pool",
];

const BACKGROUND_VERIFICATION_PHRASES = [
  "background verification",
  "background check",
  "bgv",
  "employment verification",
  "verify your documents",
  "identity verification",
];

const REFERENCE_CHECK_PHRASES = [
  "reference check",
  "provide references",
  "your referees",
  "reference request",
  "professional references",
];

const JOINING_FORMALITIES_PHRASES = [
  "joining formalities",
  "onboarding formalities",
  "date of joining",
  "joining date",
  "pre-onboarding",
  "documents required for joining",
  "welcome aboard",
  "onboarding process",
];

const GENERAL_RECRUITER_PHRASES = [
  "recruiter",
  "talent acquisition",
  "hiring team",
  "your candidacy",
  "your application",
];

function classifyCategory(ctx: ClassifyContext): {
  category: GmailMessageCategory;
  confidence: number;
} {
  const text = `${ctx.subject} ${ctx.bodyText}`;
  const assessmentPlatform = detectAssessmentPlatform(ctx.from, ctx.bodyText);

  const candidates: { category: GmailMessageCategory; confidence: number }[] = [
    { category: "rejection", confidence: scorePhrases(text, REJECTION_PHRASES) },
    { category: "offer", confidence: scorePhrases(text, OFFER_PHRASES) },
    { category: "offer_accepted", confidence: scorePhrases(text, OFFER_ACCEPTED_PHRASES) },
    { category: "offer_declined", confidence: scorePhrases(text, OFFER_DECLINED_PHRASES) },
    { category: "waitlist", confidence: scorePhrases(text, WAITLIST_PHRASES) },
    {
      category: "online_assessment",
      confidence: assessmentPlatform
        ? Math.max(0.75, scorePhrases(text, ["assessment", "coding test", "online test"]))
        : scorePhrases(text, ["assessment", "coding test", "online test", "coding challenge"]),
    },
    { category: "oa_invitation", confidence: scorePhrases(text, OA_INVITATION_PHRASES) },
    {
      category: "interview_invitation",
      confidence:
        ctx.hasIcsAttachment || extractMeetingLink(ctx.bodyText)
          ? Math.max(0.7, scorePhrases(text, INTERVIEW_PHRASES))
          : scorePhrases(text, INTERVIEW_PHRASES),
    },
    {
      category: "interview_scheduled",
      confidence: scorePhrases(text, INTERVIEW_SCHEDULED_PHRASES),
    },
    {
      category: "interview_rescheduled",
      confidence: scorePhrases(text, INTERVIEW_RESCHEDULED_PHRASES),
    },
    {
      // A reminder must actually be about an interview — "reminder" alone is
      // far too common a word to stand on its own.
      category: "interview_reminder",
      confidence: /\binterview\b/i.test(text) ? scorePhrases(text, INTERVIEW_REMINDER_PHRASES) : 0,
    },
    { category: "assignment", confidence: scorePhrases(text, ASSIGNMENT_PHRASES) },
    { category: "follow_up_required", confidence: scorePhrases(text, FOLLOW_UP_PHRASES) },
    {
      category: "application_submitted",
      confidence: scorePhrases(text, APPLICATION_SUBMITTED_PHRASES),
    },
    {
      category: "application_confirmation",
      confidence: scorePhrases(text, APPLICATION_CONFIRMATION_PHRASES),
    },
    { category: "recruiter_viewed", confidence: scorePhrases(text, RECRUITER_VIEWED_PHRASES) },
    { category: "application_update", confidence: scorePhrases(text, APPLICATION_UPDATE_PHRASES) },
    {
      category: "background_verification",
      confidence: scorePhrases(text, BACKGROUND_VERIFICATION_PHRASES),
    },
    { category: "reference_check", confidence: scorePhrases(text, REFERENCE_CHECK_PHRASES) },
    {
      category: "joining_formalities",
      confidence: scorePhrases(text, JOINING_FORMALITIES_PHRASES),
    },
    {
      // Deliberately capped below MIN_CONFIDENCE-by-itself territory: this is
      // the floor for "clearly recruiter mail, nothing more specific matched",
      // and must never outrank a real category.
      category: "general_recruiter_communication",
      confidence: Math.min(scorePhrases(text, GENERAL_RECRUITER_PHRASES), 0.6),
    },
  ];

  // Deliberately no dedicated deterministic rule for "recruiter_reply" — it's
  // the least keyword-distinctive category (a generic "just checking in"
  // reply has no reliable phrase signature), so a message that clears Stage 0
  // relevance but matches none of the categories above correctly falls
  // through to Stage 2 (AI, which can use judgment on the actual content) or
  // "unknown" — exactly the "AI resolves ambiguous cases" / "prefer Unknown
  // over a wrong classification" design, not a gap to patch with a guess.
  const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return best.confidence > 0 ? best : { category: "unknown", confidence: 0 };
}

/**
 * Classifies one email. `bodyText` should be the fuller body when available
 * (from GmailApiClient.getFullMessage) — falls back to just the snippet for
 * a cheaper pass when full content hasn't been fetched.
 */
export function classify(input: {
  from: ParsedFromHeader;
  subject: string;
  bodyText: string;
  hasIcsAttachment: boolean;
  icsRawText?: string | null;
}): ClassificationResult {
  const ctx: ClassifyContext = {
    from: input.from,
    subject: input.subject,
    bodyText: input.bodyText,
    hasIcsAttachment: input.hasIcsAttachment,
    icsDtStartRaw: input.icsRawText ?? null,
  };

  const { category, confidence } = classifyCategory(ctx);

  const icsDate = ctx.icsDtStartRaw ? parseIcsDtStart(ctx.icsDtStartRaw) : null;
  const proseDate = icsDate ? null : extractDateTime(ctx.bodyText);

  const extracted: ExtractedDetails = {
    meetingLink: extractMeetingLink(ctx.bodyText),
    scheduledAtIso: icsDate ?? proseDate?.scheduledAtIso ?? null,
    timezoneConfident: Boolean(icsDate) || Boolean(proseDate?.timezoneConfident),
    rawDateText: proseDate?.rawDateText ?? null,
    assessmentPlatform: detectAssessmentPlatform(ctx.from, ctx.bodyText),
    hasIcsAttachment: ctx.hasIcsAttachment,
  };

  if (confidence < MIN_CONFIDENCE) {
    return { category: "unknown", confidence, extracted };
  }
  return { category, confidence, extracted };
}
