import { isKnownAtsDomain, keywordMatch } from "@/server/gmail/RelevanceFilter";

// ── Calendar relevance filter (Module 9B, weighted-confidence rewrite) ──
//
// Replaces the earlier discrete-tier waterfall (tier_1..tier_4, each an
// independent "if this exact rule fires, decide and stop" branch) with a
// single weighted score: every signal that matches contributes its weight,
// the total is the suggestion's confidence, and anything at or above
// RELEVANCE_THRESHOLD is relevant. This is deliberately more generous than
// the old rule-based gate — and that's safe now in a way it wasn't before:
// EVERY relevant calendar event becomes a reviewable suggestion (Accept/
// Dismiss), never a silent write (see CalendarSyncService — Tier 1/2
// auto-merge was removed in this same pass). A false positive here costs the
// user one dismiss click, not a wrong silent write, so recall matters more
// than precision now.
//
// Only Tier-4-equivalent (score below threshold) events are ever dropped —
// never stored, never re-suggested — mirroring Module 9A's Stage 0 gate for
// Gmail. `isKnownAtsDomain`/`keywordMatch` are imported directly from
// RelevanceFilter.ts (already Gmail-agnostic); CALENDAR_JOB_KEYWORDS below
// is a SEPARATE, calendar-specific vocabulary (broader and more permissive
// than Gmail's JOB_KEYWORDS) rather than extending the shared list — Gmail's
// own signal tuning must not shift just because Calendar wants more recall.
//
// Window: "today, future, max 60 days ahead" — no backward lookback at all.
// A rolling window around "now", not a fixed range.
export const DEFAULT_LOOKAHEAD_DAYS = 60;

export type CalendarEventInput = {
  title: string | null;
  description: string | null;
  organizerEmail: string | null;
  /** Every attendee's email, excluding the user themself. */
  externalAttendeeEmails: string[];
  icalUid: string | null;
  meetingLink: string | null;
  /** Number of Tier-1-3-eligible instances already seen from this event's recurring series in this sync window — see the series cap below. */
  recurringSeriesInstanceCount?: number;
};

export type RelevanceContext = {
  /** Every `gmail_messages.ical_uid` this user has (from interview-category emails with an .ics attachment) — the strongest identity signal. */
  knownIcsUids: Set<string>;
  /** Every already-tracked application's normalized company domain(s). */
  trackedCompanyDomains: Set<string>;
  /** Every existing interview's meeting link. */
  existingInterviewLinks: Set<string>;
};

export type RelevanceDecision = {
  relevant: boolean;
  /** Weighted sum of every matched signal, capped at 1 — stored on the suggestion/event row as-is, not bucketed. */
  confidence: number;
  /** Every signal that fired, most-significant first — the diagnostic trail ("why was/wasn't this relevant"), logged by CalendarSyncService on every drop. */
  reasons: string[];
};

/** Legacy storage bucket — `calendar_events.relevance_tier` still has a 3-value CHECK constraint from before this rewrite; this buckets the real confidence score into it purely for that column, never used for decisions. */
export function tierForConfidence(confidence: number): "tier_1" | "tier_2" | "tier_3" {
  if (confidence >= 0.85) return "tier_1";
  if (confidence >= 0.55) return "tier_2";
  return "tier_3";
}

// A series producing more than this many candidate instances in one sync
// window is treated as a standing meeting (a weekly 1:1, not an interview)
// and the whole series is dropped — a hard veto, not a weighted signal,
// since no combination of other signals should overturn "this repeats every
// week."
const RECURRING_SERIES_CAP = 3;

// ── Signal weights ───────────────────────────────────────────────────────
// Deterministic-identity signals are set at (or effectively above) the
// threshold alone; everything else is a genuinely weak signal that only
// clears the bar in combination, per the user's "multiple weak signals, not
// one brittle rule" requirement.
const WEIGHT_ICAL_UID_MATCH = 1;
const WEIGHT_EXISTING_LINK_MATCH = 0.9;
const WEIGHT_ATS_DOMAIN = 0.55;
const WEIGHT_TRACKED_COMPANY_DOMAIN = 0.5;
const WEIGHT_VOCAB_MATCH = 0.45;
const WEIGHT_EXTERNAL_PARTY = 0.3;
const WEIGHT_MEETING_LINK = 0.25;

export const RELEVANCE_THRESHOLD = 0.4;

function normalizeDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase().trim() ?? "";
}

// A deliberately broad, calendar-specific vocabulary — recall over
// precision, since every match still has to clear the review gate before it
// touches anything. Word-boundary matched (see keywordMatch), so short
// tokens like "oa" or "hr" don't false-positive inside unrelated words.
export const CALENDAR_JOB_KEYWORDS = [
  // Core lifecycle
  "interview",
  "interview round",
  "interview invitation",
  "interview scheduled",
  "interview rescheduled",
  "interview reminder",
  "technical round",
  "technical interview",
  "technical screen",
  "hr round",
  "hiring manager",
  "hiring manager round",
  "manager round",
  "recruiter call",
  "recruiter discussion",
  "recruiter screen",
  "assessment review",
  "virtual interview",
  "virtual onsite",
  "onsite",
  "loop interview",
  "panel interview",
  "bar raiser",
  "behavioral",
  "behavioural",
  "final round",
  "phone screen",
  "system design",
  "pair programming",
  "coding round",
  "coding challenge",
  "coding test",
  "offer discussion",
  "offer call",
  "offer letter",
  // Scheduling / conferencing — a strong signal in a recruiting context.
  "schedule",
  "scheduling",
  "availability",
  "calendly",
  "google meet",
  "zoom",
  "teams",
  "microsoft teams",
  "webex",
  // Roles / programmes
  "candidate",
  "recruitment",
  "hiring",
  "campus placement",
  "placement cell",
  "campus hiring",
  "intern",
  "internship",
  "graduate program",
  "graduate programme",
  "new grad",
  "ppo",
];

function hasVocabularyMatch(title: string | null, description: string | null): string | null {
  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  return CALENDAR_JOB_KEYWORDS.find((keyword) => keywordMatch(text, keyword)) ?? null;
}

/**
 * Weighted-confidence relevance decision. Every signal below is checked and
 * its weight added if it matches — this is a SUM, not a waterfall, so e.g.
 * an organizer-only invite (external party, no attendees) with a matching
 * title clears the bar on the combination of two 0.3-0.45 signals even
 * though neither alone would. A recurring series over the cap is the one
 * hard veto — everything else is additive.
 */
export function decideRelevance(
  event: CalendarEventInput,
  context: RelevanceContext,
): RelevanceDecision {
  if ((event.recurringSeriesInstanceCount ?? 0) > RECURRING_SERIES_CAP) {
    return {
      relevant: false,
      confidence: 0,
      reasons: ["Recurring series with too many instances — looks like a standing meeting"],
    };
  }

  const reasons: string[] = [];
  let confidence = 0;

  if (event.icalUid && context.knownIcsUids.has(event.icalUid)) {
    confidence += WEIGHT_ICAL_UID_MATCH;
    reasons.push("Matches an interview email's calendar invite (same event ID)");
  }

  if (event.meetingLink && context.existingInterviewLinks.has(event.meetingLink)) {
    confidence += WEIGHT_EXISTING_LINK_MATCH;
    reasons.push("Meeting link matches an interview you're already tracking");
  }

  const attendeeDomains = [
    ...(event.organizerEmail ? [normalizeDomain(event.organizerEmail)] : []),
    ...event.externalAttendeeEmails.map(normalizeDomain),
  ].filter(Boolean);

  const matchesTrackedCompany = attendeeDomains.some((d) => context.trackedCompanyDomains.has(d));
  if (matchesTrackedCompany) {
    confidence += WEIGHT_TRACKED_COMPANY_DOMAIN;
    reasons.push("Attendee/organizer domain matches a company you're tracking");
  }

  if (attendeeDomains.some((d) => isKnownAtsDomain(d))) {
    confidence += WEIGHT_ATS_DOMAIN;
    reasons.push("Attendee/organizer domain is a known ATS/scheduling domain");
  }

  const matchedKeyword = hasVocabularyMatch(event.title, event.description);
  if (matchedKeyword) {
    confidence += WEIGHT_VOCAB_MATCH;
    reasons.push(`Title/description matches interview vocabulary ("${matchedKeyword}")`);
  }

  // An external party — an attendee, or an organizer who isn't the connected
  // user (see CalendarClassifier.organizerEmailForRelevance, which already
  // excludes a self-organized event's own email from this signal).
  const hasExternalParty = attendeeDomains.length > 0;
  if (hasExternalParty) {
    confidence += WEIGHT_EXTERNAL_PARTY;
    reasons.push("An external attendee or organizer is present");
  }

  if (event.meetingLink) {
    confidence += WEIGHT_MEETING_LINK;
    reasons.push("A meeting/conferencing link is attached");
  }

  confidence = Math.min(1, confidence);
  const relevant = confidence >= RELEVANCE_THRESHOLD;

  if (reasons.length === 0) reasons.push("No interview signal found");
  return { relevant, confidence, reasons };
}

/** ISO bounds for events.list's timeMin/timeMax — today through now + lookahead, no backward lookback. */
export function buildSyncWindow(now: Date = new Date()): { timeMin: string; timeMax: string } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMin = startOfToday.toISOString();
  const timeMax = new Date(now.getTime() + DEFAULT_LOOKAHEAD_DAYS * 86_400_000).toISOString();
  return { timeMin, timeMax };
}
